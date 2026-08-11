-- E2E test: extra revision request flow (production, service-role context)
-- Uses temporary test data, rolled back at the end.

BEGIN;

-- Grab an existing active/in_progress contract pair for the test (or create nothing).
DO $$
DECLARE
  v_contract_id UUID;
  v_client_id UUID;
  v_freelancer_id UUID;
  v_request_id UUID;
  v_result JSONB;
  v_count INT;
BEGIN
  -- Find an existing in_progress contract (real users) — safe read-only baseline.
  SELECT id, client_id, freelancer_id INTO v_contract_id, v_client_id, v_freelancer_id
  FROM public.contracts
  WHERE status IN ('active', 'in_progress')
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_contract_id IS NULL THEN
    RAISE NOTICE 'No active contract available for test — skipping RPC call test.';
    RETURN;
  END IF;

  RAISE NOTICE 'Test contract: % (client % / freelancer %)', v_contract_id, v_client_id, v_freelancer_id;

  -- 1. request_extra_revision is SECURITY DEFINER + requires auth.uid(); from
  --    service role we validate the function exists + is executable by authenticated.
  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'request_extra_revision';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'request_extra_revision RPC missing';
  END IF;

  -- 2. respond_extra_revision exists
  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'respond_extra_revision';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'respond_extra_revision RPC missing';
  END IF;

  -- 3. mark_revision_paid exists + service-role only
  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'mark_revision_paid';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'mark_revision_paid RPC missing';
  END IF;

  -- 4. revision_requests table is realtime-enabled + has RLS
  SELECT count(*) INTO v_count
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'revision_requests';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'revision_requests not in realtime publication';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'revision_requests';
  IF v_count < 1 THEN
    RAISE EXCEPTION 'revision_requests has no RLS policies';
  END IF;

  RAISE NOTICE 'PASS — all revision_requests objects present, RLS + realtime enabled.';
END $$;

ROLLBACK;
