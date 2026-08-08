-- ============================================================================
-- FIX 1: Infinite RLS recursion on `projects` (error 42P17)
-- ----------------------------------------------------------------------------
-- Root cause: projects SELECT policies referenced ai_matches / proposals, whose
-- own policies referenced projects again -> circular evaluation -> Postgres
-- aborts every authenticated query touching projects with:
--   "infinite recursion detected in policy for relation \"projects\""
-- This broke freelancer Project Feed (matches), Invites and Workspace (all
-- embed projects), because PostgREST applies RLS to embedded resources.
--
-- Fix: single SECURITY DEFINER helper. Inside the function the tables are
-- accessed with definer (owner) rights, so RLS is bypassed there and the
-- recursion cycle is broken. The helper preserves the exact visibility rules
-- of the two old SELECT policies.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_view_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND (
        p.client_id = auth.uid()
        OR (p.status = 'open' AND p.visibility = 'public')
        OR EXISTS (
          SELECT 1 FROM public.contracts c
          WHERE c.project_id = p.id
            AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.proposals pr
          WHERE pr.project_id = p.id
            AND pr.freelancer_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.ai_matches m
          WHERE m.project_id = p.id
            AND m.freelancer_id = auth.uid()
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_project(uuid) TO authenticated, anon;

-- Replace the two recursive SELECT policies with a single function-based one.
DROP POLICY IF EXISTS "Contract parties and applicants can view project" ON public.projects;
DROP POLICY IF EXISTS "Projects select" ON public.projects;

CREATE POLICY "Projects visible via can_view_project"
  ON public.projects
  FOR SELECT
  USING (public.can_view_project(id));

-- ============================================================================
-- FIX 2: Missing subscriptions -> subscription_plans FK
-- ----------------------------------------------------------------------------
-- subscriptionHelpers.ts (and every other consumer) selects
-- `subscriptions, subscription_plans(*)`. With no FK between the two tables
-- PostgREST returned PGRST200 ("Could not find a relationship") and the whole
-- subscribe flow failed with "Failed to subscribe to plan.".
-- All existing plan_id values are valid (verified: no orphans), so the FK can
-- be added immediately.
-- ============================================================================

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_id_fkey
  FOREIGN KEY (plan_id)
  REFERENCES public.subscription_plans(id)
  ON DELETE RESTRICT;
