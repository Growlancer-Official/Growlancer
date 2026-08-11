-- ============================================================================
-- AUTO-RELEASE MILESTONES (delivery-based, 2026-12-11)
--
-- Implements the delivery-based auto-release timer:
--   1. mark_milestone_status accepts a new 'delivered' status. When the
--      freelancer marks a milestone delivered, delivered_at = NOW() is stored
--      inside that milestone object (and auto_release_hours defaults to 72).
--   2. set_auto_release_hours — client-side override (24–168 hours) applied to
--      every milestone of the contract. Both parties can agree on a window.
--   3. auto_release_milestone — SERVICE-ROLE ONLY (called hourly by the
--      milestone-auto-release cron edge function). Verifies the milestone is
--      delivered and the grace period has fully elapsed, then releases it and
--      (when it was the last one) releases the whole escrow. The elapsed-time
--      check is enforced in SQL (defense in depth — the edge function also
--      filters, but the RPC is the authority).
--   4. release_escrow gains a service-role bypass so the cron path can finish
--      the final full release (auth.uid() is NULL for cron → old code always
--      raised). The bypass only fires when the caller JWT role is
--      'service_role' — impossible to spoof from the browser.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) mark_milestone_status — add 'delivered' + delivered_at + auto_release_hours
-- ────────────────────────────────────────────────────────────────────────────
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

  -- 'delivered' is the new final-delivery status (auto-release timer base).
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

  -- Delivery timestamp + grace window default (72h) when the freelancer delivers.
  IF p_status = 'delivered' THEN
    v_milestones := jsonb_set(v_milestones, ARRAY[p_milestone_index::TEXT, 'delivered_at'], to_jsonb(now()));
    IF (v_milestones -> p_milestone_index -> 'auto_release_hours') IS NULL THEN
      v_milestones := jsonb_set(v_milestones, ARRAY[p_milestone_index::TEXT, 'auto_release_hours'], to_jsonb(72));
    END IF;
  END IF;

  UPDATE public.contracts SET milestones = v_milestones, updated_at = NOW() WHERE id = p_contract_id;

  RETURN jsonb_build_object('success', true, 'milestones', v_milestones);
END $$;

REVOKE ALL ON FUNCTION public.mark_milestone_status(UUID, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_milestone_status(UUID, INT, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) set_auto_release_hours — client override (24–168 h), applied to all milestones
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

  IF v_contract.milestones IS NULL OR jsonb_typeof(v_contract.milestones) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No milestones on this contract');
  END IF;

  v_milestones := v_contract.milestones;
  FOR v_idx IN 0 .. jsonb_array_length(v_milestones) - 1 LOOP
    v_milestones := jsonb_set(v_milestones, ARRAY[v_idx::TEXT, 'auto_release_hours'], to_jsonb(p_hours));
  END LOOP;

  UPDATE public.contracts SET milestones = v_milestones, updated_at = NOW() WHERE id = p_contract_id;

  RETURN jsonb_build_object('success', true, 'auto_release_hours', p_hours, 'milestones', v_milestones);
END $$;

REVOKE ALL ON FUNCTION public.set_auto_release_hours(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_auto_release_hours(UUID, INT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) release_escrow — allow the cron's service-role context to finish a full
--    release (auth.uid() is NULL for cron; the role claim is unforgeable).
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
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  IF NOT v_is_service_role AND v_contract.client_id IS DISTINCT FROM p_client_id THEN
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
  -- p_amount IS NULL → _book derives the pool from escrow.amount itself.
  PERFORM public._book_escrow_release(p_contract_id, NULL);

  RETURN TRUE;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) auto_release_milestone — SERVICE-ROLE ONLY. Verifies the delivery grace
--    period elapsed, then releases the milestone (full escrow if last one).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_release_milestone(
  p_contract_id UUID,
  p_milestone_index INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_milestones JSONB;
  v_milestone JSONB;
  v_delivered_at TIMESTAMPTZ;
  v_auto_hours NUMERIC;
  v_all_released BOOLEAN;
  v_release_result BOOLEAN;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract not found');
  END IF;

  -- No auto-release while disputed or frozen.
  IF v_contract.status = 'disputed' OR v_contract.frozen_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract is disputed or frozen');
  END IF;

  v_milestones := COALESCE(v_contract.milestones, '[]'::jsonb);
  IF p_milestone_index < 0 OR p_milestone_index >= jsonb_array_length(v_milestones) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Milestone index out of range');
  END IF;

  v_milestone := v_milestones -> p_milestone_index;

  -- Must be delivered, and the grace period must have FULLY elapsed.
  IF v_milestone->>'status' <> 'delivered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Milestone is not in delivered state');
  END IF;

  v_delivered_at := (v_milestone->>'delivered_at')::TIMESTAMPTZ;
  IF v_delivered_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Milestone has no delivered_at timestamp');
  END IF;

  v_auto_hours := COALESCE((v_milestone->>'auto_release_hours')::NUMERIC, 72);
  IF v_auto_hours < 1 THEN v_auto_hours := 72; END IF;

  IF (EXTRACT(EPOCH FROM (NOW() - v_delivered_at)) / 3600) < v_auto_hours THEN
    RETURN jsonb_build_object(
      'success', false, 'error',
      format('Grace period not elapsed: %.1f / %s h', EXTRACT(EPOCH FROM (NOW() - v_delivered_at)) / 3600, v_auto_hours)
    );
  END IF;

  -- Mark released (idempotent — same statuses as release_milestone)
  v_milestones := jsonb_set(
    v_milestones,
    ARRAY[p_milestone_index::TEXT, 'status'],
    '"released"'::jsonb
  );

  SELECT bool_and((elem->>'status') IN ('released', 'paid', 'completed'))
  INTO v_all_released
  FROM jsonb_array_elements(v_milestones) AS elem;

  UPDATE public.contracts
  SET milestones = v_milestones, updated_at = NOW()
  WHERE id = p_contract_id;

  IF v_all_released THEN
    IF EXISTS (SELECT 1 FROM public.escrow WHERE contract_id = p_contract_id AND status = 'funded' FOR UPDATE) THEN
      BEGIN
        SELECT public.release_escrow(p_contract_id, v_contract.client_id) INTO v_release_result;
      EXCEPTION
        WHEN OTHERS THEN
          RETURN jsonb_build_object(
            'success', true, 'all_released', true, 'escrow_released', false,
            'message', 'All milestones auto-released but escrow release failed: ' || SQLERRM
          );
      END;
      RETURN jsonb_build_object(
        'success', true, 'all_released', true, 'escrow_released', v_release_result,
        'message', 'All milestones auto-released; escrow fully released'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', true, 'all_released', true, 'escrow_released', false,
        'message', 'All milestones auto-released but escrow is not funded yet'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'all_released', false,
    'message', format('Milestone %s auto-released', p_milestone_index)
  );
END $$;

REVOKE ALL ON FUNCTION public.auto_release_milestone(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_release_milestone(UUID, INT) TO service_role;
