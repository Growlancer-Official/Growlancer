-- ═══════════════════════════════════════════════════════════════════════════
-- FRAUD-PROOF DELIVERY REFUND (2026-12-10)
--
-- GAP (reported by founder): on milestone-less contracts, the client could
-- request a refund and get an AUTO-APPROVED refund even after the freelancer
-- delivered work — because work-started detection only looked at
-- freelancer_started_at and milestone statuses. A freelancer who uploads
-- deliverable files (contract_files) without ever pressing "Start Work" left
-- freelancer_started_at NULL, so the client could claim "work never started",
-- keep the deliverables AND get the full escrow back (fraud).
--
-- FIX:
--   1. Work-started / delivery evidence now ALSO includes:
--        - any contract_files row uploaded by the freelancer
--        - any milestone in 'in_progress' | 'completed' | 'approved' |
--          'released' | 'paid'
--   2. If ANY delivery evidence exists, the refund request ALWAYS becomes
--      'client_cancel_after_start' (status pending_freelancer) — the
--      freelancer must accept, or reject → automatic dispute + escrow freeze.
--      Never auto-approve once work evidence exists.
--   3. If the client's reason is an accusation (fraud / scam / abuse / work
--      not delivered claims on top of delivery evidence), route to
--      'pending_admin' with the escrow FROZEN so an admin reviews evidence
--      before any money moves.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_delivered BOOLEAN;
  v_has_files BOOLEAN;
  v_accusation BOOLEAN;
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

  -- ═════ DELIVERY EVIDENCE (fraud-proof) ═════════════════════════════════
  -- Any of these proves work happened — the client can never auto-refund.
  v_work_started := v_contract.freelancer_started_at IS NOT NULL;
  v_delivered := false;

  -- Milestone evidence: in_progress / completed / approved / released / paid
  IF NOT v_work_started THEN
    SELECT bool_or((elem->>'status') IN ('in_progress','completed','approved','released','paid'))
      INTO v_work_started
    FROM jsonb_array_elements(COALESCE(v_contract.milestones, '[]'::jsonb)) AS elem;
    v_work_started := COALESCE(v_work_started, false);
  END IF;

  -- Deliverable file evidence: freelancer uploaded any file to the workspace.
  -- (This closes the milestone-less fraud hole — uploaded work is proof of
  --  delivery even when freelancer_started_at was never set.)
  SELECT EXISTS (
    SELECT 1 FROM public.contract_files
    WHERE contract_id = p_contract_id AND uploaded_by = v_contract.freelancer_id
  ) INTO v_has_files;
  v_delivered := v_work_started OR COALESCE(v_has_files, false);

  -- Accusation reasons: client claims fraud/scam/abuse on delivered work →
  -- freeze escrow and let an admin review evidence before any money moves.
  v_accusation := p_reason ILIKE '%fraud%' OR p_reason ILIKE '%scam%'
    OR p_reason ILIKE '%abuse%' OR p_reason ILIKE '%stole%'
    OR p_reason ILIKE '%fake%' OR p_reason ILIKE '%no work%'
    OR p_reason ILIKE '%not delivered%';

  -- ═════ FLOW SELECTION ═════════════════════════════════════════════════
  IF p_milestone_index IS NOT NULL THEN
    v_request_type := 'milestone_cancel';
  ELSIF v_delivered AND v_accusation THEN
    -- Fraud accusation on delivered work → admin review, escrow FROZEN.
    v_request_type := 'fraud';
  ELSIF NOT v_delivered THEN
    -- Genuinely nothing started: auto refund is fair.
    v_request_type := 'client_cancel_before_work';
  ELSE
    -- Work/delivery evidence exists → freelancer must respond.
    v_request_type := 'client_cancel_after_start';
  END IF;

  INSERT INTO public.refund_requests (
    contract_id, milestone_index, requested_by, requested_to,
    request_type, reason, description, refund_amount,
    status
  ) VALUES (
    p_contract_id, p_milestone_index, auth.uid(),
    CASE WHEN v_request_type = 'fraud' THEN NULL ELSE v_contract.freelancer_id END,
    v_request_type, p_reason, p_description, v_refundable,
    CASE
      WHEN v_request_type = 'client_cancel_before_work' THEN 'auto_approved'
      WHEN v_request_type = 'fraud' THEN 'pending_admin'
      ELSE 'pending_freelancer'
    END
  ) RETURNING id INTO v_request_id;

  -- ═════ CONTRACT / ESCROW SIDE EFFECTS ═════════════════════════════════
  IF v_request_type = 'client_cancel_before_work' THEN
    UPDATE public.contracts
    SET cancellation_requested_by = auth.uid(), cancellation_status = 'approved'
    WHERE id = p_contract_id;
    PERFORM public._refund_history_event(v_request_id, 'requested', auth.uid(), 'client',
      p_reason, jsonb_build_object('request_type', v_request_type, 'auto_approved', true));
    PERFORM public._refund_history_event(v_request_id, 'approved', NULL, 'system',
      'Automatic refund: work had not started', jsonb_build_object('amount', v_refundable));
  ELSIF v_request_type = 'fraud' THEN
    -- Freeze escrow so nobody can move the money during admin review.
    UPDATE public.escrow SET status = 'frozen' WHERE contract_id = p_contract_id;
    UPDATE public.contracts
    SET cancellation_requested_by = auth.uid(), cancellation_status = 'pending_admin',
        status = 'disputed', updated_at = now()
    WHERE id = p_contract_id;
    PERFORM public._refund_history_event(v_request_id, 'requested', auth.uid(), 'client',
      p_reason, jsonb_build_object('request_type', 'fraud', 'escrow_frozen', true));
    -- Alert the freelancer + admin immediately.
    PERFORM public._refund_notify(v_contract.freelancer_id, 'dispute',
      'Fraud accusation — escrow frozen',
      'The client has accused this contract of fraud. Escrow is frozen and our team is reviewing the workspace evidence (files, chat, timeline).',
      '/dashboard/contracts', jsonb_build_object('contract_id', p_contract_id, 'request_id', v_request_id));
    PERFORM public._refund_notify(
      (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1), 'admin',
      'Fraud accusation requires review',
      'Client accused contract #' || p_contract_id::TEXT || ' of fraud. Escrow frozen — review evidence and decide.',
      '/admin/disputes', jsonb_build_object('contract_id', p_contract_id, 'request_id', v_request_id));
  ELSE
    UPDATE public.contracts
    SET cancellation_requested_by = auth.uid(), cancellation_status = 'pending_freelancer'
    WHERE id = p_contract_id;
    PERFORM public._refund_history_event(v_request_id, 'requested', auth.uid(), 'client',
      p_reason, jsonb_build_object('request_type', v_request_type));
  END IF;

  -- ═════ NOTIFICATIONS ═════════════════════════════════════════════════
  PERFORM public._refund_notify(auth.uid(), 'refund',
    'Refund request submitted',
    'Your refund request for contract #' || p_contract_id::TEXT || ' has been submitted.', '/client/contracts',
    jsonb_build_object('contract_id', p_contract_id, 'request_id', v_request_id));

  IF v_request_type = 'client_cancel_after_start' THEN
    PERFORM public._refund_notify(v_contract.freelancer_id, 'refund',
      'Cancellation request — your response required',
      'The client has requested cancellation after work evidence was found. Accept to refund the remaining escrow, or reject to open a dispute and protect your payment.',
      '/dashboard/contracts',
      jsonb_build_object('contract_id', p_contract_id, 'request_id', v_request_id));
  ELSIF v_request_type = 'client_cancel_before_work' THEN
    PERFORM public._refund_notify(v_contract.freelancer_id, 'refund',
      'Contract closed — automatic refund',
      'The client cancelled before work started. Escrow will be refunded automatically.',
      '/dashboard/contracts',
      jsonb_build_object('contract_id', p_contract_id, 'request_id', v_request_id));
  END IF;

  -- ═════ EXECUTION ═════════════════════════════════════════════════════
  IF v_request_type IN ('client_cancel_before_work', 'milestone_cancel') THEN
    PERFORM public._refund_audit(auth.uid(), 'refund_requested', 'contract', p_contract_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('request_id', v_request_id, 'type', v_request_type));
  ELSIF v_request_type = 'fraud' THEN
    PERFORM public._refund_audit(auth.uid(), 'fraud_reported', 'contract', p_contract_id::TEXT,
      v_refundable, 'INR', jsonb_build_object('request_id', v_request_id, 'escrow_frozen', true));
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
