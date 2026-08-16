-- ════════════════════════════════════════════════════════════════════════
-- GROWLANCER — TEAM PROJECTS (multi-freelancer)
-- A team project = one client + multiple INDEPENDENT contracts (one per
-- role/freelancer). Each contract keeps its own escrow, milestones, auto-
-- release and dispute — exactly like a normal single-freelancer contract.
-- We reuse the existing escrow RPCs untouched; only add nullable link
-- columns so a contract knows which team project / role it belongs to.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. team_projects ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  total_budget_estimate NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. team_project_roles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_project_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_project_id UUID NOT NULL REFERENCES public.team_projects(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  budget_range_min NUMERIC,
  budget_range_max NUMERIC,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','filled','cancelled')),
  -- Cached AI-match suggestions (real-time per-role; refreshed on demand)
  suggested_freelancers JSONB NOT NULL DEFAULT '[]'::jsonb,
  matched_freelancer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_project_roles_project ON public.team_project_roles(team_project_id);

-- ── 3. contracts — nullable team-project links (NO behavior change) ───────
-- These stay NULL for normal contracts; existing queries/RLS are unaffected.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS team_project_id UUID REFERENCES public.team_projects(id) ON DELETE SET NULL;
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS team_project_role_id UUID REFERENCES public.team_project_roles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_team_project ON public.contracts(team_project_id);

-- ── 4. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.team_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_project_roles ENABLE ROW LEVEL SECURITY;

-- team_projects: client owner full access; admins read/update; anon can read
-- open projects (public listing) without sensitive fields leaking.
DROP POLICY IF EXISTS "Team project owner full access" ON public.team_projects;
CREATE POLICY "Team project owner full access" ON public.team_projects
  FOR ALL TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

DROP POLICY IF EXISTS "Team project admin access" ON public.team_projects;
CREATE POLICY "Team project admin access" ON public.team_projects
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Anyone can view open team projects" ON public.team_projects;
CREATE POLICY "Anyone can view open team projects" ON public.team_projects
  FOR SELECT TO anon, authenticated
  USING (status = 'open');

-- team_project_roles: visible to the project owner (or admins) via join.
DROP POLICY IF EXISTS "Team roles owner access" ON public.team_project_roles;
CREATE POLICY "Team roles owner access" ON public.team_project_roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_projects
      WHERE team_projects.id = team_project_roles.team_project_id
        AND team_projects.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_projects
      WHERE team_projects.id = team_project_roles.team_project_id
        AND team_projects.client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team roles admin access" ON public.team_project_roles;
CREATE POLICY "Team roles admin access" ON public.team_project_roles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── 5. Per-role contract RPC ─────────────────────────────────────────────
-- Mirrors create_contract_with_escrow EXACTLY (5% fee, pending status, escrow
-- row) but links the contract to the team project + role. The original RPC is
-- left untouched — team contracts are created through this one.
CREATE OR REPLACE FUNCTION public.create_team_role_contract(
  p_team_project_id UUID,
  p_team_project_role_id UUID,
  p_freelancer_id UUID,
  p_amount NUMERIC,
  p_client_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public, pg_catalog'
AS $$
DECLARE
  v_contract_id UUID;
  v_platform_fee NUMERIC;
  v_freelancer_amount NUMERIC;
  v_role_status TEXT;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Role must belong to this team project and be fillable
  SELECT status INTO v_role_status
  FROM public.team_project_roles
  WHERE id = p_team_project_role_id AND team_project_id = p_team_project_id;
  IF v_role_status IS NULL THEN
    RAISE EXCEPTION 'Role not found on this team project';
  END IF;
  IF v_role_status NOT IN ('open','matched') THEN
    RAISE EXCEPTION 'Role is not open for hiring';
  END IF;

  -- Same fee math as create_contract_with_escrow: flat 5% client-side
  v_platform_fee := ROUND(p_amount * 0.05, 2);
  v_freelancer_amount := p_amount - v_platform_fee;

  INSERT INTO public.contracts (
    project_id, freelancer_id, client_id, amount, platform_fee,
    freelancer_amount, status, escrow_funded,
    team_project_id, team_project_role_id
  ) VALUES (
    NULL, p_freelancer_id, p_client_id, p_amount, v_platform_fee,
    v_freelancer_amount, 'pending', false,
    p_team_project_id, p_team_project_role_id
  )
  RETURNING id INTO v_contract_id;

  INSERT INTO public.escrow (contract_id, amount, status)
  VALUES (v_contract_id, p_amount, 'pending');

  RETURN v_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_team_role_contract(UUID, UUID, UUID, NUMERIC, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_team_role_contract(UUID, UUID, UUID, NUMERIC, UUID) FROM PUBLIC, anon;

-- ── 6. Contract count + fill status per role ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_team_role_contract(p_role_id UUID, p_client_id UUID)
RETURNS public.contracts
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public, pg_catalog'
AS $$
DECLARE
  v_contract public.contracts;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE team_project_role_id = p_role_id
  ORDER BY created_at DESC LIMIT 1;
  IF v_contract.id IS NULL OR v_contract.client_id <> p_client_id THEN
    RETURN NULL;
  END IF;
  RETURN v_contract;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_role_contract(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_team_role_contract(UUID, UUID) FROM PUBLIC, anon;
