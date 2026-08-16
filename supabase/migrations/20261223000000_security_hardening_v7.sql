-- ============================================================================
-- SECURITY HARDENING v7 — closes 3 gaps found in the full deep-dive audit
-- (2026-12-23)
--
-- 1) contest_submissions INSERT policy was PUBLIC (no TO clause). The WITH
--    CHECK was sound (auth.uid() = freelancer_id + contest active/funded), but
--    PUBLIC is defense-in-depth wrong: scope it to authenticated explicitly so
--    the anon role can never even attempt the check.
--
-- 2) contest-submissions storage bucket: ANY authenticated user could upload
--    arbitrary files into the private bucket (INSERT policy only checked the
--    bucket_id). The bucket is served via signed URLs, but storage-fill / file
--    hosting abuse was possible. Tighten the INSERT WITH CHECK to the owner's
--    path — the same rule update/delete already use:
--        path = {contestId}/{userId}/...
--
-- 3) process_stale_withdrawals() was GRANT EXECUTE TO authenticated but it is
--    a privileged cron-only function (pg_cron runs it; it cancels stale
--    payouts and returns held funds to wallets). Any authenticated user could
--    trigger it. Revoke from public/anon/authenticated; keep service_role so
--    the edge-function path stays available if ever needed.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) contest_submissions INSERT — scope to authenticated
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Freelancers can submit to funded active contests" ON public.contest_submissions;

CREATE POLICY "Freelancers can submit to funded active contests" ON public.contest_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = freelancer_id AND
    (SELECT status FROM contests WHERE id = contest_id) = 'active' AND
    (SELECT prize_funded FROM contests WHERE id = contest_id) = true AND
    (SELECT end_date FROM contests WHERE id = contest_id) > now()
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2) contest-submissions storage uploads — owner path only
--    (storage path convention: {contestId}/{userId}/{filename})
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can upload contest submissions" ON storage.objects;

CREATE POLICY "Authenticated users can upload contest submissions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contest-submissions'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 3) process_stale_withdrawals — cron-only (revoke authenticated)
-- ────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.process_stale_withdrawals() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_stale_withdrawals() TO service_role;
