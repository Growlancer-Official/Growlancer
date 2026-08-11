-- E2E TEST v2: fraud-proof refund — separate contract per scenario
BEGIN;

-- Cleanup
DELETE FROM public.refund_requests WHERE requested_by = 'e2e00000-0000-0000-0000-000000000003';
DELETE FROM public.contract_files WHERE contract_id IN ('e2e00000-0000-0000-0000-000000000001','e2e00000-0000-0000-0000-000000000011');
DELETE FROM public.contracts WHERE id IN ('e2e00000-0000-0000-0000-000000000001','e2e00000-0000-0000-0000-000000000011','e2e00000-0000-0000-0000-000000000012');
DELETE FROM public.escrow WHERE contract_id IN ('e2e00000-0000-0000-0000-000000000001','e2e00000-0000-0000-0000-000000000011','e2e00000-0000-0000-0000-000000000012');
DELETE FROM public.projects WHERE id IN ('e2e00000-0000-0000-0000-000000000002','e2e00000-0000-0000-0000-000000000013','e2e00000-0000-0000-0000-000000000014');

INSERT INTO public.profiles (id, email, role, name, is_admin, verification_status)
VALUES
  ('e2e00000-0000-0000-0000-000000000003', 'e2e-client@growlancer.test', 'client', 'E2E Client', false, 'unverified'),
  ('e2e00000-0000-0000-0000-000000000004', 'e2e-freelancer@growlancer.test', 'freelancer', 'E2E Freelancer', false, 'unverified')
ON CONFLICT (id) DO NOTHING;

-- Helper: project + contract + escrow per scenario
-- S1 contract (id 01) — delivered file, neutral cancel → expect after_start/pending_freelancer
-- S2 contract (id 11) — delivered file, fraud accusation → expect fraud/pending_admin + escrow frozen
-- S3 contract (id 12) — no work at all, neutral cancel → expect before_work/auto_approved

INSERT INTO public.projects (id, client_id, title, description, budget_min, budget_max, status, created_at, updated_at)
VALUES
  ('e2e00000-0000-0000-0000-000000000002', 'e2e00000-0000-0000-0000-000000000003', 'S1 Neutral Cancel', 'x', 1000, 5000, 'open', NOW(), NOW()),
  ('e2e00000-0000-0000-0000-000000000013', 'e2e00000-0000-0000-0000-000000000003', 'S2 Fraud Claim', 'x', 1000, 5000, 'open', NOW(), NOW()),
  ('e2e00000-0000-0000-0000-000000000014', 'e2e00000-0000-0000-0000-000000000003', 'S3 Before Work', 'x', 1000, 2000, 'open', NOW(), NOW());

INSERT INTO public.contracts (id, project_id, client_id, freelancer_id, amount, platform_fee, freelancer_amount, status, milestones, escrow_funded, created_at, updated_at)
VALUES
  ('e2e00000-0000-0000-0000-000000000001', 'e2e00000-0000-0000-0000-000000000002', 'e2e00000-0000-0000-0000-000000000003', 'e2e00000-0000-0000-0000-000000000004', 5000, 250, 4750, 'active', '[]'::jsonb, true, NOW(), NOW()),
  ('e2e00000-0000-0000-0000-000000000011', 'e2e00000-0000-0000-0000-000000000013', 'e2e00000-0000-0000-0000-000000000003', 'e2e00000-0000-0000-0000-000000000004', 5000, 250, 4750, 'active', '[]'::jsonb, true, NOW(), NOW()),
  ('e2e00000-0000-0000-0000-000000000012', 'e2e00000-0000-0000-0000-000000000014', 'e2e00000-0000-0000-0000-000000000003', 'e2e00000-0000-0000-0000-000000000004', 2000, 100, 1900, 'active', '[]'::jsonb, true, NOW(), NOW());

INSERT INTO public.escrow (id, contract_id, client_id, freelancer_id, amount, status, created_at, updated_at)
VALUES
  ('e2e00000-0000-0000-0000-000000000021', 'e2e00000-0000-0000-0000-000000000001', 'e2e00000-0000-0000-0000-000000000003', 'e2e00000-0000-0000-0000-000000000004', 5000, 'funded', NOW(), NOW()),
  ('e2e00000-0000-0000-0000-000000000022', 'e2e00000-0000-0000-0000-000000000011', 'e2e00000-0000-0000-0000-000000000003', 'e2e00000-0000-0000-0000-000000000004', 5000, 'funded', NOW(), NOW()),
  ('e2e00000-0000-0000-0000-000000000023', 'e2e00000-0000-0000-0000-000000000012', 'e2e00000-0000-0000-0000-000000000003', 'e2e00000-0000-0000-0000-000000000004', 2000, 'funded', NOW(), NOW());

-- S1 + S2: freelancer uploaded deliverable files (proof of work, started_at NULL)
INSERT INTO public.contract_files (id, contract_id, uploaded_by, file_name, file_path, file_size, file_type, public_url, created_at)
VALUES
  ('e2e00000-0000-0000-0000-000000000031', 'e2e00000-0000-0000-0000-000000000001', 'e2e00000-0000-0000-0000-000000000004', 'final-dashboard.pbix', 'e2e/final1.pbix', 2048, 'application/octet-stream', 'https://x.test/final1.pbix', NOW()),
  ('e2e00000-0000-0000-0000-000000000032', 'e2e00000-0000-0000-0000-000000000011', 'e2e00000-0000-0000-0000-000000000004', 'final-report.pdf', 'e2e/final2.pdf', 1024, 'application/pdf', 'https://x.test/final2.pdf', NOW());

-- ── S1: neutral cancel on delivered work → client_cancel_after_start / pending_freelancer
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT (public.request_contract_refund('e2e00000-0000-0000-0000-000000000001', 'I changed my mind')) AS s1_result;
RESET ROLE;

-- ── S2: fraud accusation on delivered work → fraud / pending_admin / escrow frozen
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT (public.request_contract_refund('e2e00000-0000-0000-0000-000000000011', 'This is fraud, freelancer scammed me and work was not delivered')) AS s2_result;
RESET ROLE;

-- ── S3: genuine before-work cancel → client_cancel_before_work / auto_approved
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'e2e00000-0000-0000-0000-000000000003';
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT (public.request_contract_refund('e2e00000-0000-0000-0000-000000000012', 'Mistake, cancel please')) AS s3_result;
RESET ROLE;

-- ── FINAL STATE TABLE ──
SELECT
  r.request_type,
  r.status                                                    AS refund_status,
  e.status                                                    AS escrow_status,
  CASE WHEN r.request_type = 'client_cancel_before_work' THEN 'AUTO-REFUND (fair: no work)'
       WHEN r.request_type = 'client_cancel_after_start' THEN 'FREELANCER DECIDES (protected)'
       WHEN r.request_type = 'fraud' THEN 'ADMIN REVIEW + ESCROW FROZEN (protected)'
       ELSE r.request_type END                                AS protection
FROM public.refund_requests r
JOIN public.escrow e ON e.contract_id = r.contract_id
WHERE r.requested_by = 'e2e00000-0000-0000-0000-000000000003'
ORDER BY r.created_at;

ROLLBACK;
