-- E2E TEST: milestone delivered -> client notification
-- Uses synthetic rows (profiles table is empty; trigger only reads projects + contracts)
BEGIN;

-- 1. Cleanup any previous test runs
DELETE FROM public.notifications WHERE metadata->>'test_e2e' = '1';
DELETE FROM public.contracts WHERE id = 'e2e00000-0000-0000-0000-000000000001';
DELETE FROM public.projects WHERE id = 'e2e00000-0000-0000-0000-000000000002';

-- 2. Test parties (synthetic UUIDs + profiles to satisfy FK)
INSERT INTO public.profiles (id, email, role, name, is_admin, verification_status)
VALUES
  ('e2e00000-0000-0000-0000-000000000003', 'e2e-client@growlancer.test', 'client', 'E2E Client', false, 'unverified'),
  ('e2e00000-0000-0000-0000-000000000004', 'e2e-freelancer@growlancer.test', 'freelancer', 'E2E Freelancer', false, 'unverified');

INSERT INTO public.projects (id, client_id, title, description, budget_min, budget_max, status, created_at, updated_at)
VALUES (
  'e2e00000-0000-0000-0000-000000000002',
  'e2e00000-0000-0000-0000-000000000003',
  'E2E Delivery Test Project',
  'Synthetic project for delivery notification E2E test',
  1000, 5000, 'open', NOW(), NOW()
);

INSERT INTO public.contracts (id, project_id, client_id, freelancer_id, amount, platform_fee, freelancer_amount, status, milestones, created_at, updated_at)
VALUES (
  'e2e00000-0000-0000-0000-000000000001',
  'e2e00000-0000-0000-0000-000000000002',
  'e2e00000-0000-0000-0000-000000000003',
  'e2e00000-0000-0000-0000-000000000004',
  5000,
  250,
  4750,
  'active',
  jsonb_build_array(
    jsonb_build_object('title', 'Research & Data Prep', 'status', 'in_progress', 'amount', 2000),
    jsonb_build_object('title', 'Dashboard Build', 'status', 'pending', 'amount', 3000)
  ),
  NOW(), NOW()
);

-- 3. Simulate the FREELANCER marking milestone 0 as completed (final delivery)
-- Uses the REAL app path: mark_milestone_status RPC (SECURITY DEFINER).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-000000000004';
SET LOCAL request.jwt.claim.role = 'authenticated';

SELECT public.mark_milestone_status(
  'e2e00000-0000-0000-0000-000000000001'::uuid,
  0,
  'completed'
) AS rpc_result;

RESET ROLE;

-- 4. Verify: client got a "Final Delivery" notification
SELECT n.user_id AS notified_client,
       n.type,
       n.title,
       left(n.message, 70) AS message_preview,
       n.action_url
FROM public.notifications n
WHERE n.metadata->>'test_e2e' = '1'
   OR n.metadata->>'contract_id' = 'e2e00000-0000-0000-0000-000000000001'
ORDER BY n.created_at DESC
LIMIT 5;

ROLLBACK;
