-- ═══════════════════════════════════════════════════════════════════════════
-- FREELANCER FULL-PAYOUT MODEL (2026-12-20)
--
-- Business model change: the 5% platform fee is charged to the CLIENT on top
-- of the contract amount at payment time (Razorpay order = amount + 5%). The
-- freelancer receives 100% of the contract value in their wallet.
--
-- Changes:
--   1. create_contract_with_escrow      — freelancer_amount = p_amount (100%)
--   2. accept_invite_create_contract    — freelancer_amount = v_amount (100%)
--   3. release_escrow                   — pays out the FULL escrow pool
--      (escrow.amount IS the contract value; the client already paid the fee
--      on top, so the pool belongs entirely to the freelancer)
--   4. _book_escrow_release             — invoice/ledger now show freelancer
--      receiving 100% and the client's invoice total = amount + fee
--   5. Backfill: existing contracts where freelancer_amount was stored as
--      amount − 5% are corrected to amount (100%).
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) create_contract_with_escrow — freelancer gets 100% of the contract amount
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_contract_with_escrow(
  p_project_id uuid,
  p_freelancer_id uuid,
  p_proposal_id uuid,
  p_amount numeric,
  p_client_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid;
  v_platform_fee numeric;
  v_freelancer_amount numeric;
  v_proposal record;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- ── Idempotency: if a contract already exists for this proposal, return it ──
  SELECT id INTO v_contract_id
  FROM contracts
  WHERE proposal_id = p_proposal_id
  LIMIT 1;
  IF FOUND THEN
    -- Repair stale state: make sure the winning proposal shows as hired
    UPDATE proposals
    SET status = 'hired', updated_at = now()
    WHERE id = p_proposal_id AND status <> 'hired';
    RETURN v_contract_id;
  END IF;

  -- Proposal must exist, belong to this project, and match the freelancer
  SELECT * INTO v_proposal
  FROM proposals
  WHERE id = p_proposal_id AND project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found for this project';
  END IF;
  IF v_proposal.freelancer_id <> p_freelancer_id THEN
    RAISE EXCEPTION 'Proposal does not belong to this freelancer';
  END IF;

  -- Project must belong to this client
  IF NOT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Project does not belong to this client';
  END IF;

  -- Amount must be positive and bounded (aligned with payment gateway caps)
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Invalid contract amount';
  END IF;

  -- Fees: 5% platform fee is charged to the CLIENT on top at payment time.
  -- The freelancer receives 100% of the contract amount.
  v_platform_fee := ROUND(p_amount * 0.05, 2); -- 5% platform fee (client-paid)
  v_freelancer_amount := p_amount;             -- 100% to the freelancer

  -- Create contract
  INSERT INTO contracts (
    project_id, proposal_id, freelancer_id, client_id,
    amount, platform_fee, freelancer_amount, status, escrow_funded
  ) VALUES (
    p_project_id, p_proposal_id, p_freelancer_id, p_client_id,
    p_amount, v_platform_fee, v_freelancer_amount, 'pending', false
  )
  RETURNING id INTO v_contract_id;

  -- Create escrow record — client_id / freelancer_id are NOT NULL!
  INSERT INTO escrow (contract_id, client_id, freelancer_id, amount, status)
  VALUES (v_contract_id, p_client_id, p_freelancer_id, p_amount, 'pending');

  -- ── Hire semantics: winning proposal → 'hired', siblings → 'rejected' ──
  UPDATE proposals
  SET status = 'hired', updated_at = now()
  WHERE id = p_proposal_id;
  UPDATE proposals
  SET status = 'rejected', updated_at = now()
  WHERE project_id = p_project_id AND status = 'pending' AND id <> p_proposal_id;

  RETURN v_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_contract_with_escrow(uuid, uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_contract_with_escrow(uuid, uuid, uuid, numeric, uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) accept_invite_create_contract — freelancer gets 100% (client pays 5% fee)
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
  IF v_invite.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Invite has already been responded to';
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  -- ── Project must exist ───────────────────────────────────────────────────
  SELECT * INTO v_project FROM public.projects WHERE id = v_invite.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  -- ── Amount computed server-side from the project budget ──────────────────
  v_amount := COALESCE(v_project.budget_max, v_project.budget_min, 500);
  IF v_amount <= 0 THEN
    v_amount := 500;
  END IF;
  v_fee := GREATEST(0, round(v_amount * 0.05)::integer);

  -- ── Create contract (escrow starts unfunded; client funds it later) ──────
  -- 5% platform fee is charged to the client on top at payment time; the
  -- freelancer receives 100% of the amount.
  INSERT INTO public.contracts (
    project_id, client_id, freelancer_id,
    amount, platform_fee, freelancer_amount,
    status, escrow_funded
  ) VALUES (
    v_project.id, v_project.client_id, v_invite.freelancer_id,
    v_amount, v_fee, v_amount,
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

REVOKE ALL ON FUNCTION public.accept_invite_create_contract(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite_create_contract(uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) release_escrow — pay out the FULL escrow pool to the freelancer
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_escrow(
  p_contract_id UUID,
  p_client_id UUID
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
  IF p_client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  IF v_contract.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
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
  -- increments escrow.amount).
  v_gross := COALESCE(v_escrow.amount, v_contract.amount);
  -- Platform fee (client-paid at checkout): stored contract fee when no
  -- revisions (backwards-compatible), else the standard 5% of the true pool.
  IF v_gross <= COALESCE(v_contract.amount, 0) THEN
    v_fee := COALESCE(v_contract.platform_fee, ROUND(v_gross * 0.05, 2));
  ELSE
    v_fee := ROUND(v_gross * 0.05, 2);
  END IF;
  -- ★ FREELANCER FULL PAYOUT: the client already paid amount + 5% at checkout,
  -- so the entire escrow pool belongs to the freelancer.
  v_net := v_gross;

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

-- ────────────────────────────────────────────────────────────────────────────
-- 4) _book_escrow_release — freelancer 100% + client invoice total = amount + fee
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
  -- ★ FREELANCER FULL PAYOUT (client already paid the 5% fee on top).
  v_net := v_gross;

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

  -- 2. Invoice — the client paid amount + 5% fee, so the invoice total is the
  -- true amount charged; the freelancer receives 100% of the contract amount.
  INSERT INTO public.invoices (
    invoice_number, contract_id, client_id, freelancer_id, project_title,
    subtotal, platform_fee, freelancer_amount, total,
    payment_method, currency, status, issued_at, paid_at
  ) VALUES (
    v_invoice_no, p_contract_id, v_contract.client_id, v_contract.freelancer_id, v_project_title,
    v_gross, v_fee, v_net, v_gross + v_fee,
    'razorpay', v_currency, 'paid', now(), now()
  ) RETURNING id INTO v_invoice_id;

  UPDATE public.platform_revenue SET invoice_id = v_invoice_id WHERE id = v_revenue_id;

  -- 3. Double-entry ledger
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

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Backfill — OPEN contracts stored as amount − 5% become 100%
--    (Only contracts that have NOT been released yet: completed/released rows
--    keep their historical freelancer_amount so the UI matches what the
--    freelancer actually received at the time — real numbers stay in
--    transactions / platform_revenue.)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.contracts
SET freelancer_amount = amount
WHERE status NOT IN ('completed', 'cancelled', 'refunded', 'closed')
  AND (freelancer_amount IS NULL OR freelancer_amount < amount);
