-- Add RLS to orphaned tables created in 20260711000000_marketplace_core_workflows.sql
-- These tables were created with no RLS and are not directly queried from the frontend,
-- but still need protection against direct API access.

-- ===================================================================
-- 1. opportunity_events — tracks impressions, applications, invites, hires
-- ===================================================================
ALTER TABLE IF EXISTS public.opportunity_events ENABLE ROW LEVEL SECURITY;

-- Freelancers can see their own opportunity events
DROP POLICY IF EXISTS "Freelancers view own events" ON public.opportunity_events;
CREATE POLICY "Freelancers view own events" ON public.opportunity_events
  FOR SELECT
  TO authenticated
  USING (freelancer_id = auth.uid());

-- Clients can see events for their projects
DROP POLICY IF EXISTS "Clients view project events" ON public.opportunity_events;
CREATE POLICY "Clients view project events" ON public.opportunity_events
  FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

-- Admins can view all events
DROP POLICY IF EXISTS "Admins view all events" ON public.opportunity_events;
CREATE POLICY "Admins view all events" ON public.opportunity_events
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ===================================================================
-- 2. workspaces — collaboration spaces for contracts
-- ===================================================================
ALTER TABLE IF EXISTS public.workspaces ENABLE ROW LEVEL SECURITY;

-- Members can view workspaces they belong to
DROP POLICY IF EXISTS "Members view own workspaces" ON public.workspaces;
CREATE POLICY "Members view own workspaces" ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (
    client_id = auth.uid()
    OR lead_freelancer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = id AND user_id = auth.uid()
    )
  );

-- Admins can view all workspaces
DROP POLICY IF EXISTS "Admins view all workspaces" ON public.workspaces;
CREATE POLICY "Admins view all workspaces" ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ===================================================================
-- 3. workspace_members — member list for each workspace
-- ===================================================================
ALTER TABLE IF EXISTS public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Users can see workspace members if they're in the same workspace
DROP POLICY IF EXISTS "Members view workspace members" ON public.workspace_members;
CREATE POLICY "Members view workspace members" ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id AND wm.user_id = auth.uid()
    )
  );

-- Admins can view all workspace members
DROP POLICY IF EXISTS "Admins view workspace members" ON public.workspace_members;
CREATE POLICY "Admins view workspace members" ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ===================================================================
-- 4. team_invitations — project team invites
-- ===================================================================
ALTER TABLE IF EXISTS public.team_invitations ENABLE ROW LEVEL SECURITY;

-- Freelancers can view invites sent to them
DROP POLICY IF EXISTS "Freelancers view own invites" ON public.team_invitations;
CREATE POLICY "Freelancers view own invites" ON public.team_invitations
  FOR SELECT
  TO authenticated
  USING (freelancer_id = auth.uid());

-- Project owners can view invites they sent
DROP POLICY IF EXISTS "Clients view sent invites" ON public.team_invitations;
CREATE POLICY "Clients view sent invites" ON public.team_invitations
  FOR SELECT
  TO authenticated
  USING (invited_by = auth.uid());

-- Admins can view all invites
DROP POLICY IF EXISTS "Admins view team invites" ON public.team_invitations;
CREATE POLICY "Admins view team invites" ON public.team_invitations
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Service_role only for insert/update (handled via RPCs)
-- No INSERT/UPDATE/DELETE policies for regular users

-- ===================================================================
-- 5. milestones — contract/project milestones
-- ===================================================================
ALTER TABLE IF EXISTS public.milestones ENABLE ROW LEVEL SECURITY;

-- Contract parties can view milestones
DROP POLICY IF EXISTS "Contract parties view milestones" ON public.milestones;
CREATE POLICY "Contract parties view milestones" ON public.milestones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts
      WHERE (id = contract_id OR id = (SELECT active_contract_id FROM public.projects WHERE id = project_id))
      AND (client_id = auth.uid() OR freelancer_id = auth.uid())
    )
  );

-- Admins can view all milestones
DROP POLICY IF EXISTS "Admins view milestones" ON public.milestones;
CREATE POLICY "Admins view milestones" ON public.milestones
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ===================================================================
-- 6. workspace_activity_logs — activity audit trail
-- ===================================================================
ALTER TABLE IF EXISTS public.workspace_activity_logs ENABLE ROW LEVEL SECURITY;

-- Workspace members can view activity logs
DROP POLICY IF EXISTS "Members view activity logs" ON public.workspace_activity_logs;
CREATE POLICY "Members view activity logs" ON public.workspace_activity_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id AND wm.user_id = auth.uid()
    )
  );

-- Admins can view all activity logs
DROP POLICY IF EXISTS "Admins view activity logs" ON public.workspace_activity_logs;
CREATE POLICY "Admins view activity logs" ON public.workspace_activity_logs
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ===================================================================
-- 7. fraud_events — fraud detection records (admin-only)
-- ===================================================================
ALTER TABLE IF EXISTS public.fraud_events ENABLE ROW LEVEL SECURITY;

-- Only admins can view fraud events
DROP POLICY IF EXISTS "Admins view fraud events" ON public.fraud_events;
CREATE POLICY "Admins view fraud events" ON public.fraud_events
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
