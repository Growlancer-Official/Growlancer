-- ═══════════════════════════════════════════════════════════════════════════
-- PREVENT DUPLICATE CONTRACTS (invite path + proposal path)
-- Migration 20261216000000
--
-- PROBLEM: a freelancer could be hired for the SAME project twice:
--   1. Client sends an invite  → freelancer accepts → accept_invite_create_contract
--   2. Freelancer ALSO sent a proposal → client accepts → create_contract_with_escrow
-- Two contracts for the same (project_id, freelancer_id). One hire per project.
--
-- FIX (3 layers):
--   1. Data cleanup: cancel existing duplicate pending/active contracts.
--   2. Partial UNIQUE index: hard DB guarantee — only ONE pending/active
--      contract per (project_id, freelancer_id).
--   3. Both hire RPCs return the EXISTING contract when one already exists and
--      sync the sibling record (proposal → 'hired', invite → 'accepted') so
--      client + freelancer see the hire on BOTH surfaces in real time.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Data cleanup: cancel duplicate pending/active contracts ──────────────
-- Keep ONE contract per (project_id, freelancer_id) — preferring an ACTIVE
-- (funded) contract over a pending one, then the oldest — and cancel the rest.
-- (Never cancel a funded contract just because a pending one was created first.)
WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id, freelancer_id
           ORDER BY (status = 'active') DESC, created_at ASC, id ASC
         ) AS rn
  FROM public.contracts
  WHERE status IN ('pending', 'active')
)
UPDATE public.contracts c
SET status = 'cancelled', updated_at = now()
FROM dupes d
WHERE c.id = d.id AND d.rn > 1;

-- ── 2. Partial unique index: one pending/active contract per project+freelancer ──
CREATE UNIQUE INDEX IF NOT EXISTS contracts_one_active_per_project_freelancer
  ON public.contracts (project_id, freelancer_id)
  WHERE status IN ('pending', 'active');

-- ── 3. Rebuild accept_invite_create_contract (dedup + proposal sync) ────────
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
  -- Declined/expired invites are final; ALREADY-ACCEPTED invites are a normal
  -- re-click after the client hired this freelancer via a proposal (the invite
  -- was auto-accepted then) — that is idempotent, NOT an error.
  IF v_invite.status = 'declined' THEN
    RAISE EXCEPTION 'Invite has already been declined';
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Invite has expired';
  END IF;

  -- ── Project must exist ───────────────────────────────────────────────────
  SELECT * INTO v_project FROM public.projects WHERE id = v_invite.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  -- ── DEDUP: freelancer already hired for this project (via a proposal) ────
  -- One hire per project: return the existing contract instead of creating a
  -- second one. The invite is still flipped to 'accepted' so the client sees
  -- the hire on BOTH the invite and the proposal surface in real time.
  SELECT id INTO v_contract_id
  FROM public.contracts
  WHERE project_id = v_invite.project_id
    AND freelancer_id = v_invite.freelancer_id
    AND status IN ('pending', 'active')
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF v_contract_id IS NOT NULL THEN
    UPDATE public.invites SET status = 'accepted', updated_at = now()
    WHERE id = p_invite_id;
    UPDATE public.projects SET status = 'in_progress', updated_at = now()
    WHERE id = v_project.id;
    -- Sync sibling proposal (if any) → 'hired' so BOTH surfaces show the hire
    UPDATE public.proposals SET status = 'hired', updated_at = now()
    WHERE project_id = v_invite.project_id
      AND freelancer_id = v_invite.freelancer_id
      AND status = 'pending';
    RETURN v_contract_id;
  END IF;

  -- ── Sync sibling proposal (if any) → 'hired' so BOTH surfaces show it ────
  UPDATE public.proposals SET status = 'hired', updated_at = now()
  WHERE project_id = v_invite.project_id
    AND freelancer_id = v_invite.freelancer_id
    AND status = 'pending';

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

-- ── 4. Rebuild create_contract_with_escrow (dedup + invite sync) ────────────
CREATE OR REPLACE FUNCTION public.create_contract_with_escrow(
  p_project_id uuid,
  p_freelancer_id uuid,
  p_proposal_id uuid,
  p_amount numeric,
  p_client_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract_id UUID;
  v_platform_fee NUMERIC;
  v_freelancer_amount NUMERIC;
  v_proposal RECORD;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  -- Amount must be positive and bounded (aligned with payment gateway caps)
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Invalid contract amount';
  END IF;
  -- Proposal must exist, belong to this project, and match the freelancer
  SELECT * INTO v_proposal
  FROM proposals
  WHERE id = p_proposal_id AND project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found for this project';
  END IF;
  IF v_proposal.freelancer_id <> p_freelancer_id THEN
    RAISE EXCEPTION 'Proposal does not belong to this freelancer';
  END IF;
  -- Project must belong to this client
  IF NOT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'Project does not belong to this client';
  END IF;

  -- ── DEDUP: freelancer already hired for this project (via an invite) ─────
  -- One hire per project: return the existing contract instead of creating a
  -- second one. The winning proposal is still marked 'hired' and any pending
  -- invite is flipped to 'accepted' so BOTH surfaces stay in sync.
  SELECT id INTO v_contract_id
  FROM contracts
  WHERE project_id = p_project_id
    AND freelancer_id = p_freelancer_id
    AND status IN ('pending', 'active')
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF v_contract_id IS NOT NULL THEN
    -- Hire semantics: winning proposal → 'hired', siblings → 'rejected'
    UPDATE public.proposals
    SET status = 'hired', updated_at = now()
    WHERE id = p_proposal_id;
    UPDATE public.proposals
    SET status = 'rejected', updated_at = now()
    WHERE project_id = p_project_id AND status = 'pending' AND id <> p_proposal_id;
    -- Sync any pending invite → 'accepted' (one hire per project)
    UPDATE public.invites
    SET status = 'accepted', updated_at = now()
    WHERE project_id = p_project_id
      AND freelancer_id = p_freelancer_id
      AND status = 'pending';
    RETURN v_contract_id;
  END IF;

  -- Calculate fees
  v_platform_fee := ROUND(p_amount * 0.05, 2); -- 5% platform fee
  v_freelancer_amount := p_amount - v_platform_fee;
  -- Create contract
  INSERT INTO contracts (
    project_id, proposal_id, freelancer_id, client_id,
    amount, platform_fee, freelancer_amount, status, escrow_funded
  ) VALUES (
    p_project_id, p_proposal_id, p_freelancer_id, p_client_id,
    p_amount, v_platform_fee, v_freelancer_amount, 'pending', false
  )
  RETURNING id INTO v_contract_id;
  -- Create escrow record
  INSERT INTO escrow (contract_id, amount, status)
  VALUES (v_contract_id, p_amount, 'pending');
  -- ── Hire semantics: winning proposal → 'hired', siblings → 'rejected' ──
  UPDATE public.proposals
  SET status = 'hired', updated_at = now()
  WHERE id = p_proposal_id;
  UPDATE public.proposals
  SET status = 'rejected', updated_at = now()
  WHERE project_id = p_project_id AND status = 'pending' AND id <> p_proposal_id;
  -- Sync any pending invite → 'accepted' (one hire per project, both surfaces)
  UPDATE public.invites
  SET status = 'accepted', updated_at = now()
  WHERE project_id = p_project_id
    AND freelancer_id = p_freelancer_id
    AND status = 'pending';
  RETURN v_contract_id;
END;
$function$;
