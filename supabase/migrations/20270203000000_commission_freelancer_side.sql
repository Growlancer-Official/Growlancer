-- ═══════════════════════════════════════════════════════════════════════════
-- CANONICAL COMMISSION MODEL — freelancer-side 5 %
-- Migration 20270203000000
--
-- POLICY (founder instruction, 21 Oct 2026 — §2 of the MVP master prompt):
--   * The client pays ONLY the agreed project/service amount. No platform
--     commission is added at checkout.
--   * Growlancer's 5 % is deducted from the freelancer's eligible gross when
--     the earnings are actually RELEASED (earned), never at funding time.
--   * Freelancer net = released gross − 5 %. Tips are part of the released
--     pool today, so they are commissionable; that treatment is flagged for
--     founder/legal sign-off in IMPLEMENTATION_PLAN.md rather than silently
--     changed here.
--
-- WHAT WAS WRONG (measured in this tree):
--   The checkout added 5 % on top (razorpay order = amount + platform_fee) AND
--   `_release_escrow_internal` withheld another 5 % from the freelancer
--   (`v_net := v_gross - v_fee`). A ₹5,000 contract therefore charged the
--   client ₹5,250, paid the freelancer ₹4,750 and booked only ₹250 of revenue:
--   an effective ~10 % take with ₹250 of real money unrepresented.
--
-- INVARIANTS (assert these in an end-to-end test after applying):
--   client_charged            = contracts.amount            (the pool)
--   platform_revenue.platform_fee = ROUND(pool * 0.05, 2)
--   platform_revenue.freelancer_amount = pool - fee
--   ledger: escrow debit pool = wallet credit net + platform_revenue credit fee
--   invoice.total             = pool          (what the client actually paid)
--   invoice.platform_fee      = 0             (never charged to the client)
--
-- BACKWARD COMPATIBILITY: already-paid contracts keep their original rows —
-- nothing is rewritten. `contracts.platform_fee` keeps its historical value on
-- funded contracts and is only zeroed on contracts that were never funded, so
-- the checkout and the RPCs agree on "client pays the agreed amount".
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 0) One canonical calculation. Every path (release, booking, UI helper)
--    derives the commission from this instead of re-typing * 0.05.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_commission(p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN COALESCE(p_amount, 0) <= 0 THEN 0::numeric
           ELSE ROUND(p_amount * 0.05, 2)
         END;
$$;

REVOKE ALL ON FUNCTION public.platform_commission(NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_commission(NUMERIC) TO service_role;

COMMENT ON FUNCTION public.platform_commission(NUMERIC) IS
  'Growlancer commission: 5% of the released freelancer gross. Never added to the client checkout.';

-- ────────────────────────────────────────────────────────────────────────────
-- 1) _release_escrow_internal — mechanics only, NO end-user auth check.
--    The freelancer is credited the pool MINUS the 5 % commission.
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
  -- increments escrow.amount). Never release less than what was truly paid in.
  v_gross := COALESCE(v_escrow.amount, v_contract.amount);

  -- ★ FREELANCER-SIDE COMMISSION: 5 % of the released gross is withheld here,
  --   at the moment the freelancer actually earns it. The client was charged
  --   the pool only, so `net + fee = pool` balances exactly.
  v_fee := public.platform_commission(v_gross);
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
    'Escrow release (net of 5% commission) for contract #' || p_contract_id::TEXT
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

  -- Book revenue + invoice + ledger (freelancer-side shape).
  PERFORM public._book_escrow_release(p_contract_id, NULL);

  RETURN TRUE;
END $$;

-- Lock the internal helper down: no end-user reachability.
REVOKE ALL ON FUNCTION public._release_escrow_internal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._release_escrow_internal(UUID) FROM anon;
REVOKE ALL ON FUNCTION public._release_escrow_internal(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._release_escrow_internal(UUID) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) _book_escrow_release — books the commission on the RELEASED gross:
--      revenue : gross = released pool, fee = 5 % of it, freelancer = pool − fee
--      invoice : subtotal = pool, platform_fee = 0, total = pool (client paid)
--      ledger  : escrow debit pool, revenue credit fee, wallet credit net
--    Idempotency unchanged: one booking per contract, keyed on
--    platform_revenue(contract_id, source='escrow').
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
  -- amount (milestone/dispute) but NEVER beyond the escrow pool.
  v_gross := LEAST(COALESCE(p_amount, v_escrow_amount), v_escrow_amount);

  -- ★ 5 % of what the freelancer earned — the client paid the pool, never a fee.
  v_fee := public.platform_commission(v_gross);
  v_net := GREATEST(v_gross - v_fee, 0);

  -- Currency derived from the client's wallet (INR for Razorpay by default)
  SELECT COALESCE(currency, 'INR') INTO v_currency
  FROM public.wallets WHERE user_id = v_contract.client_id;
  v_currency := COALESCE(v_currency, 'INR');

  SELECT COALESCE(title, 'Contract') INTO v_project_title
  FROM public.projects WHERE id = v_contract.project_id;

  v_invoice_no := 'GL-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.invoice_seq')::text, 6, '0');

  -- 1. Commission record — amount the freelancer actually keeps, after 5 %.
  INSERT INTO public.platform_revenue (
    contract_id, client_id, freelancer_id,
    gross_amount, platform_fee, freelancer_amount,
    status, source, released_at
  ) VALUES (
    p_contract_id, v_contract.client_id, v_contract.freelancer_id,
    v_gross, v_fee, v_net,
    'released', 'escrow', now()
  ) RETURNING id INTO v_revenue_id;

  -- 2. Invoice — what the CLIENT actually paid: the contract amount, no fee.
  INSERT INTO public.invoices (
    invoice_number, contract_id, client_id, freelancer_id, project_title,
    subtotal, platform_fee, freelancer_amount, total,
    payment_method, currency, status, issued_at, paid_at
  ) VALUES (
    v_invoice_no, p_contract_id, v_contract.client_id, v_contract.freelancer_id, v_project_title,
    v_gross, 0, v_net, v_gross,
    'razorpay', v_currency, 'paid', now(), now()
  ) RETURNING id INTO v_invoice_id;

  UPDATE public.platform_revenue SET invoice_id = v_invoice_id WHERE id = v_revenue_id;

  -- 3. Ledger — balances exactly: escrow debit pool = wallet credit net +
  --    platform_revenue credit fee.
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
        'platform_fee', v_fee, 'freelancer_amount', v_net,
        'client_charged', v_gross, 'commission_model', 'freelancer_side_5pct'
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
      'You received ' || to_char(v_net, 'FM9,999,999.00') || ' (after the 5% platform commission) for contract #'
        || p_contract_id::TEXT || '. Invoice ' || v_invoice_no || ' is available in your wallet.',
      '/dashboard/wallet', jsonb_build_object('contract_id', p_contract_id, 'invoice_id', v_invoice_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_invoice_id;
END $$;

-- Grants preserved (service-role + owner only)
REVOKE ALL ON FUNCTION public._book_escrow_release(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._book_escrow_release(UUID, NUMERIC) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) accept_invite_create_contract — the stored freelancer_amount must be the
--    NET the freelancer will receive (pool − 5 %), because the Contracts and
--    Wallet screens render this column. platform_fee is now 0: nothing is
--    charged to the client on top.
--    Body re-stated from 20261216000000 with ONLY those two values changed
--    (dedup + sibling-proposal sync untouched).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_invite_create_contract(p_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_project record;
  v_amount integer;
  v_fee integer;
  v_net integer;
  v_contract_id uuid;
BEGIN
  -- ── Load + validate the invite (server-side, never trust the caller) ─────
  SELECT * INTO v_invite FROM public.invites WHERE id = p_invite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF v_invite.freelancer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This invite does not belong to you';
  END IF;
  -- Declined/expired invites are final; ALREADY-ACCEPTED invites are a normal
  -- re-click after the client hired this freelancer via a proposal (the invite
  -- was auto-accepted then) — that is idempotent, NOT an error.
  IF v_invite.status = 'declined' THEN
    RAISE EXCEPTION 'Invite has already been declined';
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  -- ── Project must exist ───────────────────────────────────────────────────
  SELECT * INTO v_project FROM public.projects WHERE id = v_invite.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  -- ── DEDUP: freelancer already hired for this project (via a proposal) ────
  -- One hire per project: return the existing contract instead of creating a
  -- second one. The invite is still flipped to 'accepted' so the client sees
  -- the hire on BOTH the invite and the proposal surface in real time.
  SELECT id INTO v_contract_id
  FROM public.contracts
  WHERE project_id = v_invite.project_id
    AND freelancer_id = v_invite.freelancer_id
    AND status IN ('pending', 'active')
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF v_contract_id IS NOT NULL THEN
    UPDATE public.invites SET status = 'accepted', updated_at = now()
    WHERE id = p_invite_id;
    UPDATE public.projects SET status = 'in_progress', updated_at = now()
    WHERE id = v_project.id;
    -- Sync sibling proposal (if any) → 'hired' so BOTH surfaces show the hire
    UPDATE public.proposals SET status = 'hired', updated_at = now()
    WHERE project_id = v_invite.project_id
      AND freelancer_id = v_invite.freelancer_id
      AND status = 'pending';
    RETURN v_contract_id;
  END IF;

  -- ── Sync sibling proposal (if any) → 'hired' so BOTH surfaces show it ────
  UPDATE public.proposals SET status = 'hired', updated_at = now()
  WHERE project_id = v_invite.project_id
    AND freelancer_id = v_invite.freelancer_id
    AND status = 'pending';

  -- ── Amount computed server-side from the project budget ──────────────────
  v_amount := COALESCE(v_project.budget_max, v_project.budget_min, 500);
  IF v_amount <= 0 THEN
    v_amount := 500;
  END IF;
  v_fee := GREATEST(0, round(v_amount * 0.05)::integer);
  v_net := GREATEST(v_amount - v_fee, 0);

  -- ── Create contract (escrow starts unfunded; client funds it later) ──────
  -- ★ FREELANCER-SIDE MODEL: the client pays v_amount; the freelancer receives
  --   v_amount − 5 %. platform_fee stays 0 because nothing is added on top.
  INSERT INTO public.contracts (
    project_id, client_id, freelancer_id,
    amount, platform_fee, freelancer_amount,
    status, escrow_funded
  ) VALUES (
    v_project.id, v_project.client_id, v_invite.freelancer_id,
    v_amount, 0, v_net,
    'pending', false
  )
  RETURNING id INTO v_contract_id;

  -- ── Workspace so both parties can collaborate immediately ────────────────
  INSERT INTO public.workspaces (
    contract_id, project_id, client_id, lead_freelancer_id, status
  ) VALUES (
    v_contract_id, v_project.id, v_project.client_id, v_invite.freelancer_id, 'active'
  )
  ON CONFLICT (contract_id) DO NOTHING;

  -- ── Flip invite + project status atomically ──────────────────────────────
  UPDATE public.invites SET status = 'accepted', updated_at = now()
  WHERE id = p_invite_id;
  UPDATE public.projects SET status = 'in_progress', updated_at = now()
  WHERE id = v_project.id;

  RETURN v_contract_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) fund_escrow_from_wallet — the client's wallet is debited the POOL only.
--    Re-stated from 20270119000004 (formatted notification text preserved).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fund_escrow_from_wallet(
  p_contract_id uuid,
  p_milestone_indices integer[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid            uuid := auth.uid();
  v_contract       RECORD;
  v_funding_amount NUMERIC := 0;
  v_balance        NUMERIC := 0;
  v_milestones     jsonb;
  v_idx            integer;
  v_ms_amount      NUMERIC;
  v_escrow_id      uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Load + lock the contract row (ownership check)
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract not found');
  END IF;

  IF v_contract.client_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
  END IF;

  -- Idempotency: never double-fund
  IF v_contract.escrow_funded THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escrow is already funded', 'balance', NULL);
  END IF;

  -- Server-side amount recompute (never trust the client)
  IF p_milestone_indices IS NOT NULL AND array_length(p_milestone_indices, 1) > 0 THEN
    v_milestones := COALESCE(v_contract.milestones, '[]'::jsonb);
    FOREACH v_idx IN ARRAY p_milestone_indices LOOP
      BEGIN
        v_ms_amount := COALESCE((v_milestones->v_idx->>'amount')::numeric, 0);
      EXCEPTION WHEN OTHERS THEN
        v_ms_amount := 0;
      END;
      v_funding_amount := v_funding_amount + v_ms_amount;
    END LOOP;
    IF v_funding_amount <= 0 THEN
      v_funding_amount := COALESCE(v_contract.amount, 0);
    END IF;
  ELSE
    v_funding_amount := COALESCE(v_contract.amount, 0);
  END IF;

  -- ★ No platform fee here: the 5 % is taken from the freelancer at release.
  IF v_funding_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid funding amount');
  END IF;

  -- Ensure the client has a wallet (auto-create if missing)
  INSERT INTO public.wallets (user_id, currency)
  VALUES (v_uid, 'INR')
  ON CONFLICT (user_id) DO NOTHING;

  -- Locked atomic debit — fails if balance < amount
  UPDATE public.wallets
  SET balance = balance - v_funding_amount,
      updated_at = NOW()
  WHERE user_id = v_uid AND balance >= v_funding_amount
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_uid;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient wallet balance',
      'balance', v_balance,
      'required', v_funding_amount
    );
  END IF;

  -- Fund the escrow (marks escrow funded + contract active + project in_progress)
  PERFORM public.admin_fund_escrow(p_contract_id);

  SELECT id INTO v_escrow_id FROM public.escrow WHERE contract_id = p_contract_id LIMIT 1;

  -- Ledger: one client debit for exactly what went into escrow.
  INSERT INTO public.transactions (user_id, contract_id, escrow_id, type, amount, currency, status, description, source, metadata)
  VALUES (
    v_uid, p_contract_id, v_escrow_id,
    'debit', v_funding_amount, 'INR', 'completed',
    'Escrow funded from wallet',
    'escrow',
    jsonb_build_object('method', 'wallet', 'platform_fee', 0, 'milestone_indices', p_milestone_indices)
  );

  -- Notify both parties (fully-qualified — search_path is '').
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES
      (v_contract.client_id, 'payment', 'Escrow funded',
       'Your escrow payment of INR ' || to_char(v_funding_amount, 'FM9,999,999.00') || ' was received and the contract is now active.',
       '/dashboard/contracts',
       jsonb_build_object('contract_id', p_contract_id, 'method', 'wallet')),
      (v_contract.freelancer_id, 'contract', 'Contract funded — work can begin',
       'The client has funded the escrow. You can now start working on the contract.',
       '/dashboard/contracts',
       jsonb_build_object('contract_id', p_contract_id));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_balance,
    'amount', v_funding_amount,
    'platform_fee', 0,
    'total', v_funding_amount,
    'contract_id', p_contract_id,
    'escrow_id', v_escrow_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fund_escrow_from_wallet(uuid, integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fund_escrow_from_wallet(uuid, integer[]) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Data alignment: contracts that were never funded were priced under the
--    old "client pays +5 %" model. Their stored fee is zeroed so every funding
--    path (wallet + Razorpay + PayPal) collects exactly the agreed amount.
--    Funded/paid contracts are NOT touched — historical money is immutable.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.contracts
SET platform_fee = 0, updated_at = now()
WHERE escrow_funded = false
  AND COALESCE(platform_fee, 0) <> 0;

-- ═══════════════════════════════════════════════════════════════════════════
-- LIVE-DB VERIFICATION (read-only; run after applying)
-- ═══════════════════════════════════════════════════════════════════════════
-- (A) Release carves the commission (expect true):
--   SELECT pg_get_functiondef('public._release_escrow_internal(uuid)'::regprocedure)
--          ~ 'platform_commission' AS carves_commission;
-- (B) Invoice total equals the pool, with no client fee (expect true):
--   SELECT pg_get_functiondef('public._book_escrow_release(uuid,numeric)'::regprocedure)
--          ~ 'v_gross, 0, v_net, v_gross' AS invoice_client_paid_pool;
-- (C) Per released contract: client_charged = freelancer_credit + platform_fee
--   WITH rel AS (
--     SELECT pr.contract_id, SUM(pr.platform_fee) AS fee,
--            SUM(pr.freelancer_amount) AS credit, MAX(pr.gross_amount) AS gross
--       FROM public.platform_revenue pr WHERE pr.source = 'escrow'
--      GROUP BY pr.contract_id)
--   SELECT r.contract_id, r.gross, r.credit, r.fee,
--          (r.credit + r.fee = r.gross) AS identity_ok
--     FROM rel r ORDER BY identity_ok, r.contract_id;
-- (D) Commission helper is 5 % (expect 500.00):
--   SELECT public.platform_commission(10000);
-- ═══════════════════════════════════════════════════════════════════════════
