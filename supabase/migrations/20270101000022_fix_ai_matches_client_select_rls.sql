-- FIX: Clients cannot see AI matches for their projects
--
-- Root cause: The only SELECT policy on ai_matches is
-- "Freelancers view own matches" (auth.uid() = freelancer_id).
-- Clients query ai_matches by project_id, but RLS blocks them
-- because they're never the freelancer_id.
--
-- Fix: Add a SELECT policy allowing the project owner (client)
-- to read matches for their own projects.

DROP POLICY IF EXISTS "Clients view their project matches" ON public.ai_matches;

CREATE POLICY "Clients view their project matches"
ON public.ai_matches FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = ai_matches.project_id AND p.client_id = auth.uid()
  )
);
