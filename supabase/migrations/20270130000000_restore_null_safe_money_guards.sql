-- ============================================================================
-- Restore the NULL-safe auth guards on three money RPCs
--
-- Measured 2026-10-20 (live):
--   public.null_unsafe_auth_guard() -> cancel_withdrawal,
--                                      process_withdrawal_complete,
--                                      release_milestone
--   security_alerts -> 4 open HIGH rows (the three above + one stale
--                      release_escrow alert that 20270128000000 already fixed;
--                      stale_jwt_claim_check() is clean now).
--
-- ROOT CAUSE (same class as 20270124000000 did to release_escrow):
--   20270122000000_fix_money_function_search_path re-created these three
--   functions from their PRE-hardening source bodies while repairing the
--   malformed search_path. That silently reverted the NULL-safe guards added by
--   20270119000016/19.
--
--   Old guard shape:
--     IF p_user_id <> auth.uid() THEN ...            -- anon: NULL -> never fires
--     IF v.user_id <> auth.uid() AND NOT EXISTS (...) -- anon: NULL AND ... -> falsy
--     IF v_contract.client_id <> auth.uid() THEN ...  -- anon: NULL -> never fires
--
--   EXECUTE is currently revoked from anon for all three, so the NULL branch is
--   not reachable over PostgREST today — this is fail-closed hardening, not an
--   active breach. But the invariant must hold on its own: the project has
--   already had blanket grants widen a function once, and the next one would
--   make these reachable. process_withdrawal_complete would then let an
--   anonymous caller complete somebody's pending withdrawal (pending_balance
--   deducted, payout marked completed while no money moved).
--
-- FIX: re-state the three functions with identical bodies and grants, changing
--   ONLY the auth predicates to explicit NULL-safe forms. No money semantics,
--   signatures, return types or locking change.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. cancel_withdrawal(UUID, UUID)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_withdrawal(p_withdrawal_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_withdrawal RECORD;
  v_wallet wallets%ROWTYPE;
BEGIN
  -- NULL-safe: an anonymous caller has auth.uid() = NULL, and `x <> NULL`
  -- evaluates to NULL (falsy), which used to skip this branch entirely.
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Fetch the withdrawal record
  SELECT * INTO v_withdrawal
  FROM withdrawals
  WHERE id = p_withdrawal_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  -- Only cancel pending/processing withdrawals
  IF v_withdrawal.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal cannot be cancelled in its current state');
  END IF;

  -- Lock the wallet
  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- Move funds from pending_balance back to balance
  UPDATE wallets
  SET balance = balance + v_withdrawal.amount,
      pending_balance = pending_balance - v_withdrawal.amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Update withdrawal status
  UPDATE withdrawals
  SET status = 'cancelled'
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. process_withdrawal_complete(UUID)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_withdrawal_complete(p_withdrawal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_withdrawal RECORD;
  v_wallet wallets%ROWTYPE;
BEGIN
  -- Explicit NULL bail-out. `v_withdrawal.user_id <> NULL AND NOT EXISTS(...)`
  -- was NULL for an anonymous caller, so the whole guard silently passed.
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Fetch the withdrawal record
  SELECT * INTO v_withdrawal
  FROM withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  -- Only process pending/processing withdrawals
  IF v_withdrawal.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is not in a processable state');
  END IF;

  -- Validate auth: only the withdrawal owner or an admin can complete
  IF v_withdrawal.user_id IS DISTINCT FROM auth.uid() AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Lock the wallet and deduct pending_balance
  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- Ensure sufficient pending balance
  IF v_wallet.pending_balance < v_withdrawal.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient pending balance');
  END IF;

  -- Deduct from pending_balance directly (SECURITY DEFINER bypasses auth checks)
  UPDATE wallets
  SET pending_balance = pending_balance - v_withdrawal.amount,
      updated_at = NOW()
  WHERE user_id = v_withdrawal.user_id;

  -- Update withdrawal status
  UPDATE withdrawals
  SET status = 'completed',
      processed_at = NOW()
  WHERE id = p_withdrawal_id;

  -- Create transaction record
  INSERT INTO transactions (user_id, type, amount, status, description, source)
  VALUES (v_withdrawal.user_id, 'withdrawal', v_withdrawal.amount, 'completed',
          'Withdrawal completed (' || v_withdrawal.method || ')',
          v_withdrawal.method);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. release_milestone(UUID, INT)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_milestone(
  p_contract_id UUID,
  p_milestone_index INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_contract RECORD;
  v_milestones JSONB;
  v_milestone JSONB;
  v_all_released BOOLEAN;
  v_release_result BOOLEAN;
BEGIN
  -- === 1. Lock contract row + authorize ===
  SELECT * INTO v_contract
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;  -- row-level lock prevents concurrent writes

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract not found');
  END IF;

  -- Verify caller is the contract client. NULL-safe: `client_id <> NULL` is
  -- NULL (falsy), so an anonymous call used to skip this check.
  IF auth.uid() IS NULL OR v_contract.client_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: only the contract client can release milestones'
    );
  END IF;

  -- === 2. Parse milestones ===
  v_milestones := COALESCE(v_contract.milestones, '[]'::jsonb);

  -- Validate index bounds
  IF p_milestone_index < 0 OR p_milestone_index >= jsonb_array_length(v_milestones) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Milestone index %s out of bounds (0..%s)', p_milestone_index, jsonb_array_length(v_milestones) - 1)
    );
  END IF;

  -- === 3. Check current status (idempotency guard) ===
  v_milestone := v_milestones -> p_milestone_index;
  IF v_milestone->>'status' IN ('released', 'paid', 'completed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Milestone %s has already been released', p_milestone_index)
    );
  END IF;

  -- === 4. Update milestone status to 'released' ===
  v_milestones := jsonb_set(
    v_milestones,
    ARRAY[p_milestone_index::TEXT, 'status'],
    '"released"'::jsonb
  );

  -- === 5. Check if all milestones are now released ===
  SELECT bool_and(
    (elem->>'status') IN ('released', 'paid', 'completed')
  )
  INTO v_all_released
  FROM jsonb_array_elements(v_milestones) AS elem;

  -- === 6. Write updated milestones ===
  UPDATE contracts
  SET milestones = v_milestones,
      updated_at = NOW()
  WHERE id = p_contract_id;

  IF v_all_released THEN
    -- All milestones done -> try full escrow release
    -- Check escrow status first: if not funded, skip release_escrow gracefully
    -- (release_escrow RAISEs EXCEPTION for non-funded escrow, so we check first)
    IF EXISTS (
      SELECT 1 FROM escrow
      WHERE contract_id = p_contract_id AND status = 'funded'
      FOR UPDATE  -- lock escrow row too, same transaction
    ) THEN
      -- Escrow is funded — proceed with full release
      BEGIN
        SELECT public.release_escrow(p_contract_id, v_contract.client_id) INTO v_release_result;
      EXCEPTION
        WHEN OTHERS THEN
          -- If release_escrow raises (edge case), milestone is already marked released
          RETURN jsonb_build_object(
            'success', true,
            'all_released', true,
            'escrow_released', false,
            'message', 'All milestones released but escrow release failed: ' || SQLERRM
          );
      END;

      RETURN jsonb_build_object(
        'success', true,
        'all_released', true,
        'message', 'All milestones released; escrow fully released',
        'escrow_released', v_release_result
      );
    ELSE
      -- Escrow not yet funded — milestones are still marked as released
      RETURN jsonb_build_object(
        'success', true,
        'all_released', true,
        'escrow_released', false,
        'message', 'All milestones released but escrow is not yet funded — funds will release when escrow is funded'
      );
    END IF;
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'all_released', false,
      'message', format('Milestone %s released', p_milestone_index)
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.release_milestone(UUID, INT) IS
  'Atomically release a milestone with FOR UPDATE locking. Prevents race conditions from concurrent milestone releases.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Grants — unchanged (and anon asserted shut)
-- ────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cancel_withdrawal(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.process_withdrawal_complete(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_complete(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_milestone(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_milestone(UUID, INT) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Fail-closed assertions
-- ────────────────────────────────────────────────────────────────────────────
DO $assert$
DECLARE
  v_bad text[] := ARRAY[]::text[];
  v_fn  oid;
  v_def text;
BEGIN
  FOREACH v_def IN ARRAY ARRAY['cancel_withdrawal', 'process_withdrawal_complete', 'release_milestone']
  LOOP
    SELECT p.oid INTO v_fn FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_def
     ORDER BY p.oid LIMIT 1;

    IF v_fn IS NULL THEN
      v_bad := v_bad || (v_def || ' is missing')::text;
      CONTINUE;
    END IF;

    IF pg_get_functiondef(v_fn) NOT LIKE '%auth.uid() IS NULL%' THEN
      v_bad := v_bad || (v_def || ' has no explicit NULL bail-out')::text;
    END IF;

    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || (v_def || ' is anon-executable')::text;
    END IF;

    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      v_bad := v_bad || (v_def || ' lost authenticated EXECUTE')::text;
    END IF;
  END LOOP;

  -- The repo's own detector must be clean — this is the assertion that would
  -- have failed on 20270122000000 and on every later re-create from old bodies.
  IF EXISTS (SELECT 1 FROM public.null_unsafe_auth_guard()) THEN
    v_bad := v_bad || ('null_unsafe_auth_guard() still flags: ' ||
      (SELECT string_agg(function_name, ', ') FROM public.null_unsafe_auth_guard()))::text;
  END IF;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'null-safe guard migration failed its own assertions: %', array_to_string(v_bad, ' | ');
  END IF;
END $assert$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Resolve the stale alerts — ONLY when both detectors are actually clean.
--    The 4 open rows were: 3 real (now fixed above) + 1 release_escrow alert
--    left behind by 20270128000000. stale_jwt_claim_check() returns 0 rows now,
--    so keeping that alert "open" would make the dashboard lie in the other
--    direction. This block is a no-op if any finding remains.
-- ────────────────────────────────────────────────────────────────────────────
DO $resolve$
DECLARE
  v_resolved integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.null_unsafe_auth_guard())
     AND NOT EXISTS (SELECT 1 FROM public.stale_jwt_claim_check()) THEN
    UPDATE public.security_alerts
       SET is_resolved = true,
           resolved_at = now()
     WHERE is_resolved = false
       AND category IN ('null_unsafe_auth_guard', 'stale_jwt_claim_check');
    GET DIAGNOSTICS v_resolved = ROW_COUNT;
    RAISE NOTICE 'Resolved % stale auth-guard alert(s) after a clean detector run.', v_resolved;
  ELSE
    RAISE WARNING 'Auth-guard alerts left open — a detector still reports findings.';
  END IF;
END $resolve$;
