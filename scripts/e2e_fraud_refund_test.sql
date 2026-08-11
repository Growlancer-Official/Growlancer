-- E2E TEST: fraud-proof refund — 3 scenarios
-- 1. Milestone-less contract + freelancer uploaded file → client "cancel" must
--    become client_cancel_after_start (pending_freelancer), NOT auto_approved.
-- 2. Fraud accusation on delivered work → type=fraud, status=pending_admin, escrow frozen.
-- 3. Genuine before-work cancel → auto_approved (unchanged, fair).
BEGIN;

-- Cleanup prior runs
DELETE FROM public.refund_requests WHERE requested_by = 'e2e00000-0000-0000-0000-000000000003';
DELETE FROM public.contract_files WHERE contract_id = 'e2e00000-0000-0000-0000-000000000001';
DELETE FROM public.contracts WHERE id IN ('e2e00000-0000-0000-0000-000000000001','e2e00000-0000-0000-0000-000000000011');
DELETE FROM public.escrow WHERE contract_id IN ('e2e00000-0000-0000-0000-000000000001','e2e00000-0000-0000-0000-000000000011');
DELETE FROM public.projects WHERE id IN ('e2e00000-0000-0000-0000-000000000002','e2e00000-0000-0000-0000-000000000012');

-- Parties
INSERT INTO public.profiles (id, email, role, name, is_admin, verification_status)
VALUES
  ('e2e00000-0000-0000-0000-000000000003', 'e2e-client@growlancer.test', 'client', 'E2E Client', false, 'unverified'),
  ('e2e00000-0000-0000-0000-000000000004', 'e2e-freelancer@growlancer.test', 'freelancer', 'E2E Freelancer', false, 'unverified')
ON CONFLICT (id) DO NOTHING;

-- ── SCENARIO 1+2: milestone-less contract with delivered files ────────────
INSERT INTO public.projects (id, client_id, title, description, budget_min, budget_max, status, created_at, updated_at)
VALUES ('e2e00000-0000-0000-0000-000000000002', 'e2e00000-0000-0000-0000-000000000003',
  'E2E Fraud Test Project', 'Synthetic', 1000, 5000, 'open', NOW(), NOW());

INSERT INTO public.contracts (id, project_id, client_id, freelancer_id, amount, platform_fee, freelancer_amount, status, milestones, escrow_funded, created_at, updated_at)
VALUES ('e2e00000-0000-0000-0000-000000000001', 'e2e00000-0000-0000-0000-000000000002',
  'e2e00000-0000-0000-0000-000000000003', 'e2e00000-0000-0000-0000-000000000004',
  5000, 250, 4750, 'active', '[]'::jsonb, true, NOW(), NOW());

INSERT INTO public.escrow (id, contract_id, client_id, freelancer_id, amount, status, created_at, updated_at)
VALUES ('e2e00000-0000-0000-0000-000000000021', 'e2e00000-0000-0000-0000-000000000001',
  'e2e00000-0000-0000-0000-000000000003', 'e2e00000-0000-0000-0000-000000000004',
  5000, 'funded', NOW(), NOW());

-- Freelancer uploaded a deliverable (proof of work) — freelancer_started_at stays NULL
INSERT INTO public.contract_files (id, contract_id, uploaded_by, file_name, file_path, file_size, file_type, public_url, created_at)
VALUES ('e2e00000-0000-0000-0000-000000000031', 'e2e00000-0000-0000-0000-000000000001',
  'e2e00000-0000-0000-0000-000000000004', 'final-dashboard.pbix', 'e2e/final-dashboard.pbix', 2048, 'application/octet-stream', 'https://x.test/final-dashboard.pbix', NOW());

-- SCENARIO 1: client says "cancel" with neutral reason → must be pending_freelancer
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT public.request_contract_refund('e2e00000-0000-0000-0000-000000000001', 'I changed my mind')
  AS scenario1_neutral_cancel;
RESET ROLE;

-- SCENARIO 2: client accuses fraud on the SAME delivered contract
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT public.request_contract_refund('e2e00000-0000-0000-0000-000000000001', 'This is fraud, freelancer scammed me and work was not delivered')
  AS scenario2_fraud_accusation;
RESET ROLE;

-- Verify state
SELECT r.request_type, r.status, e.status AS escrow_status
FROM public.refund_requests r
JOIN public.escrow e ON e.contract_id = r.contract_id
WHERE r.requested_by = 'e2e00000-0000-0000-0000-000000000003'
  AND r.contract_id = 'e2e00000-0000-0000-0000-000000000001'
ORDER BY r.created_at;

-- ── SCENARIO 3: genuine before-work cancel → auto_approved ────────────────
INSERT INTO public.projects (id, client_id, title, description, budget_min, budget_max, status, created_at, updated_at)
VALUES ('e2e00000-0000-0000-0000-000000000012', 'e2e00000-0000-0000-0000-000000000003',
  'E2E Before-Work Project', 'Synthetic', 1000, 2000, 'open', NOW(), NOW());

INSERT INTO public.contracts (id, project_id, client_id, freelancer_id, amount, platform_fee, freelancer_amount, status, milestones, escrow_funded, created_at, updated_at)
VALUES ('e2e00000-0000-0000-0000-000000000011', 'e2e00000-0000-0000-0000-000000000012',
  'e2e00000-0000-0000-0000-000000000003', 'e2e00000-0000-0000-0000-000000000004',
  2000, 100, 1900, 'active', '[]'::jsonb, true, NOW(), NOW());

INSERT INTO public.escrow (id, contract_id, client_id, freelancer_id, amount, status, created_at, updated_at)
VALUES ('e2e00000-0000-0000-0000-000000000022', 'e2e00000-0000-0000-0000-000000000011',
  'e2e00000-0000-0000-0000-000000000003', 'e2e00000-0000-0000-0000-000000000004',
  2000, 'funded', NOW(), NOW());

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT public.request_contract_refund('e2e00000-0000-0000-0000-000000000011', 'Mistake, cancel please')
  AS scenario3_before_work;
RESET ROLE;

ROLLBACK;
