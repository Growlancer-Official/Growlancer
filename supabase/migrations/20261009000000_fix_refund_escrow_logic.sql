-- ============================================================
-- Fix refund / escrow logic
-- ============================================================
-- 1. _refundable_amount: if a contract is marked escrow_funded but no escrow
--    row exists (rows created by the pre-fix fund flow), the money is still
--    held — fall back to the contract amount so refunds work in real time.
-- 2. request_contract_refund: never create a 0-amount refund request and
--    return a clear, actionable error when there is nothing to refund.

CREATE OR REPLACE FUNCTION public._refundable_amount(p_contract_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_escrow_amount NUMERIC;
  v_released NUMERIC := 0;
  v_ms JSONB;
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(amount, 0) INTO v_escrow_amount FROM public.escrow WHERE contract_id = p_contract_id;

  -- Fallback: contract is escrow-funded but the escrow row is missing
  -- (data created before the fund flow reliably wrote escrow rows). The
  -- funds are still held, so the refundable amount is the contract amount.
  IF v_escrow_amount = 0 AND v_contract.escrow_funded THEN
    v_escrow_amount := COALESCE(v_contract.amount, 0);
  END IF;

  SELECT milestones INTO v_ms FROM public.contracts WHERE id = p_contract_id;

  IF v_ms IS NOT NULL THEN
    -- Only funds actually moved OUT of escrow are non-refundable.
    -- 'completed' (submitted, awaiting approval) and 'approved' are still held
    -- in escrow, so they remain refundable.
    SELECT COALESCE(SUM((elem->>'amount')::NUMERIC), 0) INTO v_released
    FROM jsonb_array_elements(v_ms) AS elem
    WHERE (elem->>'status') IN ('released', 'paid');
  END IF;

  RETURN GREATEST(v_escrow_amount - v_released, 0);
END $$;

GRANT EXECUTE ON FUNCTION public._refundable_amount(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_contract_refund(
  p_contract_id UUID,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL,
  p_milestone_index INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_escrow RECORD;
  v_refundable NUMERIC;
  v_request_id UUID;
  v_request_type TEXT;
  v_work_started BOOLEAN;
BEGIN
  -- Auth: only the contract client may request
  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Contract not found'); END IF;
  IF v_contract.client_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: only the client can request a refund');
  END IF;

  -- Guards: no refund if already completed / already cancelled / disputed / frozen
  IF v_contract.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This contract is already closed');
  END IF;
  IF v_contract.status = 'disputed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This contract is under dispute — resolve the dispute first');
  END IF;
  IF v_contract.frozen_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This contract is frozen pending review');
  END IF;
  IF EXISTS (SELECT 1 FROM public.refund_requests
             WHERE contract_id = p_contract_id AND status IN ('pending_freelancer','pending_admin','approved','auto_approved')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A refund request is already in progress');
  END IF;

  SELECT * INTO v_escrow FROM public.escrow WHERE contract_id = p_contract_id;
  v_refundable := public._refundable_amount(p_contract_id);

  -- No money to refund? Always block (never create a 0-amount request).
  IF v_refundable <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No funds are currently held in escrow for this contract. Please fund the escrow first.'
    );
  END IF;

  -- Work-started detection: freelancer marked started, or any milestone released/paid
  v_work_started := v_contract.freelancer_started_at IS NOT NULL;
  IF NOT v_work_started THEN
    SELECT bool_or((elem->>'status') IN ('released','paid','completed','approved')) INTO v_work_started
    FROM jsonb_array_elements(COALESCE(v_contract.milestones, '[]'::jsonb)) AS elem;
    v_work_started := COALESCE(v_work_started, false);
  END IF;

  -- Determine request type + flow
  IF p_milestone_index IS NOT NULL THEN
    v_request_type := 'milestone_cancel';
  ELSIF NOT v_work_started THEN
    v_request_type := 'client_cancel_before_work';
  ELSE
    v_request_type := 'client_cancel_after_start';
  END IF;

  INSERT INTO public.refund_requests (
    contract_id, milestone_index, requested_by, requested_to,
    request_type, reason, description, refund_amount,
    status
  ) VALUES (
    p_contract_id, p_milestone_index, auth.uid(), v_contract.freelancer_id,
    v_request_type, p_reason, p_description, v_refundable,
    CASE WHEN v_request_type = 'client_cancel_before_work' THEN 'auto_approved' ELSE 'pending_freelancer' END
  ) RETURNING id INTO v_request_id;

  -- Case 1: before work → auto-refund immediately (no freelancer approval needed)
  IF v_request_type = 'client_cancel_before_work' THEN
    UPDATE public.contracts
    SET cancellation_requested_by = auth.uid(),
        cancellation_status = 'approved'
    WHERE id = p_contract_id;

    PERFORM public._refund_history_event(v_request_id, 'requested', auth.uid(), 'client',
      p_reason, jsonb_build_object('request_type', v_request_type, 'auto_approved', true));
    PERFORM public._refund_history_event(v_request_id, 'approved', NULL, 'system',
      'Automatic refund: work had not started', jsonb_build_object('amount', v_refundable));
  ELSE
    UPDATE public.contracts
    SET cancellation_requested_by = auth.uid(),
        cancellation_status = 'pending_freelancer'
    WHERE id = p_contract_id;

    PERFORM public._refund_history_event(v_request_id, 'requested', auth.uid(), 'client',
      p_reason, jsonb_build_object('request_type', v_request_type));
  END IF;

  -- Notifications
  PERFORM public._refund_notify(auth.uid(), 'refund',
    'Refund request submitted',
    'Your refund request for contract #' || p_contract_id::TEXT || ' has been submitted.', '/client/contracts',
    jsonb_build_object('contract_id', p_contract_id, 'request_id', v_request_id));
  PERFORM public._refund_notify(v_contract.freelancer_id, 'refund',
    CASE WHEN v_request_type = 'client_cancel_before_work'
         THEN 'Contract closed — automatic refund'
         ELSE 'Cancellation request — your response required' END,
    CASE WHEN v_request_type = 'client_cancel_before_work'
         THEN 'The client cancelled before work started. Escrow will be refunded automatically.'
         ELSE 'The client has requested cancellation. Accept to refund the remaining escrow, or reject to open a dispute.' END,
    '/dashboard/contracts',
    jsonb_build_object('contract_id', p_contract_id, 'request_id', v_request_id));

  -- Case 1 / Case 2 / automatic types → trigger refund execution (edge fn via cron)
  IF v_request_type IN ('client_cancel_before_work', 'milestone_cancel') THEN
    -- Escrow reversal happens in the refund-executor; here we just queue it.
    PERFORM public._refund_audit(auth.uid(), 'refund_requested', 'contract', p_contract_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('request_id', v_request_id, 'type', v_request_type));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_type', v_request_type,
    'refund_amount', v_refundable,
    'status', (SELECT status FROM public.refund_requests WHERE id = v_request_id)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.request_contract_refund(UUID, TEXT, TEXT, INT) TO authenticated;
