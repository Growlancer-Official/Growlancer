-- ═══════════════════════════════════════════════════════════════════════════
-- HIRED PROPOSAL STATUS
-- Marketplace semantics: when a client accepts & hires a freelancer, the
-- winning proposal becomes 'hired' (visible on both sides) and the other
-- pending proposals for that project are auto-rejected (one hire per project).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Allow the new 'hired' status on proposals
ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text, 'hired'::text]));

-- 2) Rebuild create_contract_with_escrow to mark the winning proposal 'hired'
--    and reject sibling pending proposals atomically.
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
  RETURN v_contract_id;
END;
$function$;
