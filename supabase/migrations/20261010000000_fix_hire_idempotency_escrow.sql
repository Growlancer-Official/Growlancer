-- ============================================================================
-- FIX HIRE FLOW: idempotent contract creation + escrow NOT NULL columns + RLS
-- ----------------------------------------------------------------------------
-- Root causes fixed (all verified in production):
--   1. create_contract_with_escrow inserted into escrow WITHOUT client_id /
--      freelancer_id — both columns are NOT NULL, so the RPC raised a 23502
--      error on EVERY hire. The frontend then fell back to a plain contract
--      insert, the proposal never flipped to 'hired' (RLS blocked the client),
--      and repeated "Accept & Hire" clicks created duplicate contracts.
--   2. No idempotency: clicking hire twice created N contracts.
--   3. proposals UPDATE RLS only allowed the freelancer, so the client could
--      not mark proposals hired/rejected on the fallback path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Recreate create_contract_with_escrow — idempotent + escrow NOT NULL fix
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_contract_with_escrow(
  p_project_id uuid,
  p_freelancer_id uuid,
  p_proposal_id uuid,
  p_amount numeric,
  p_client_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid;
  v_platform_fee numeric;
  v_freelancer_amount numeric;
  v_proposal record;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- ── Idempotency: if a contract already exists for this proposal, return it ──
  SELECT id INTO v_contract_id
  FROM contracts
  WHERE proposal_id = p_proposal_id
  LIMIT 1;
  IF FOUND THEN
    -- Repair stale state: make sure the winning proposal shows as hired
    UPDATE proposals
    SET status = 'hired', updated_at = now()
    WHERE id = p_proposal_id AND status <> 'hired';
    RETURN v_contract_id;
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

  -- Amount must be positive and bounded (aligned with payment gateway caps)
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Invalid contract amount';
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

  -- Create escrow record — client_id / freelancer_id are NOT NULL!
  INSERT INTO escrow (contract_id, client_id, freelancer_id, amount, status)
  VALUES (v_contract_id, p_client_id, p_freelancer_id, p_amount, 'pending');

  -- ── Hire semantics: winning proposal → 'hired', siblings → 'rejected' ──
  UPDATE proposals
  SET status = 'hired', updated_at = now()
  WHERE id = p_proposal_id;
  UPDATE proposals
  SET status = 'rejected', updated_at = now()
  WHERE project_id = p_project_id AND status = 'pending' AND id <> p_proposal_id;

  RETURN v_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_contract_with_escrow(uuid, uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_contract_with_escrow(uuid, uuid, uuid, numeric, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 2) RLS: allow clients to update proposals on their own projects
--    (status flips: hired / rejected / withdrawn)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clients can update proposals on own projects" ON public.proposals;
CREATE POLICY "Clients can update proposals on own projects"
  ON public.proposals
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = proposals.project_id
        AND projects.client_id = auth.uid()
    )
  );
