-- Escrow RPC Functions Migration
-- Run this in Supabase SQL Editor
--
-- Provides secure RPC functions for escrow operations:
-- - create_contract_with_escrow: Creates contract + escrow in one transaction
-- - fund_escrow: Records escrow funding after successful payment
-- - release_escrow: Releases escrow funds to freelancer
--
-- All RPCs are SECURITY DEFINER and validate auth.uid() matches p_client_id.

-- ====================================================================
-- 1. CREATE CONTRACT WITH ESCROW
-- ====================================================================

-- Creates a contract record and an escrow record in a single transaction.
-- Used when a client accepts a proposal.
CREATE OR REPLACE FUNCTION create_contract_with_escrow(
  p_project_id UUID,
  p_freelancer_id UUID,
  p_proposal_id UUID,
  p_amount NUMERIC,
  p_client_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_contract_id UUID;
  v_platform_fee NUMERIC;
  v_freelancer_amount NUMERIC;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Calculate fees
  v_platform_fee := ROUND(p_amount * 0.10, 2); -- 10% platform fee
  v_freelancer_amount := p_amount - v_platform_fee;

  -- Create contract
  INSERT INTO contracts (
    project_id,
    proposal_id,
    freelancer_id,
    client_id,
    amount,
    platform_fee,
    freelancer_amount,
    status,
    escrow_funded
  ) VALUES (
    p_project_id,
    p_proposal_id,
    p_freelancer_id,
    p_client_id,
    p_amount,
    v_platform_fee,
    v_freelancer_amount,
    'pending',
    false
  )
  RETURNING id INTO v_contract_id;

  -- Create escrow record
  INSERT INTO escrow (
    contract_id,
    amount,
    status
  ) VALUES (
    v_contract_id,
    p_amount,
    'pending'
  );

  RETURN v_contract_id;
END;
$$;

-- ====================================================================
-- 2. FUND ESCROW
-- ====================================================================

-- Called after a successful PayPal payment to mark escrow as funded.
-- Used by the PayPal edge function (capture_order) and the escrowService.fund().
CREATE OR REPLACE FUNCTION fund_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_contract RECORD;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch contract with row lock
  SELECT * INTO v_contract
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Verify client owns this contract
  IF v_contract.client_id <> p_client_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
  END IF;

  -- Update escrow record
  UPDATE escrow
  SET status = 'funded',
      funded_at = NOW()
  WHERE contract_id = p_contract_id;

  -- Update contract status
  UPDATE contracts
  SET status = 'active',
      escrow_funded = true,
      updated_at = NOW()
  WHERE id = p_contract_id;

  -- Update project status
  UPDATE projects
  SET status = 'in_progress'
  WHERE id = v_contract.project_id;

  RETURN TRUE;
END;
$$;

-- ====================================================================
-- 3. RELEASE ESCROW
-- ====================================================================

-- Releases escrow funds to the freelancer when work is approved.
-- Updates escrow status to 'released' and creates a transaction record.
CREATE OR REPLACE FUNCTION release_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_contract RECORD;
  v_escrow RECORD;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch contract with row lock
  SELECT * INTO v_contract
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Verify client owns this contract
  IF v_contract.client_id <> p_client_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
  END IF;

  -- Get escrow record
  SELECT * INTO v_escrow
  FROM escrow
  WHERE contract_id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found for this contract';
  END IF;

  -- Verify escrow is funded
  IF v_escrow.status <> 'funded' THEN
    RAISE EXCEPTION 'Escrow is not in funded state';
  END IF;

  -- Update escrow status
  UPDATE escrow
  SET status = 'released',
      released_at = NOW()
  WHERE contract_id = p_contract_id;

  -- Update contract status
  UPDATE contracts
  SET status = 'completed',
      updated_at = NOW()
  WHERE id = p_contract_id;

  -- Create transaction record for freelancer
  INSERT INTO transactions (
    user_id,
    contract_id,
    type,
    amount,
    status,
    description
  ) VALUES (
    v_contract.freelancer_id,
    p_contract_id,
    'payment',
    v_contract.freelancer_amount,
    'completed',
    'Escrow release for contract #' || p_contract_id::TEXT
  );

  -- Update freelancer wallet balance
  PERFORM update_wallet_balance(v_contract.freelancer_id, v_contract.freelancer_amount);

  RETURN TRUE;
END;
$$;

-- ====================================================================
-- GRANT EXECUTE PERMISSIONS
-- ====================================================================

GRANT EXECUTE ON FUNCTION create_contract_with_escrow(UUID, UUID, UUID, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fund_escrow(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION release_escrow(UUID, UUID) TO authenticated;