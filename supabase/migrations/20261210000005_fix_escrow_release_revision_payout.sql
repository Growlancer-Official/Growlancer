-- ============================================================================
-- FIX: EXTRA REVISION PAYMENTS STRANDED IN ESCROW (2026-12-10)
--
-- When a client pays for extra revisions (revision_payment), mark_revision_paid
-- INCREMENTS escrow.amount (base contract + revision total). But:
--
--   1. release_escrow credited the freelancer only v_contract.freelancer_amount
--      (the ORIGINAL contract amount minus fee) — every rupee paid for extra
--      revisions was left stranded in escrow, never reaching the freelancer.
--   2. _book_escrow_release(UUID, NUMERIC) capped the booked gross at
--      v_contract.amount, so invoices/ledgers/revenue ignored revision money.
--
-- FIX: both functions now book on the ACTUAL escrow pool (escrow.amount) while
-- keeping the 5% platform fee consistent (base fee from contract + 5% on the
-- revision portion). Invoice/ledger/platform_revenue/transaction/wallet all
-- reconcile to the true released amount.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) release_escrow — pay out the FULL escrow pool (base + extra revisions)
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

  -- ACTUAL escrow pool — includes any extra-revision top-ups (mark_revision_paid
  -- increments escrow.amount). NEVER release less than what was truly paid.
  v_gross := COALESCE(v_escrow.amount, v_contract.amount);
  -- Platform fee: stored contract fee when no revisions (backwards-compatible),
  -- else the standard 5% of the true pool (base + revision portion).
  IF v_gross <= COALESCE(v_contract.amount, 0) THEN
    v_fee := COALESCE(v_contract.platform_fee, ROUND(v_gross * 0.05, 2));
  ELSE
    v_fee := ROUND(v_gross * 0.05, 2);
  END IF;
  v_net := v_gross - v_fee;

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

  -- ★ AUTOMATIC FINANCIAL PROCESSING: book commission + invoice + ledger
  -- on the ACTUAL gross (escrow pool) so revision money is fully accounted.
  -- p_amount IS NULL → _book derives the pool from escrow.amount itself,
  -- keeping its fee logic identical to this function.
  PERFORM public._book_escrow_release(p_contract_id, NULL);

  RETURN TRUE;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) _book_escrow_release(UUID, NUMERIC) — book on the actual escrow pool
--    (base contract + extra revision top-ups), not capped at contract.amount
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
  v_net := v_gross - v_fee;

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

  -- 2. Invoice (paid — funds already moved)
  INSERT INTO public.invoices (
    invoice_number, contract_id, client_id, freelancer_id, project_title,
    subtotal, platform_fee, freelancer_amount, total,
    payment_method, currency, status, issued_at, paid_at
  ) VALUES (
    v_invoice_no, p_contract_id, v_contract.client_id, v_contract.freelancer_id, v_project_title,
    v_gross, v_fee, v_net, v_gross,
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
