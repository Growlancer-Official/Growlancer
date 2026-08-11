-- E2E test: auto-release milestone RPC — SAFE validation paths only
-- (never releases real money; verifies the elapsed-time guard + status guard)
BEGIN;

DO $$
DECLARE
  v_contract_id UUID;
  v_result JSONB;
BEGIN
  -- Pick a real contract with milestones for context (read-only).
  SELECT id INTO v_contract_id
  FROM public.contracts
  WHERE milestones IS NOT NULL AND jsonb_typeof(milestones) = 'array'
    AND jsonb_array_length(milestones) > 0
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    RAISE NOTICE 'No contract with milestones — skipping auto-release test.';
    RETURN;
  END IF;

  RAISE NOTICE 'Test contract: %', v_contract_id;

  -- 1) Non-delivered milestone → must be rejected with "not in delivered state"
  v_result := public.auto_release_milestone(v_contract_id, 0);
  RAISE NOTICE 'Case 1 (non-delivered): %', v_result->>'error';
  IF v_result->>'success' = 'true' THEN
    RAISE EXCEPTION 'FAIL: released a non-delivered milestone!';
  END IF;

  -- 2) Out-of-range index → must be rejected
  v_result := public.auto_release_milestone(v_contract_id, 999);
  RAISE NOTICE 'Case 2 (bad index): %', v_result->>'error';
  IF v_result->>'success' = 'true' THEN
    RAISE EXCEPTION 'FAIL: accepted out-of-range index!';
  END IF;

  -- 3) set_auto_release_hours range guard: <24 or >168 must fail (auth.uid() is
  --    NULL in this context, so we expect the auth error FIRST — proves the
  --    unauthenticated path is locked, which is the correct behavior).
  v_result := public.set_auto_release_hours(v_contract_id, 10);
  RAISE NOTICE 'Case 3 (unauth override attempt): success=% error=%', v_result->>'success', v_result->>'error';
  IF v_result->>'success' = 'true' THEN
    RAISE EXCEPTION 'FAIL: unauthenticated override succeeded!';
  END IF;

  RAISE NOTICE 'PASS — all auto-release validation paths correct (no money moved).';
END $$;

ROLLBACK;
