-- ============================================================================
-- Financial Automation System
--
-- Enterprise financial layer comparable to leading freelancing marketplaces.
-- Everything is computed and booked server-side; the frontend never calculates.
--
-- Components:
--   1. platform_revenue  — commission ledger (5% platform fee booked per release)
--   2. invoices          — auto-generated tax-ready invoice per escrow release
--   3. ledger_entries    — double-entry accounting (escrow / wallet / revenue /
--                          refund / payout)
--   4. _book_escrow_release — idempotent booking helper (revenue + invoice +
--                          ledger + audit + notifications)
--   5. release_escrow / release_milestone / admin_decide_dispute — wired to
--                          book revenue on every successful release
--   6. _mark_revenue_refunded — reverses revenue + invoice on refund decisions
--   7. get_finance_stats  — admin revenue dashboard (today / week / month /
--                          year / totals, commissions, pending/released/refunded)
--   8. process_stale_withdrawals — fail-safe recovery for stuck payouts
--                          (never double-pays; releases funds back on failure)
-- ============================================================================

-- ============================================================================
-- 1. PLATFORM REVENUE (commission ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.platform_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
  invoice_id UUID,
  client_id UUID REFERENCES public.profiles(id),
  freelancer_id UUID REFERENCES public.profiles(id),
  gross_amount NUMERIC(12,2) NOT NULL,          -- amount the client paid
  platform_fee NUMERIC(12,2) NOT NULL,          -- 5% commission earned by Growlancer
  freelancer_amount NUMERIC(12,2) NOT NULL,     -- net paid to the freelancer
  status TEXT NOT NULL DEFAULT 'released'
    CHECK (status IN ('pending', 'released', 'refunded', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'escrow'
    CHECK (source IN ('escrow', 'milestone', 'subscription', 'service')),
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: one revenue record per contract+source (never double-book)
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_revenue_contract_source
  ON public.platform_revenue(contract_id, source);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_status ON public.platform_revenue(status);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_released ON public.platform_revenue(released_at);

ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Revenue admins all" ON public.platform_revenue;
CREATE POLICY "Revenue admins all" ON public.platform_revenue
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Revenue freelancer own" ON public.platform_revenue;
CREATE POLICY "Revenue freelancer own" ON public.platform_revenue
  FOR SELECT
  USING (freelancer_id = auth.uid());

DROP POLICY IF EXISTS "Revenue client own" ON public.platform_revenue;
CREATE POLICY "Revenue client own" ON public.platform_revenue
  FOR SELECT
  USING (client_id = auth.uid());

-- ============================================================================
-- 2. INVOICES (auto-generated, tax-ready)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  client_id UUID NOT NULL REFERENCES public.profiles(id),
  freelancer_id UUID NOT NULL REFERENCES public.profiles(id),
  project_title TEXT,
  subtotal NUMERIC(12,2) NOT NULL,              -- contract amount (client)
  platform_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  freelancer_amount NUMERIC(12,2) NOT NULL,     -- net to freelancer
  total NUMERIC(12,2) NOT NULL,                 -- subtotal (total billed to client)
  payment_method TEXT DEFAULT 'razorpay',
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft', 'issued', 'paid', 'refunded', 'cancelled')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_freelancer ON public.invoices(freelancer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_contract ON public.invoices(contract_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoice participants view" ON public.invoices;
CREATE POLICY "Invoice participants view" ON public.invoices
  FOR SELECT
  USING (
    client_id = auth.uid()
    OR freelancer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Invoice numbering sequence (GL-YYYYMM-NNNNN)
CREATE SEQUENCE IF NOT EXISTS public.invoice_seq START 1000;

-- ============================================================================
-- 3. LEDGER ENTRIES (double-entry accounting)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  account TEXT NOT NULL
    CHECK (account IN ('escrow', 'wallet', 'platform_revenue', 'refund', 'payout', 'subscription')),
  direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2),
  entity_type TEXT,                              -- 'contract' | 'invoice' | 'withdrawal' | 'refund' | 'wallet'
  entity_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON public.ledger_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON public.ledger_entries(account);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_entity ON public.ledger_entries(entity_type, entity_id);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger admins only" ON public.ledger_entries;
CREATE POLICY "Ledger admins only" ON public.ledger_entries
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 4. BOOK ESCROW RELEASE — idempotent revenue + invoice + ledger + audit
-- ============================================================================
CREATE OR REPLACE FUNCTION public._book_escrow_release(
  p_contract_id UUID,
  p_amount NUMERIC DEFAULT NULL   -- actual released amount (dispute paths); NULL = full contract
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

  -- Always book on the ACTUAL amount released (never trust caller beyond a cap)
  v_gross := LEAST(COALESCE(p_amount, v_contract.amount), v_contract.amount);
  -- 5% platform fee computed server-side; fall back to contract fee for full releases
  v_fee := CASE
    WHEN p_amount IS NULL THEN COALESCE(v_contract.platform_fee, ROUND(v_gross * 0.05, 2))
    ELSE ROUND(v_gross * 0.05, 2)
  END;
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

REVOKE EXECUTE ON FUNCTION public._book_escrow_release(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._book_escrow_release(UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._book_escrow_release(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public._book_escrow_release(UUID, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public._book_escrow_release(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._book_escrow_release(UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._book_escrow_release(UUID, NUMERIC) TO service_role;

REVOKE EXECUTE ON FUNCTION public._book_escrow_release(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._book_escrow_release(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public._book_escrow_release(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._book_escrow_release(UUID) TO service_role;

-- ============================================================================
-- 5. RELEASE ESCROW — re-created to book revenue automatically on release
-- ============================================================================
CREATE OR REPLACE FUNCTION public.release_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract RECORD;
  v_escrow RECORD;
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
    v_contract.freelancer_amount, 'completed', 'escrow',
    'Escrow release for contract #' || p_contract_id::TEXT
  );

  UPDATE public.wallets
  SET balance = balance + v_contract.freelancer_amount,
      updated_at = NOW()
  WHERE user_id = v_contract.freelancer_id;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (v_contract.freelancer_id, v_contract.freelancer_amount);
  END IF;

  UPDATE public.wallets
  SET escrow_balance = GREATEST(escrow_balance - v_escrow.amount, 0),
      updated_at = NOW()
  WHERE user_id = v_contract.client_id;

  -- ★ AUTOMATIC FINANCIAL PROCESSING: book commission + invoice + ledger
  -- Explicit (UUID, NUMERIC) signature — avoids overload ambiguity with (UUID)
  PERFORM public._book_escrow_release(p_contract_id, NULL);

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_escrow(UUID, UUID) TO authenticated;

-- ============================================================================
-- 6. MARK REVENUE REFUNDED — reverses revenue + invoice on refund decisions
-- ============================================================================
CREATE OR REPLACE FUNCTION public._mark_revenue_refunded(p_contract_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_fee NUMERIC;
BEGIN
  UPDATE public.platform_revenue
  SET status = 'refunded', refunded_at = now()
  WHERE contract_id = p_contract_id AND status IN ('pending', 'released');

  SELECT SUM(platform_fee) INTO v_fee
  FROM public.platform_revenue
  WHERE contract_id = p_contract_id AND status = 'refunded';

  UPDATE public.invoices
  SET status = 'refunded'
  WHERE contract_id = p_contract_id AND status IN ('issued', 'paid');

  IF v_fee IS NOT NULL AND v_fee > 0 THEN
    INSERT INTO public.ledger_entries (account, direction, amount, entity_type, entity_id, description)
    VALUES ('platform_revenue', 'debit', v_fee, 'contract', p_contract_id::TEXT,
            'Commission reversed for refunded contract #' || p_contract_id::TEXT);
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public._mark_revenue_refunded(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._mark_revenue_refunded(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public._mark_revenue_refunded(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._mark_revenue_refunded(UUID) TO service_role;

-- ============================================================================
-- 7. ADMIN DECIDE DISPUTE — re-created to book revenue on freelancer_release
--    and reverse revenue on client_refund (appeal path after release)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_decide_dispute(
  p_dispute_id UUID,
  p_decision TEXT,
  p_client_amount NUMERIC DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_dispute RECORD;
  v_contract RECORD;
  v_escrow RECORD;
  v_refundable NUMERIC;
  v_freelancer_amount NUMERIC;
  v_refund_request_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admins only');
  END IF;

  SELECT * INTO v_dispute FROM public.disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Dispute not found'); END IF;
  IF v_dispute.status NOT IN ('open', 'investigating', 'escalated') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispute already resolved');
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = v_dispute.contract_id FOR UPDATE;
  SELECT * INTO v_escrow FROM public.escrow WHERE contract_id = v_dispute.contract_id FOR UPDATE;
  v_refundable := public._refundable_amount(v_dispute.contract_id);
  v_freelancer_amount := COALESCE(v_contract.freelancer_amount, v_contract.amount);

  IF p_decision = 'client_refund' THEN
    UPDATE public.escrow SET status = 'refunded', updated_at = now() WHERE contract_id = v_dispute.contract_id;
    UPDATE public.contracts SET status = 'cancelled', escrow_funded = false, updated_at = now() WHERE id = v_dispute.contract_id;
    UPDATE public.wallets SET escrow_balance = GREATEST(escrow_balance - v_refundable, 0), updated_at = now()
    WHERE user_id = v_dispute.client_id;
    UPDATE public.disputes SET status = 'resolved_refunded', decision = 'client_refund',
      decision_amount = v_refundable, resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
    WHERE id = p_dispute_id;

    -- Reverse any booked revenue/invoices (appeal path after a release)
    PERFORM public._mark_revenue_refunded(v_dispute.contract_id);

    INSERT INTO public.refund_requests (
      contract_id, requested_by, requested_to, request_type, reason, description,
      refund_amount, status, decision_by, decision_at, decided_amount
    ) VALUES (
      v_dispute.contract_id, v_dispute.client_id, NULL, 'admin_decision',
      'Admin dispute decision: refund client', COALESCE(p_note, 'Dispute resolved in favour of the client.'),
      v_refundable, 'approved', auth.uid(), now(), v_refundable
    ) RETURNING id INTO v_refund_request_id;

    PERFORM public._refund_history_event(v_refund_request_id, 'approved', auth.uid(), 'admin',
      COALESCE(p_note, 'Dispute resolved in favour of the client'), jsonb_build_object('dispute_id', p_dispute_id, 'amount', v_refundable));
    PERFORM public._refund_audit(auth.uid(), 'dispute_resolved_refund', 'dispute', p_dispute_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('decision', 'client_refund', 'refund_request_id', v_refund_request_id));

  ELSIF p_decision = 'freelancer_release' THEN
    UPDATE public.escrow SET status = 'released', released_at = now(), updated_at = now() WHERE contract_id = v_dispute.contract_id;
    UPDATE public.contracts SET status = 'completed', escrow_funded = false, updated_at = now() WHERE id = v_dispute.contract_id;
    UPDATE public.wallets SET balance = balance + v_refundable, updated_at = now() WHERE user_id = v_dispute.freelancer_id;
    UPDATE public.disputes SET status = 'resolved_released', decision = 'freelancer_release',
      decision_amount = v_refundable, resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
    WHERE id = p_dispute_id;

    INSERT INTO public.transactions (user_id, contract_id, escrow_id, type, amount, status, source, description)
    VALUES (v_dispute.freelancer_id, v_dispute.contract_id, v_escrow.id, 'credit', v_refundable, 'completed', 'escrow',
            'Dispute resolution — funds released to freelancer');

    -- ★ Book the platform commission + invoice on the ACTUAL amount released
    PERFORM public._book_escrow_release(v_dispute.contract_id, v_refundable);

    PERFORM public._refund_audit(auth.uid(), 'dispute_resolved_release', 'dispute', p_dispute_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('decision', 'freelancer_release'));

  ELSIF p_decision = 'split' THEN
    DECLARE v_freelancer_share NUMERIC := GREATEST(v_refundable - COALESCE(p_client_amount, 0), 0);
    BEGIN
      UPDATE public.escrow SET status = 'released', released_at = now(), updated_at = now() WHERE contract_id = v_dispute.contract_id;
      UPDATE public.contracts SET status = 'completed', escrow_funded = false, updated_at = now() WHERE id = v_dispute.contract_id;
      UPDATE public.wallets SET escrow_balance = GREATEST(escrow_balance - COALESCE(p_client_amount, 0), 0), updated_at = now()
      WHERE user_id = v_dispute.client_id;
      IF v_freelancer_share > 0 THEN
        UPDATE public.wallets SET balance = balance + v_freelancer_share, updated_at = now() WHERE user_id = v_dispute.freelancer_id;
        INSERT INTO public.transactions (user_id, contract_id, escrow_id, type, amount, status, source, description)
        VALUES (v_dispute.freelancer_id, v_dispute.contract_id, v_escrow.id, 'credit', v_freelancer_share, 'completed', 'escrow',
                'Dispute resolution — split: freelancer share');
      END IF;
      UPDATE public.disputes SET status = 'resolved_refunded', decision = 'split',
        decision_amount = v_refundable, resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
      WHERE id = p_dispute_id;

      IF COALESCE(p_client_amount, 0) > 0 THEN
        INSERT INTO public.refund_requests (
          contract_id, requested_by, requested_to, request_type, reason, description,
          refund_amount, status, decision_by, decision_at, decided_amount
        ) VALUES (
          v_dispute.contract_id, v_dispute.client_id, NULL, 'admin_decision',
          'Admin dispute decision: split — client portion', COALESCE(p_note, 'Dispute resolved with a split decision.'),
          p_client_amount, 'approved', auth.uid(), now(), p_client_amount
        ) RETURNING id INTO v_refund_request_id;

        PERFORM public._refund_history_event(v_refund_request_id, 'approved', auth.uid(), 'admin',
          COALESCE(p_note, 'Dispute resolved with a split decision'),
          jsonb_build_object('dispute_id', p_dispute_id, 'client_amount', p_client_amount, 'freelancer_share', v_freelancer_share));
      END IF;
      PERFORM public._refund_audit(auth.uid(), 'dispute_resolved_split', 'dispute', p_dispute_id::TEXT,
        v_refundable, 'INR', jsonb_build_object('client_refund', COALESCE(p_client_amount, 0), 'freelancer_share', v_freelancer_share, 'refund_request_id', v_refund_request_id));
    END;

  ELSE -- dismiss
    UPDATE public.escrow SET status = 'funded', updated_at = now() WHERE contract_id = v_dispute.contract_id;
    UPDATE public.contracts SET status = 'active', updated_at = now() WHERE id = v_dispute.contract_id;
    UPDATE public.disputes SET status = 'cancelled', decision = 'dismiss',
      resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
    WHERE id = p_dispute_id;
    PERFORM public._refund_audit(auth.uid(), 'dispute_dismissed', 'dispute', p_dispute_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('decision', 'dismiss'));
  END IF;

  PERFORM public._refund_notify(v_dispute.client_id, 'dispute',
    'Dispute resolved',
    'The dispute on contract #' || v_dispute.contract_id::TEXT || ' has been resolved (' || p_decision || ').',
    '/client/contracts', jsonb_build_object('dispute_id', p_dispute_id, 'decision', p_decision));
  PERFORM public._refund_notify(v_dispute.freelancer_id, 'dispute',
    'Dispute resolved',
    'The dispute on contract #' || v_dispute.contract_id::TEXT || ' has been resolved (' || p_decision || ').',
    '/dashboard/contracts', jsonb_build_object('dispute_id', p_dispute_id, 'decision', p_decision));

  RETURN jsonb_build_object('success', true, 'dispute_id', p_dispute_id, 'decision', p_decision,
    'status', (SELECT status FROM public.disputes WHERE id = p_dispute_id));
END $$;

GRANT EXECUTE ON FUNCTION public.admin_decide_dispute(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ============================================================================
-- 8. GET FINANCE STATS — admin revenue dashboard (server-side calculation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_finance_stats()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_stats JSONB;
  v_rev RECORD;
  v_escrow RECORD;
  v_payout RECORD;
  v_refund RECORD;
  v_dispute RECORD;
  v_month JSONB;
  v_today_start TIMESTAMPTZ := date_trunc('day', now());
  v_week_start TIMESTAMPTZ := date_trunc('week', now());
  v_month_start TIMESTAMPTZ := date_trunc('month', now());
  v_year_start TIMESTAMPTZ := date_trunc('year', now());
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admins only');
  END IF;

  SELECT
    COALESCE(SUM(platform_fee) FILTER (WHERE released_at >= v_today_start), 0) AS today_fee,
    COALESCE(SUM(platform_fee) FILTER (WHERE released_at >= v_week_start), 0) AS week_fee,
    COALESCE(SUM(platform_fee) FILTER (WHERE released_at >= v_month_start), 0) AS month_fee,
    COALESCE(SUM(platform_fee) FILTER (WHERE released_at >= v_year_start), 0) AS year_fee,
    COALESCE(SUM(platform_fee) FILTER (WHERE status = 'released'), 0) AS total_fee,
    COALESCE(SUM(gross_amount) FILTER (WHERE status = 'released'), 0) AS gross_volume,
    COALESCE(SUM(platform_fee) FILTER (WHERE status = 'refunded'), 0) AS refunded_fee
  INTO v_rev
  FROM public.platform_revenue;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status = 'funded'), 0) AS pending_escrow,
    COALESCE(SUM(amount) FILTER (WHERE status = 'released'), 0) AS released_escrow,
    COALESCE(SUM(amount) FILTER (WHERE status = 'refunded'), 0) AS refunded_escrow,
    COALESCE(SUM(amount), 0) AS total_escrow
  INTO v_escrow
  FROM public.escrow;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status IN ('completed')), 0) AS paid_out,
    COALESCE(SUM(amount) FILTER (WHERE status IN ('pending', 'processing')), 0) AS pending_payouts,
    COUNT(*) FILTER (WHERE status = 'completed') AS payout_count
  INTO v_payout
  FROM public.withdrawals;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS refunded_amount,
    COUNT(*) FILTER (WHERE status = 'completed') AS refund_count
  INTO v_refund
  FROM public.refunds;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('open', 'investigating', 'escalated')) AS open_disputes,
    COUNT(*) FILTER (WHERE status IN ('resolved_refunded', 'resolved_released')) AS resolved_disputes
  INTO v_dispute
  FROM public.disputes;

  -- Last 12 months series for charts
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    ) AS m
  )
  SELECT jsonb_agg(jsonb_build_object(
    'month', to_char(m, 'YYYY-MM'),
    'label', to_char(m, 'Mon YY'),
    'revenue', COALESCE((
      SELECT SUM(platform_fee) FROM public.platform_revenue
      WHERE released_at >= m AND released_at < m + interval '1 month' AND status = 'released'
    ), 0),
    'volume', COALESCE((
      SELECT SUM(gross_amount) FROM public.platform_revenue
      WHERE released_at >= m AND released_at < m + interval '1 month' AND status = 'released'
    ), 0)
  ) ORDER BY m) INTO v_month
  FROM months;

  v_stats := jsonb_build_object(
    'success', true,
    'revenue', jsonb_build_object(
      'today', v_rev.today_fee,
      'this_week', v_rev.week_fee,
      'this_month', v_rev.month_fee,
      'this_year', v_rev.year_fee,
      'total', v_rev.total_fee
    ),
    'commission', jsonb_build_object(
      'today', v_rev.today_fee,
      'this_week', v_rev.week_fee,
      'this_month', v_rev.month_fee,
      'this_year', v_rev.year_fee,
      'total', v_rev.total_fee
    ),
    'gross_volume', v_rev.gross_volume,
    'pending_revenue', COALESCE((
      SELECT SUM(amount) FROM public.escrow WHERE status = 'funded'
    ), 0),
    'released_revenue', v_rev.gross_volume,
    'refunded_revenue', v_rev.refunded_fee,
    'escrow', jsonb_build_object(
      'total', v_escrow.total_escrow,
      'pending', v_escrow.pending_escrow,
      'released', v_escrow.released_escrow,
      'refunded', v_escrow.refunded_escrow
    ),
    'payouts', jsonb_build_object(
      'paid_out', v_payout.paid_out,
      'pending', v_payout.pending_payouts,
      'count', v_payout.payout_count
    ),
    'refunds', jsonb_build_object(
      'count', v_refund.refund_count,
      'amount', v_refund.refunded_amount
    ),
    'disputes', jsonb_build_object(
      'open', v_dispute.open_disputes,
      'resolved', v_dispute.resolved_disputes
    ),
    'monthly', COALESCE(v_month, '[]'::jsonb)
  );

  RETURN v_stats;
END $$;

GRANT EXECUTE ON FUNCTION public.get_finance_stats() TO authenticated;

-- ============================================================================
-- 9. STALE WITHDRAWAL RECOVERY — fail-safe payout queue
--     Stuck 'processing' (no provider id) or very old 'pending' withdrawals
--     are failed + funds returned. NEVER double-pays.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_stale_withdrawals()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_wd RECORD;
  v_processed INT := 0;
BEGIN
  FOR v_wd IN
    SELECT * FROM public.withdrawals
    WHERE (
      -- Processing without a provider id for > 4 hours = stuck (never fired)
      (status = 'processing' AND razorpay_payout_id IS NULL AND paypal_payout_id IS NULL
       AND created_at < now() - interval '4 hours')
      OR
      -- Pending without any movement for > 72 hours
      (status = 'pending' AND created_at < now() - interval '72 hours')
    )
    LIMIT 50
  LOOP
    UPDATE public.withdrawals
    SET status = 'failed',
        failure_reason = 'Automatically cancelled by the system (payout could not be initiated in time)',
        updated_at = now()
    WHERE id = v_wd.id;

    -- Return the held funds to the wallet
    UPDATE public.wallets
    SET balance = balance + v_wd.amount,
        pending_balance = GREATEST(pending_balance - v_wd.amount, 0),
        updated_at = now()
    WHERE user_id = v_wd.user_id;

    UPDATE public.transactions
    SET status = 'failed',
        description = 'Withdrawal auto-cancelled by the system'
    WHERE metadata->>'withdrawal_id' = v_wd.id::TEXT;

    PERFORM public.insert_payment_audit_log(
      p_action => 'withdrawal_auto_failed',
      p_entity_type => 'withdrawal',
      p_entity_id => v_wd.id::TEXT,
      p_provider => 'razorpay',
      p_amount => v_wd.amount,
      p_currency => 'INR',
      p_metadata => jsonb_build_object('reason', 'stale_payout_recovery'),
      p_user_id => v_wd.user_id
    );

    PERFORM public._refund_notify(v_wd.user_id, 'payment',
      'Withdrawal cancelled — funds returned',
      'A withdrawal could not be processed in time and was automatically cancelled. The full amount is back in your wallet.',
      '/dashboard/wallet', jsonb_build_object('withdrawal_id', v_wd.id));

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END $$;

GRANT EXECUTE ON FUNCTION public.process_stale_withdrawals() TO authenticated;

-- ============================================================================
-- 9b. SCHEMA DRIFT FIX: restore RazorpayX payout columns on withdrawals
--     (declared in 20260810000000_add_payout_columns.sql but missing from the
--     live table). The withdrawal edge function + payout webhook need them.
-- ============================================================================
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS razorpay_payout_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_fund_account_id TEXT,
  ADD COLUMN IF NOT EXISTS payout_mode TEXT,
  ADD COLUMN IF NOT EXISTS paypal_payout_id TEXT;

CREATE INDEX IF NOT EXISTS idx_withdrawals_razorpay_payout_id ON public.withdrawals(razorpay_payout_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_paypal_payout_id ON public.withdrawals(paypal_payout_id);

-- ============================================================================
-- 10. SCHEDULE CRON — stale payout recovery every 15 minutes
-- ============================================================================
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'growlancer-stale-withdrawal-recovery') THEN
    PERFORM cron.schedule('growlancer-stale-withdrawal-recovery', '*/15 * * * *',
      $job$SELECT public.process_stale_withdrawals();$job$);
  END IF;
END $cron$;

-- ============================================================================
-- 11. REALTIME for invoices + platform_revenue (admin + owner dashboards)
-- ============================================================================
DO $realtime$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['invoices', 'platform_revenue', 'ledger_entries']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl) THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
  END LOOP;
END $realtime$;
