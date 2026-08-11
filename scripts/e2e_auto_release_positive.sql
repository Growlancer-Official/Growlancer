-- E2E positive test: auto_release_milestone releases a DELIVERED milestone
-- whose grace period has elapsed. Uses a temporary contract + escrow, fully
-- ROLLED BACK — no real money moves.
BEGIN;

DO $$
DECLARE
  v_contract_id UUID;
  v_escrow_id UUID;
  v_client_id UUID;
  v_freelancer_id UUID;
  v_project_id UUID;
  v_result JSONB;
BEGIN
  -- Use real profile IDs so FKs are valid (rolled back anyway).
  SELECT id INTO v_client_id FROM public.profiles WHERE role = 'client' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_freelancer_id FROM public.profiles WHERE role = 'freelancer' ORDER BY created_at LIMIT 1;

  IF v_client_id IS NULL OR v_freelancer_id IS NULL THEN
    RAISE NOTICE 'No test profiles — skipping positive test.';
    RETURN;
  END IF;

  INSERT INTO public.projects (client_id, title, description, category, budget_min, budget_max, status)
  VALUES (v_client_id, 'Auto-release test', 'temp', 'data-analysis', 100, 500, 'open')
  RETURNING id INTO v_project_id;

  INSERT INTO public.contracts (
    client_id, freelancer_id, project_id, status, amount, escrow_funded,
    milestones, platform_fee
  ) VALUES (
    v_client_id, v_freelancer_id, v_project_id, 'active', 1000, false,
    jsonb_build_array(jsonb_build_object(
      'title', 'Test milestone',
      'status', 'delivered',
      'delivered_at', (now() - interval '100 hours'),
      'auto_release_hours', 72
    )),
    50
  ) RETURNING id INTO v_contract_id;

  INSERT INTO public.escrow (contract_id, client_id, freelancer_id, amount, status, funded_at)
  VALUES (v_contract_id, v_client_id, v_freelancer_id, 1000, 'funded', now())
  RETURNING id INTO v_escrow_id;

  -- Elapsed 100h > 72h → must release successfully.
  v_result := public.auto_release_milestone(v_contract_id, 0);
  RAISE NOTICE 'Auto-release result: %', v_result::text;

  IF v_result->>'success' <> 'true' THEN
    RAISE EXCEPTION 'FAIL: eligible delivered milestone was not auto-released: %', v_result;
  END IF;

  -- Verify the milestone is now released + escrow released.
  IF EXISTS (SELECT 1 FROM public.contracts WHERE id = v_contract_id AND milestones->0->>'status' <> 'released') THEN
    RAISE EXCEPTION 'FAIL: milestone status not released after auto-release';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.escrow WHERE id = v_escrow_id AND status = 'released') THEN
    RAISE EXCEPTION 'FAIL: escrow not released after all milestones auto-released';
  END IF;

  RAISE NOTICE 'PASS — auto-release released delivered milestone + escrow correctly.';
END $$;

ROLLBACK;
