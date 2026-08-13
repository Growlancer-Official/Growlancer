-- ============================================================
-- AUTO-RELEASE WINDOW: default 72h → 10h, floor 24h → 10h
--
-- Business rule (owner): after the freelancer delivers, the client
-- reviews; if the client does not respond within the auto-release
-- window, the escrow releases to the freelancer automatically.
-- Default window is now 10 hours; the client may override it
-- between 10 and 168 hours (10h – 7 days).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. mark_milestone_status — delivery grace default 72 → 10
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_milestone_status(
  p_contract_id UUID,
  p_milestone_index INT,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_milestones JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract not found');
  END IF;

  -- Only the two parties may touch a contract's milestones.
  IF v_contract.client_id <> auth.uid() AND v_contract.freelancer_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: not a party to this contract');
  END IF;

  -- Milestones are frozen while a dispute is open.
  IF v_contract.status = 'disputed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Milestone actions are frozen while this contract is in dispute');
  END IF;

  -- 'delivered' is the final-delivery status (auto-release timer base).
  IF p_status NOT IN ('pending', 'in_progress', 'completed', 'delivered') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid milestone status');
  END IF;

  IF v_contract.milestones IS NULL OR jsonb_typeof(v_contract.milestones) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No milestones on this contract');
  END IF;

  IF p_milestone_index < 0 OR p_milestone_index >= jsonb_array_length(v_contract.milestones) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Milestone index out of range');
  END IF;

  v_milestones := jsonb_set(v_contract.milestones, ARRAY[p_milestone_index::TEXT, 'status'], to_jsonb(p_status));

  -- Delivery timestamp + grace window default (10h) when the freelancer delivers.
  IF p_status = 'delivered' THEN
    v_milestones := jsonb_set(v_milestones, ARRAY[p_milestone_index::TEXT, 'delivered_at'], to_jsonb(now()));
    IF (v_milestones -> p_milestone_index -> 'auto_release_hours') IS NULL THEN
      v_milestones := jsonb_set(v_milestones, ARRAY[p_milestone_index::TEXT, 'auto_release_hours'], to_jsonb(10));
    END IF;
  END IF;

  UPDATE public.contracts SET milestones = v_milestones, updated_at = NOW() WHERE id = p_contract_id;

  RETURN jsonb_build_object('success', true, 'milestones', v_milestones);
END $$;

REVOKE ALL ON FUNCTION public.mark_milestone_status(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_milestone_status(UUID, INT, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. set_auto_release_hours — client override now 10–168 h
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_auto_release_hours(
  p_contract_id UUID,
  p_hours INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_milestones JSONB;
  v_idx INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  IF p_hours IS NULL OR p_hours < 10 OR p_hours > 168 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auto-release window must be between 10 and 168 hours (10 hours – 7 days)');
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract not found');
  END IF;

  -- Only the client can set the auto-release window.
  IF v_contract.client_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: only the client can set the auto-release window');
  END IF;

  -- Milestone contracts: apply to every milestone (legacy behaviour).
  IF v_contract.milestones IS NOT NULL AND jsonb_typeof(v_contract.milestones) = 'array'
     AND jsonb_array_length(v_contract.milestones) > 0 THEN
    v_milestones := v_contract.milestones;
    FOR v_idx IN 0 .. jsonb_array_length(v_milestones) - 1 LOOP
      v_milestones := jsonb_set(v_milestones, ARRAY[v_idx::TEXT, 'auto_release_hours'], to_jsonb(p_hours));
    END LOOP;
    UPDATE public.contracts
    SET milestones = v_milestones, auto_release_hours = p_hours, updated_at = NOW()
    WHERE id = p_contract_id;
    RETURN jsonb_build_object('success', true, 'auto_release_hours', p_hours, 'milestones', v_milestones);
  END IF;

  -- Milestone-less contracts: contract-level window.
  UPDATE public.contracts
  SET auto_release_hours = p_hours, updated_at = NOW()
  WHERE id = p_contract_id;

  RETURN jsonb_build_object('success', true, 'auto_release_hours', p_hours);
END $$;

REVOKE ALL ON FUNCTION public.set_auto_release_hours(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_auto_release_hours(UUID, INT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. mark_contract_delivered — milestone-less delivery default 72 → 10
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_contract_delivered(p_contract_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract not found');
  END IF;

  -- Only the freelancer may mark delivery.
  IF v_contract.freelancer_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: only the freelancer can mark delivery');
  END IF;

  IF v_contract.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This contract is already closed');
  END IF;
  IF v_contract.status = 'disputed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Milestone actions are frozen while this contract is in dispute');
  END IF;
  IF v_contract.frozen_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This contract is frozen pending review');
  END IF;
  IF NOT v_contract.escrow_funded THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escrow is not funded yet — fund the escrow before delivering');
  END IF;

  -- This path is for milestone-less contracts; milestone contracts use the
  -- per-milestone delivery flow instead.
  IF v_contract.milestones IS NOT NULL AND jsonb_typeof(v_contract.milestones) = 'array'
     AND jsonb_array_length(v_contract.milestones) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Use per-milestone delivery for milestone contracts');
  END IF;

  -- Idempotent: re-delivery just refreshes the timer.
  UPDATE public.contracts
  SET delivered_at = NOW(),
      auto_release_hours = COALESCE(v_contract.auto_release_hours, 10),
      updated_at = NOW()
  WHERE id = p_contract_id;

  PERFORM public._refund_notify(v_contract.client_id, 'milestone',
    'Work delivered — review within the auto-release window',
    'The freelancer has delivered the full project. Review it in the workspace — the escrow auto-releases to the freelancer after the review window if you do not respond.',
    '/client/workspace?contract=' || p_contract_id::TEXT,
    jsonb_build_object('contract_id', p_contract_id));

  RETURN jsonb_build_object(
    'success', true,
    'delivered_at', now(),
    'auto_release_hours', COALESCE(v_contract.auto_release_hours, 10)
  );
END $$;

REVOKE ALL ON FUNCTION public.mark_contract_delivered(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_contract_delivered(UUID) TO authenticated;
