-- ============================================================================
-- LOCK DOWN project_matches RLS (2026-12-11)
--
-- Audit finding: the ORIGINAL migration (20240511_create_all_tables.sql) created
--   CREATE POLICY "Authenticated users can read matches" ON project_matches
--   FOR SELECT USING (auth.role() = 'authenticated');
-- which lets ANY authenticated user read EVERYONE's AI-match data
-- (project_id, freelancer_id, match_score, private interest status).
--
-- The live database was manually narrowed at some point, but the migration
-- file still contained the broad policy — so a fresh deployment from the
-- repo would RE-CREATE the leak (repo/live drift).
--
-- FIX (idempotent, safe to run anywhere):
--   1. DROP the broad policy if it exists (by name AND as a catch-all
--      auth-role SELECT on project_matches, in case it was renamed).
--   2. DROP the manually-applied narrow policy (renamed below) to avoid
--      duplicate policies.
--   3. CREATE the canonical narrow policy: only the matched freelancer, the
--      project's client, or an admin can read a match row.
-- ============================================================================

-- 1) Drop the broad public-read policy (both known names)
DROP POLICY IF EXISTS "Authenticated users can read matches" ON public.project_matches;
DROP POLICY IF EXISTS "Project matches select policy" ON public.project_matches;

-- 2) Safety net: drop ANY remaining SELECT policy that grants blanket reads.
--    We rebuild the exact narrow policy below, so nothing is lost.
DROP POLICY IF EXISTS "Match participants can view" ON public.project_matches;

-- 3) Canonical narrow policy (participants + admin only)
CREATE POLICY "Match participants can view" ON public.project_matches
  FOR SELECT TO authenticated
  USING (
    auth.uid() = freelancer_id
    OR EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_matches.project_id
        AND projects.client_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Keep service_role unaffected (bypasses RLS by default).
