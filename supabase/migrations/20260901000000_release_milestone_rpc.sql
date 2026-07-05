-- release_milestone: Securely release a single milestone with row-level locking
-- Prevents the "lost update" race condition where two simultaneous milestone
-- releases could silently overwrite each other.
--
-- Uses FOR UPDATE locking (same pattern as release_escrow).
-- Derives authorization from auth.uid() matching contract.client_id.
-- If this is the last milestone, delegates to release_escrow for full release.
--
-- NOTE: The escrow table does NOT have its own milestones column; milestone
-- status is tracked exclusively in contracts.milestones (JSONB). Partial
-- milestone releases update contracts.milestones and leave the escrow record
-- as-is until the final milestone triggers full release_escrow.

CREATE OR REPLACE FUNCTION release_milestone(
  p_contract_id UUID,
  p_milestone_index INT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
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
  FOR UPDATE;  -- 🔒 row-level lock prevents concurrent writes

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
    -- All milestones done → try full escrow release
    -- Check escrow status first: if not funded, skip release_escrow gracefully
    -- (release_escrow RAISEs EXCEPTION for non-funded escrow, so we check first)
    IF EXISTS (
      SELECT 1 FROM escrow
      WHERE contract_id = p_contract_id AND status = 'funded'
      FOR UPDATE  -- lock escrow row too, same transaction
    ) THEN
      -- Escrow is funded — proceed with full release
      BEGIN
        SELECT release_escrow(p_contract_id, v_contract.client_id) INTO v_release_result;
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

-- Grant execute to authenticated users (the RPC itself handles authorization)
GRANT EXECUTE ON FUNCTION release_milestone(UUID, INT) TO authenticated;

COMMENT ON FUNCTION release_milestone(UUID, INT) IS
  'Atomically release a milestone with FOR UPDATE locking. Prevents race conditions from concurrent milestone releases.';
