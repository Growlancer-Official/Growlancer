-- ═══════════════════════════════════════════════════════════════════════════
-- ACCEPT INVITE → CONTRACT (SECURE RPC)
-- Migration 20261006000000
--
-- WHY: freelancers accepting an invite did a direct `contracts.insert` from the
-- client — but contracts RLS only grants INSERT to *clients*, so the insert was
-- silently denied ("Failed to create contract from invite"). It also never set
-- the NOT NULL `escrow_funded` column and never created a workspace.
--
-- FIX: a SECURITY DEFINER RPC that validates ownership/status/expiry server-side,
-- computes the amount from the project (never trusts the client), creates the
-- contract + workspace, and updates invite + project status atomically.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.accept_invite_create_contract(p_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_project record;
  v_amount integer;
  v_fee integer;
  v_contract_id uuid;
BEGIN
  -- ── Load + validate the invite (server-side, never trust the caller) ─────
  SELECT * INTO v_invite FROM public.invites WHERE id = p_invite_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  IF v_invite.freelancer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This invite does not belong to you';
  END IF;
  IF v_invite.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Invite has already been responded to';
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  -- ── Project must exist ───────────────────────────────────────────────────
  SELECT * INTO v_project FROM public.projects WHERE id = v_invite.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  -- ── Amount computed server-side from the project budget ──────────────────
  v_amount := COALESCE(v_project.budget_max, v_project.budget_min, 500);
  IF v_amount <= 0 THEN
    v_amount := 500;
  END IF;
  v_fee := GREATEST(0, round(v_amount * 0.05)::integer);

  -- ── Create contract (escrow starts unfunded; client funds it later) ──────
  INSERT INTO public.contracts (
    project_id, client_id, freelancer_id,
    amount, platform_fee, freelancer_amount,
    status, escrow_funded
  ) VALUES (
    v_project.id, v_project.client_id, v_invite.freelancer_id,
    v_amount, v_fee, v_amount - v_fee,
    'pending', false
  )
  RETURNING id INTO v_contract_id;

  -- ── Workspace so both parties can collaborate immediately ────────────────
  INSERT INTO public.workspaces (
    contract_id, project_id, client_id, lead_freelancer_id, status
  ) VALUES (
    v_contract_id, v_project.id, v_project.client_id, v_invite.freelancer_id, 'active'
  )
  ON CONFLICT (contract_id) DO NOTHING;

  -- ── Flip invite + project status atomically ──────────────────────────────
  UPDATE public.invites SET status = 'accepted', updated_at = now()
  WHERE id = p_invite_id;
  UPDATE public.projects SET status = 'in_progress', updated_at = now()
  WHERE id = v_project.id;

  RETURN v_contract_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite_create_contract(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite_create_contract(uuid) TO authenticated, service_role;
