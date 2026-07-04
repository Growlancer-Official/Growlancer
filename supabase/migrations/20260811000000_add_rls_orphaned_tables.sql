-- Create 7 missing marketplace tables (forward-looking schema from 20260711 migration)
-- and add RLS policies. These tables exist in local migrations but were never
-- applied to the remote database.

-- ===================================================================
-- Create tables if they don't exist (safe to re-run)
-- ===================================================================

-- 1. opportunity_events — tracks impressions, applications, invites, hires
CREATE TABLE IF NOT EXISTS public.opportunity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('impression','application','invite','hire')),
  source text NOT NULL DEFAULT 'marketplace',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_events_freelancer_recent
  ON public.opportunity_events(freelancer_id, created_at DESC);

-- 2. workspaces — collaboration spaces for contracts
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid UNIQUE REFERENCES public.contracts(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_freelancer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. workspace_members — member list for each workspace
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('client','lead','contributor','reviewer')),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- 4. team_invitations — project team invites
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('lead','contributor','reviewer')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','declined','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  UNIQUE(project_id, freelancer_id)
);

-- 5. milestones — contract/project milestones
CREATE TABLE IF NOT EXISTS public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','funded','submitted','approved','released','disputed')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. workspace_activity_logs — activity audit trail
CREATE TABLE IF NOT EXISTS public.workspace_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. fraud_events — fraud detection records (admin-only)
CREATE TABLE IF NOT EXISTS public.fraud_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'medium',
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===================================================================
-- Add RLS policies on all 7 tables
-- ===================================================================

-- 1. opportunity_events
ALTER TABLE IF EXISTS public.opportunity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Freelancers view own events" ON public.opportunity_events;
CREATE POLICY "Freelancers view own events" ON public.opportunity_events
  FOR SELECT TO authenticated USING (freelancer_id = auth.uid());

DROP POLICY IF EXISTS "Clients view project events" ON public.opportunity_events;
CREATE POLICY "Clients view project events" ON public.opportunity_events
  FOR SELECT TO authenticated USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Admins view all events" ON public.opportunity_events;
CREATE POLICY "Admins view all events" ON public.opportunity_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2. workspaces
ALTER TABLE IF EXISTS public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view own workspaces" ON public.workspaces;
CREATE POLICY "Members view own workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    client_id = auth.uid()
    OR lead_freelancer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins view all workspaces" ON public.workspaces;
CREATE POLICY "Admins view all workspaces" ON public.workspaces
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 3. workspace_members
ALTER TABLE IF EXISTS public.workspace_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view workspace members" ON public.workspace_members;
CREATE POLICY "Members view workspace members" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins view workspace members" ON public.workspace_members;
CREATE POLICY "Admins view workspace members" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 4. team_invitations
ALTER TABLE IF EXISTS public.team_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Freelancers view own invites" ON public.team_invitations;
CREATE POLICY "Freelancers view own invites" ON public.team_invitations
  FOR SELECT TO authenticated USING (freelancer_id = auth.uid());

DROP POLICY IF EXISTS "Clients view sent invites" ON public.team_invitations;
CREATE POLICY "Clients view sent invites" ON public.team_invitations
  FOR SELECT TO authenticated USING (invited_by = auth.uid());

DROP POLICY IF EXISTS "Admins view team invites" ON public.team_invitations;
CREATE POLICY "Admins view team invites" ON public.team_invitations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 5. milestones
ALTER TABLE IF EXISTS public.milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contract parties view milestones" ON public.milestones;
CREATE POLICY "Contract parties view milestones" ON public.milestones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts
      WHERE id = contract_id
      AND (client_id = auth.uid() OR freelancer_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins view milestones" ON public.milestones;
CREATE POLICY "Admins view milestones" ON public.milestones
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 6. workspace_activity_logs
ALTER TABLE IF EXISTS public.workspace_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view activity logs" ON public.workspace_activity_logs;
CREATE POLICY "Members view activity logs" ON public.workspace_activity_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins view activity logs" ON public.workspace_activity_logs;
CREATE POLICY "Admins view activity logs" ON public.workspace_activity_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 7. fraud_events
ALTER TABLE IF EXISTS public.fraud_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view fraud events" ON public.fraud_events;
CREATE POLICY "Admins view fraud events" ON public.fraud_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
