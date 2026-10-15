-- =============================================================================
-- MR-19 / MONEY-004 (+ RLS-004) — Fix comma-quoted SET search_path on money RPCs
-- =============================================================================
-- FINDING (docs/AUDIT_FINDINGS_DATABASE.md — MONEY-004 / RLS-004):
--   `cancel_withdrawal`, `release_milestone` and `process_withdrawal_complete` are
--   SECURITY DEFINER functions that were declared WITHOUT `SET search_path`. A
--   later dynamic-repair migration (`20261214000001_fix_definer_search_path.sql:43`)
--   pinned their `proconfig` using `quote_literal(v_schemas)`, which produced
--     SET search_path TO 'public, pg_catalog, auth'
--   i.e. a SINGLE quoted token. Postgres treats the entire quoted string as ONE
--   schema name that never matches, so the effective `search_path` becomes EMPTY
--   and every unqualified reference in the function body fails at runtime with
--   42P01 ("relation does not exist"). This is the live-proven root cause captured
--   in `20270117000000_fix_search_path_comma_class.sql` (which only patches the
--   LIVE bodies at runtime; the migration source remained defective).
--
-- WHY THESE THREE FUNCTIONS: each references `auth.uid()`, so `20261214000001`
--   appended `, auth` to the schema string — turning the token into
--   `'public, pg_catalog, auth'`. Functions with no `auth.` reference only got
--   `'public, pg_catalog'` and did NOT break in the same way.
--
-- FIX (source-of-truth, not a runtime patch):
--   Re-create the three functions in a NEW migration with a correctly-formed,
--   UNQUOTED comma-separated `SET search_path` clause (no embedded commas inside
--   quotes). Bodies are preserved verbatim from their authoritative (latest)
--   source definitions:
--     * cancel_withdrawal(UUID, UUID)      -> 20260525160000_wallet_rpcs.sql:292
--     * process_withdrawal_complete(UUID)  -> 20260617_fix_escrow_auth_and_add_transactions.sql:172
--     * release_milestone(UUID, INT)       -> 20260901000000_release_milestone_rpc.sql:14
--   Signatures, return types, authorization logic and transaction semantics are
--   UNCHANGED. This only repairs the malformed search_path clause — a
--   correctness fix that weakens NO auth/authz/RLS control.
--
-- IDEMPOTENT: CREATE OR REPLACE + idempotent GRANTs. Historical migrations are
--   NOT edited.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. cancel_withdrawal(UUID, UUID)  — 20260525160000_wallet_rpcs.sql:292
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_withdrawal(p_withdrawal_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_withdrawal RECORD;
  v_wallet wallets%ROWTYPE;
BEGIN
  -- Validate auth
  IF p_user_id <> auth.uid() THEN
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

-- -----------------------------------------------------------------------------
-- 2. process_withdrawal_complete(UUID) — 20260617_fix_escrow_auth_and_add_transactions.sql:172
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_withdrawal_complete(p_withdrawal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_withdrawal RECORD;
  v_wallet wallets%ROWTYPE;
BEGIN
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
  IF v_withdrawal.user_id <> auth.uid() AND NOT EXISTS (
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

-- -----------------------------------------------------------------------------
-- 3. release_milestone(UUID, INT) — 20260901000000_release_milestone_rpc.sql:14
-- -----------------------------------------------------------------------------
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

  -- Verify caller is the contract client
  IF v_contract.client_id <> auth.uid() THEN
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

-- -----------------------------------------------------------------------------
-- Re-apply execute grants (unchanged from prior definitions)
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_complete(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_milestone(UUID, INT) TO authenticated;

-- =============================================================================
-- LIVE-DB VERIFICATION REQUIRED
-- =============================================================================
-- 1) Confirm each function now carries a correctly-formed multi-element
--    search_path (NOT a single comma-joined quoted token):
--
--    SELECT p.proname,
--           array_to_string(p.proconfig, ' | ') AS proconfig
--      FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.proname IN ('cancel_withdrawal','release_milestone','process_withdrawal_complete')
--     ORDER BY p.proname;
--    -- EXPECT: proconfig includes `search_path=public, auth, pg_catalog`
--    --         (three separate path elements), NOT `search_path="public, pg_catalog, auth"`.
--
-- 2) Confirm NO residual comma-quoted search_path token remains anywhere:
--
--    SELECT n.nspname, p.proname, c AS proconfig_entry
--      FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--      CROSS JOIN LATERAL unnest(p.proconfig) AS c
--     WHERE c LIKE 'search_path=%'
--       AND c LIKE '%,%'
--       AND c LIKE '%''%';
--    -- EXPECT: 0 rows.
--
-- 3) Functional smoke test (as an authenticated owner) — must return success:true,
--    no 42P01:
--
--    SELECT public.cancel_withdrawal('<pending withdrawal id owned by caller>', '<caller uuid>');
--    SELECT public.release_milestone('<contract uuid owned by caller>', 0);
--    SELECT public.process_withdrawal_complete('<processing withdrawal id>');
-- =============================================================================
