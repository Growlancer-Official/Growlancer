-- ═══════════════════════════════════════════════════════════════════════════
-- WAVE 7B / BATCH 7B — Consolidated escrow-release money migration
--   MR-18  ← MONEY-003  (systemic regression: later CREATE OR REPLACE overrode
--                        earlier money fixes — re-apply authoritative definitions)
--   MR-20  ← MONEY-005  (release_escrow delegated to an end-user auth-checked
--                        RPC → failed when called by the service-role cron)
--   MR-21  ← RLS-003 + MONEY-006 (release_escrow computed the freelancer payout
--                        from a fee-INCLUSIVE pool instead of the fee-exclusive base)
--
-- ROOT CAUSE (migration-order regression):
--   * 20261211000000_auto_release_milestones.sql defined release_escrow WITH a
--     service-role/cron bypass (v_is_service_role) AND a fee-EXCLUSIVE payout
--     (v_net := v_gross - v_fee).
--   * 20261220000000_freelancer_full_payout_model.sql (LATER, therefore
--     authoritative) re-created release_escrow WITHOUT the bypass and with a
--     fee-INCLUSIVE payout (v_net := v_gross). This silently reverted both fixes
--     and broke the cron path in 20261217000000_full_contract_auto_release.sql:197
--     which calls  SELECT public.release_escrow(p_contract_id, NULL)  relying on
--     the service-role bypass that no longer existed.
--
-- FIX (single ordered migration, append-only):
--   1. NEW internal helper  public._release_escrow_internal(uuid)
--        – contains ALL the release mechanics, performs NO end-user auth check
--          (it is not reachable by end users — service_role only), so a cron
--          service-role context can drive an automatic release.
--   2. public.release_escrow(uuid, uuid)  — public RPC entry point
--        – performs its OWN auth check (owner, or the unforgeable service-role
--          JWT role claim), then delegates to the internal helper.
--        – signature and BOOLEAN return shape are UNCHANGED.
--   3. public._book_escrow_release(uuid, numeric) — re-stated so its booking is
--        consistent with the fee-EXCLUSIVE payout (freelancer_amount = net,
--        platform_revenue = fee, invoice total = the escrow pool). Ledger identity
--        net + fee = gross now holds.
--
-- SAFETY / INVARIANTS PRESERVED:
--   * No signature or return-type change for any public function.
--   * No historical migration is edited, deleted or renumbered.
--   * Auth/authz tightened only (the service-role claim is set by Supabase Auth
--     and cannot be spoofed by a browser; NULL client id fails closed otherwise).
--   * Idempotent (CREATE OR REPLACE + idempotent grants).
--   * Transaction semantics unchanged (row locks retained on contracts + escrow).
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) _release_escrow_internal — mechanics only, NO end-user auth check
--    Callable directly ONLY by service_role (cron / webhook). The public
--    release_escrow wrapper below calls it after its own ownership check.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._release_escrow_internal(
  p_contract_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_escrow RECORD;
  v_gross NUMERIC;
  v_fee NUMERIC;
  v_net NUMERIC;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  SELECT * INTO v_escrow
  FROM public.escrow
  WHERE contract_id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found for this contract';
  END IF;

  IF v_escrow.status <> 'funded' THEN
    RAISE EXCEPTION 'Escrow is not in funded state';
  END IF;

  -- Actual escrow pool — includes any extra-revision top-ups (mark_revision_paid
  -- increments escrow.amount). NEVER release less than what was truly paid in.
  v_gross := COALESCE(v_escrow.amount, v_contract.amount);
  -- Platform fee: stored contract fee when there are no revisions
  -- (backwards-compatible), else the standard 5% of the true pool.
  IF v_gross <= COALESCE(v_contract.amount, 0) THEN
    v_fee := COALESCE(v_contract.platform_fee, ROUND(v_gross * 0.05, 2));
  ELSE
    v_fee := ROUND(v_gross * 0.05, 2);
  END IF;
  -- ★ MR-21 (RLS-003 / MONEY-006): pay from the fee-EXCLUSIVE base so the
  -- platform retains its commission (net + fee = gross; ledger identity holds).
  v_net := GREATEST(v_gross - v_fee, 0);

  UPDATE public.escrow
  SET status = 'released', released_at = NOW()
  WHERE contract_id = p_contract_id;

  UPDATE public.contracts
  SET status = 'completed', escrow_funded = false, updated_at = NOW()
  WHERE id = p_contract_id;

  INSERT INTO public.transactions (
    user_id, contract_id, escrow_id, type, amount, status, source, description
  ) VALUES (
    v_contract.freelancer_id, p_contract_id, v_escrow.id, 'credit',
    v_net, 'completed', 'escrow',
    'Escrow release (incl. extra revisions) for contract #' || p_contract_id::TEXT
  );

  UPDATE public.wallets
  SET balance = balance + v_net,
      updated_at = NOW()
  WHERE user_id = v_contract.freelancer_id;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (v_contract.freelancer_id, v_net);
  END IF;

  UPDATE public.wallets
  SET escrow_balance = GREATEST(escrow_balance - COALESCE(v_escrow.amount, 0), 0),
      updated_at = NOW()
  WHERE user_id = v_contract.client_id;

  -- Book commission + invoice + ledger on the ACTUAL gross (escrow pool).
  PERFORM public._book_escrow_release(p_contract_id, NULL);

  RETURN TRUE;
END $$;

-- Lock the internal helper down: no end-user reachability.
REVOKE ALL ON FUNCTION public._release_escrow_internal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._release_escrow_internal(UUID) FROM anon;
REVOKE ALL ON FUNCTION public._release_escrow_internal(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._release_escrow_internal(UUID) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) release_escrow — public entry point (signature + BOOLEAN unchanged)
--    MR-20: re-add the service-role/cron bypass, then delegate to the internal
--    helper after the ownership check. All other callers must be the owner.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_is_service_role BOOLEAN;
BEGIN
  -- Service-role (cron / webhook / admin) bypass: the JWT role claim is set by
  -- Supabase Auth only — browsers cannot spoof it. Everything else must match.
  v_is_service_role := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';

  IF NOT v_is_service_role AND p_client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  IF NOT v_is_service_role AND v_contract.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
  END IF;

  -- Delegate the actual money movement to the internal helper (no auth checks
  -- inside — it relies on THIS gate + row locks it takes itself).
  RETURN public._release_escrow_internal(p_contract_id);
END $$;

REVOKE ALL ON FUNCTION public.release_escrow(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_escrow(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_escrow(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_escrow(UUID, UUID) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) _book_escrow_release — re-stated so booking matches the fee-exclusive
--    payout (MR-18 re-apply + MR-21 consistency). Service-role only.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._book_escrow_release(
  p_contract_id UUID,
  p_amount NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_revenue_id UUID;
  v_invoice_id UUID;
  v_invoice_no TEXT;
  v_project_title TEXT;
  v_gross NUMERIC;
  v_fee NUMERIC;
  v_net NUMERIC;
  v_currency TEXT;
  v_escrow_amount NUMERIC;
BEGIN
  -- Idempotency: a contract is booked exactly once (release / milestone final)
  SELECT id INTO v_revenue_id
  FROM public.platform_revenue
  WHERE contract_id = p_contract_id AND source = 'escrow';

  IF v_revenue_id IS NOT NULL THEN
    SELECT invoice_id INTO v_invoice_id FROM public.platform_revenue WHERE id = v_revenue_id;
    RETURN v_invoice_id;
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Actual escrow pool (base + extra revisions). Falls back to contract.amount
  -- when the escrow row is missing (defensive).
  SELECT COALESCE(amount, v_contract.amount) INTO v_escrow_amount
  FROM public.escrow WHERE contract_id = p_contract_id;

  -- Always book on the ACTUAL amount released. The caller may pass a partial
  -- amount (milestone release / dispute) but NEVER beyond the escrow pool.
  v_gross := LEAST(COALESCE(p_amount, v_escrow_amount), v_escrow_amount);
  -- Fee: stored contract fee for a standard full release (backwards-compatible),
  -- else the standard 5% of the true released pool (partial / revision cases).
  IF p_amount IS NULL AND v_gross <= COALESCE(v_contract.amount, 0) THEN
    v_fee := COALESCE(v_contract.platform_fee, ROUND(v_gross * 0.05, 2));
  ELSE
    v_fee := ROUND(v_gross * 0.05, 2);
  END IF;
  -- ★ MR-21: freelancer receives the pool MINUS the platform fee (fee-exclusive).
  v_net := GREATEST(v_gross - v_fee, 0);

  -- Currency derived from the client's wallet (INR for Razorpay by default)
  SELECT COALESCE(currency, 'INR') INTO v_currency
  FROM public.wallets WHERE user_id = v_contract.client_id;
  v_currency := COALESCE(v_currency, 'INR');

  SELECT COALESCE(title, 'Contract') INTO v_project_title
  FROM public.projects WHERE id = v_contract.project_id;

  v_invoice_no := 'GL-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.invoice_seq')::text, 6, '0');

  -- 1. Commission ledger
  INSERT INTO public.platform_revenue (
    contract_id, client_id, freelancer_id,
    gross_amount, platform_fee, freelancer_amount,
    status, source, released_at
  ) VALUES (
    p_contract_id, v_contract.client_id, v_contract.freelancer_id,
    v_gross, v_fee, v_net,
    'released', 'escrow', now()
  ) RETURNING id INTO v_revenue_id;

  -- 2. Invoice — subtotal = freelancer amount (net), platform fee added on top,
  --    total = the escrow pool actually charged (net + fee = gross).
  INSERT INTO public.invoices (
    invoice_number, contract_id, client_id, freelancer_id, project_title,
    subtotal, platform_fee, freelancer_amount, total,
    payment_method, currency, status, issued_at, paid_at
  ) VALUES (
    v_invoice_no, p_contract_id, v_contract.client_id, v_contract.freelancer_id, v_project_title,
    v_net, v_fee, v_net, v_gross,
    'razorpay', v_currency, 'paid', now(), now()
  ) RETURNING id INTO v_invoice_id;

  UPDATE public.platform_revenue SET invoice_id = v_invoice_id WHERE id = v_revenue_id;

  -- 3. Double-entry ledger (net + fee = gross)
  INSERT INTO public.ledger_entries (account, direction, amount, entity_type, entity_id, description) VALUES
    ('escrow', 'debit', v_gross, 'contract', p_contract_id::TEXT,
     'Escrow released for contract #' || p_contract_id::TEXT),
    ('platform_revenue', 'credit', v_fee, 'invoice', v_invoice_id::TEXT,
     'Platform commission (invoice ' || v_invoice_no || ')'),
    ('wallet', 'credit', v_net, 'contract', p_contract_id::TEXT,
     'Freelancer wallet credit for contract #' || p_contract_id::TEXT);

  -- 4. Audit trail — must NEVER block the financial release
  BEGIN
    PERFORM public.insert_payment_audit_log(
      p_action => 'escrow_released_booked',
      p_entity_type => 'contract',
      p_entity_id => p_contract_id::TEXT,
      p_provider => 'razorpay',
      p_amount => v_gross,
      p_currency => v_currency,
      p_metadata => jsonb_build_object(
        'invoice_id', v_invoice_id, 'invoice_number', v_invoice_no,
        'platform_fee', v_fee, 'freelancer_amount', v_net
      ),
      p_user_id => v_contract.client_id
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 5. Notifications (client + freelancer) — also non-fatal
  BEGIN
    PERFORM public._refund_notify(v_contract.client_id, 'payment', 'Payment released — invoice issued',
      'Escrow for contract #' || p_contract_id::TEXT || ' was released. Invoice ' || v_invoice_no || ' is now available.',
      '/client/payments', jsonb_build_object('contract_id', p_contract_id, 'invoice_id', v_invoice_id));
    PERFORM public._refund_notify(v_contract.freelancer_id, 'payment', 'Payment received — invoice issued',
      'You received ' || v_net::TEXT || ' for contract #' || p_contract_id::TEXT || '. Invoice ' || v_invoice_no || ' is available in your wallet.',
      '/dashboard/wallet', jsonb_build_object('contract_id', p_contract_id, 'invoice_id', v_invoice_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_invoice_id;
END $$;

-- Grants preserved (service-role + owner only)
REVOKE ALL ON FUNCTION public._book_escrow_release(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._book_escrow_release(UUID, NUMERIC) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- LIVE-DB VERIFICATION REQUIRED
-- Run the following against the live/authoritative database AFTER applying.
-- ═══════════════════════════════════════════════════════════════════════════

-- (V1) MR-20 — no money function may delegate to the auth-checked wallet RPC.
--      EXPECT: 0 rows.
--   SELECT p.proname
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND pg_get_functiondef(p.oid) ~ 'PERFORM\s+(public\.)?update_wallet_balance';

-- (V2) MR-20 — release_escrow must carry the service-role/cron bypass.
--      EXPECT: t
--   SELECT pg_get_functiondef('public.release_escrow(uuid,uuid)'::regprocedure)
--            LIKE '%service_role%' AS has_bypass;

-- (V3) MR-20 — the internal helper must exist and be locked to service_role only.
--      EXPECT: one row, prosecdef = t, and NO grant to authenticated/anon.
--   SELECT p.proname, p.prosecdef, p.proconfig
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = '_release_escrow_internal';
--   SELECT grantee, privilege_type
--     FROM information_schema.routine_privileges
--    WHERE routine_name = '_release_escrow_internal';

-- (V4) MR-21 — release_escrow must compute the fee-EXCLUSIVE payout.
--      EXPECT: t
--   SELECT pg_get_functiondef('public.release_escrow(uuid,uuid)'::regprocedure)
--            ~ 'v_net\s*:=\s*v_gross\s*-\s*v_fee' AS fee_exclusive;

-- (V5) MR-21 / MR-18 — ledger identity per released contract.
--      EXPECT: every row satisfies credit == charge (identity holds).
--   WITH rel AS (
--     SELECT pr.contract_id,
--            SUM(pr.platform_fee)     AS platform_revenue,
--            SUM(pr.freelancer_amount) AS freelancer_credit
--       FROM public.platform_revenue pr
--      WHERE pr.source = 'escrow'
--      GROUP BY pr.contract_id
--   )
--   SELECT r.contract_id,
--          r.freelancer_credit,
--          r.platform_revenue,
--          r.freelancer_credit + r.platform_revenue AS distributed,
--          e.amount                                 AS client_total_charged,
--          (r.freelancer_credit + r.platform_revenue = e.amount) AS identity_ok
--     FROM rel r JOIN public.escrow e ON e.contract_id = r.contract_id
--    ORDER BY identity_ok, r.contract_id;

-- (V6) MR-20 — cron path smoke test (service_role only; wrap in a transaction
--      and ROLLBACK so nothing is persisted).
--   BEGIN;
--     SELECT set_config('request.jwt.claim.role', 'service_role', true);
--     SELECT public.release_escrow('<FUNDED_CONTRACT_UUID>'::uuid, NULL);
--   ROLLBACK;
