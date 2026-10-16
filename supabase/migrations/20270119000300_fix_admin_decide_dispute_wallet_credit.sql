-- ============================================================================
-- MR-03 — P0 MONEY CORRECTNESS
--
-- Problem:
--   20261209000001_fix_admin_dispute_status.sql redefined
--   admin_decide_dispute and DROPPED the v_wallet_funded detection that
--   20260818000000_fix_refund_wallet_double_credit.sql had added. As a result
--   the `client_refund` and `split` branches refund the client only by
--   debiting escrow_balance — a wallet-funded escrow's money is never credited
--   back to the client's wallet balance, so the client loses the funds
--   (breaking freelancer_credit + platform_revenue == client_total_charged).
--
-- Fix (authoritative latest definition — restores the 20260818000000 logic):
--   Recompute wallet-funded status ("no razorpay payment EVER captured for the
--   contract and no paypal capture") and credit the client's wallet balance in
--   BOTH the client_refund and split branches. Return shape, grants
--   (authenticated) and transaction/audit semantics are preserved. search_path
--   pinned to '' with fully-qualified public.* references.
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
  v_wallet_funded BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admins only');
  END IF;

  SELECT * INTO v_dispute FROM public.disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Dispute not found'); END IF;
  IF v_dispute.status IN ('resolved_refunded', 'resolved_released', 'cancelled', 'dismissed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Dispute already resolved');
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = v_dispute.contract_id FOR UPDATE;
  SELECT * INTO v_escrow FROM public.escrow WHERE contract_id = v_dispute.contract_id FOR UPDATE;
  v_refundable := public._refundable_amount(v_dispute.contract_id);
  v_freelancer_amount := COALESCE(v_contract.freelancer_amount, v_contract.amount);

  -- Wallet-funded escrow (no razorpay payment EVER captured for this contract,
  -- and no paypal capture either) → refunds must be credited back to the
  -- client's wallet balance, not to a payment method. No status filter — if
  -- the order was already refunded, a payment id still proves it was card/UPI
  -- funded.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.razorpay_orders
    WHERE contract_id = v_dispute.contract_id
      AND order_type = 'contract_escrow'
      AND razorpay_payment_id IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM public.paypal_orders
    WHERE contract_id = v_dispute.contract_id
      AND status IN ('captured', 'refunded')
  ) INTO v_wallet_funded;

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

    -- Wallet-funded escrow → return the funds to the client's wallet balance
    IF v_wallet_funded THEN
      UPDATE public.wallets SET balance = balance + v_refundable, updated_at = now()
      WHERE user_id = v_dispute.client_id;
      INSERT INTO public.transactions (user_id, contract_id, escrow_id, type, amount, currency, status, description, source)
      VALUES (v_dispute.client_id, v_dispute.contract_id, v_escrow.id, 'credit', v_refundable, 'INR', 'completed',
              'Dispute resolved in client favour — escrow refunded to wallet', 'refund');
    END IF;

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
      v_refundable, 'INR', jsonb_build_object('decision', 'client_refund', 'refund_request_id', v_refund_request_id, 'wallet_credit', v_wallet_funded));

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

    -- Book the platform commission + invoice on the ACTUAL amount released
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

      -- Wallet-funded escrow → return the client's portion to their wallet balance
      IF COALESCE(p_client_amount, 0) > 0 AND v_wallet_funded THEN
        UPDATE public.wallets SET balance = balance + p_client_amount, updated_at = now()
        WHERE user_id = v_dispute.client_id;
        INSERT INTO public.transactions (user_id, contract_id, escrow_id, type, amount, currency, status, description, source)
        VALUES (v_dispute.client_id, v_dispute.contract_id, v_escrow.id, 'credit', p_client_amount, 'INR', 'completed',
                'Dispute resolution — split: client portion refunded to wallet', 'refund');
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
        v_refundable, 'INR', jsonb_build_object('client_refund', COALESCE(p_client_amount, 0), 'freelancer_share', v_freelancer_share, 'refund_request_id', v_refund_request_id, 'wallet_credit', v_wallet_funded));
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

REVOKE ALL ON FUNCTION public.admin_decide_dispute(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_dispute(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ============================================================================
-- LIVE-DB VERIFICATION REQUIRED (run after applying):
--
--   -- (a) authoritative definition contains the wallet credit path:
--   SELECT pg_get_functiondef('public.admin_decide_dispute(uuid,text,numeric,text)'::regprocedure);
--   -- Expect: v_wallet_funded detection + "balance = balance + v_refundable"
--   --         (client_refund) and "balance = balance + p_client_amount" (split).
--
--   -- (b) wallet-funded client_refund restores the wallet:
--   SELECT balance FROM public.wallets WHERE user_id = '<CLIENT_UUID>';
--   SELECT public.admin_decide_dispute('<DISPUTE_UUID>'::uuid, 'client_refund', NULL, 'verify');
--   SELECT balance FROM public.wallets WHERE user_id = '<CLIENT_UUID>';
--   -- Expect: balance increased by the refundable amount.
--
--   -- (c) wallet-funded split credits the client portion:
--   SELECT public.admin_decide_dispute('<DISPUTE_UUID>'::uuid, 'split', <CLIENT_AMOUNT>, 'verify');
--   -- Expect: client wallet +<CLIENT_AMOUNT>; freelancer wallet +share.
--
--   -- (d) ledger identity after each decision:
--   --   freelancer_credit + platform_revenue == client_total_charged
-- ============================================================================
