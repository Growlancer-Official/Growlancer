-- ═══════════════════════════════════════════════════════════════════════════
-- FULL-CONTRACT AUTO-RELEASE (milestone-less, 2026-12-17)
--
-- Milestone-based contracts already auto-release after delivery (delivered_at
-- is stored inside each milestone). Milestone-less contracts ("full contract
-- escrow") had NO auto-release — the freelancer could deliver files and the
-- client could simply never respond, leaving the payment held forever.
--
-- This migration brings the same delivery-based protection to milestone-less
-- contracts:
--   1. contracts.delivered_at + contracts.auto_release_hours (contract level)
--   2. mark_contract_delivered — freelancer marks the FULL contract delivered:
--      sets delivered_at = NOW() and auto_release_hours (default 72). The timer
--      starts ONLY at delivery — how many days the work took is irrelevant.
--   3. set_auto_release_hours — also supports milestone-less contracts
--      (24–168 h, same range as milestones).
--   4. auto_release_contract — SERVICE-ROLE ONLY (hourly cron). Verifies the
--      contract is delivered, not disputed/frozen, and the grace window has
--      elapsed, then calls release_escrow (which completes the contract, pays
--      the freelancer and books the commission). Elapsed-time enforced in SQL.
--
-- After release_escrow, the contract is 'completed' — request_contract_refund
-- already blocks refunds on completed contracts and released escrow, so
-- "successful payment = no refund" holds end-to-end.
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) columns
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_release_hours INT;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) mark_contract_delivered — freelancer delivers the full contract
-- ────────────────────────────────────────────────────────────────────────────
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
      auto_release_hours = COALESCE(v_contract.auto_release_hours, 72),
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
    'auto_release_hours', COALESCE(v_contract.auto_release_hours, 72)
  );
END $$;

REVOKE ALL ON FUNCTION public.mark_contract_delivered(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_contract_delivered(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) set_auto_release_hours — support milestone-less contracts
-- ────────────────────────────────────────────────────────────────────────────
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

  IF p_hours IS NULL OR p_hours < 24 OR p_hours > 168 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auto-release window must be between 24 and 168 hours (1–7 days)');
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

-- ────────────────────────────────────────────────────────────────────────────
-- 4) auto_release_contract — SERVICE-ROLE ONLY (hourly cron)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_release_contract(p_contract_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_delivered_at TIMESTAMPTZ;
  v_auto_hours NUMERIC;
  v_released BOOLEAN;
BEGIN
  -- Service-role only (cron). The JWT role claim cannot be spoofed from a browser.
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: service role required');
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract not found');
  END IF;

  IF v_contract.status = 'disputed' OR v_contract.frozen_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract is disputed or frozen');
  END IF;

  v_delivered_at := v_contract.delivered_at;
  IF v_delivered_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract has not been delivered yet');
  END IF;

  v_auto_hours := COALESCE(v_contract.auto_release_hours, 72);
  IF (EXTRACT(EPOCH FROM (NOW() - v_delivered_at)) / 3600) < v_auto_hours THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Grace period not elapsed: %.1f / %s h', EXTRACT(EPOCH FROM (NOW() - v_delivered_at)) / 3600, v_auto_hours)
    );
  END IF;

  -- release_escrow completes the contract, pays the freelancer, books the
  -- commission. Pass NULL client id — the service-role bypass covers it.
  SELECT public.release_escrow(p_contract_id, NULL) INTO v_released;
  IF NOT v_released THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escrow release failed');
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Contract auto-released after delivery review window');
END $$;

REVOKE ALL ON FUNCTION public.auto_release_contract(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_release_contract(UUID) TO service_role;
