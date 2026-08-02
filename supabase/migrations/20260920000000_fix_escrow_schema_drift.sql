-- ============================================================================
-- Fix production schema drift discovered during Razorpay E2E verification
--
-- PROBLEM: The live `contracts` table is MISSING the escrow_funded column
-- (present in the original 20240511 schema) and the live `projects` status
-- CHECK no longer allows 'in_progress' (original schema allowed it). As a
-- result the entire escrow funding chain (fund_escrow / admin_fund_escrow /
-- create_contract_with_escrow) threw "record has no field escrow_funded" and
-- every frontend `.select('... escrow_funded')` failed silently.
--
-- FIX:
--   1. Restore contracts.escrow_funded (idempotent)
--   2. Widen projects.status CHECK to a superset: open|in_progress|active|
--      completed|cancelled (frontend writes in_progress, marketplace
--      workflows write active — both must be legal)
--   3. Rewrite admin_fund_escrow to be schema-correct, idempotent, and
--      service-role-only (webhook escrow funding)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RESTORE contracts.escrow_funded
-- ----------------------------------------------------------------------------
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS escrow_funded BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing funded contracts (escrow.status = 'funded') — they were
-- created before the column was lost, so mark what we can infer.
UPDATE public.contracts c
SET escrow_funded = true
WHERE EXISTS (
  SELECT 1 FROM public.escrow e
  WHERE e.contract_id = c.id AND e.status IN ('funded', 'released')
);

-- ----------------------------------------------------------------------------
-- 2. WIDEN projects.status CHECK (superset of old + new workflows)
-- ----------------------------------------------------------------------------
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('open', 'in_progress', 'active', 'completed', 'cancelled'));

-- ----------------------------------------------------------------------------
-- 3. RELEASE ESCROW — fix missing transactions.source (NOT NULL in live DB) and
--    escrow_id; debit the client's escrow balance when funds release
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract RECORD;
  v_escrow RECORD;
BEGIN
  -- Validate auth
  IF p_client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch contract with row lock
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Verify client owns this contract
  IF v_contract.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
  END IF;

  -- Get escrow record
  SELECT * INTO v_escrow
  FROM public.escrow
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
  UPDATE public.escrow
  SET status = 'released', released_at = NOW()
  WHERE contract_id = p_contract_id;

  -- Update contract status
  UPDATE public.contracts
  SET status = 'completed', escrow_funded = false, updated_at = NOW()
  WHERE id = p_contract_id;

  -- Create transaction record for freelancer (source/type are constrained in live DB)
  INSERT INTO public.transactions (
    user_id, contract_id, escrow_id, type, amount, status, source, description
  ) VALUES (
    v_contract.freelancer_id, p_contract_id, v_escrow.id, 'credit',
    v_contract.freelancer_amount, 'completed', 'escrow',
    'Escrow release for contract #' || p_contract_id::TEXT
  );

  -- Direct wallet update (SECURITY DEFINER bypasses RLS/auth checks)
  UPDATE public.wallets
  SET balance = balance + v_contract.freelancer_amount,
      updated_at = NOW()
  WHERE user_id = v_contract.freelancer_id;

  -- Auto-create wallet if missing (shouldn't happen, but just in case)
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (v_contract.freelancer_id, v_contract.freelancer_amount);
  END IF;

  -- Debit the client's escrow balance (money moved out of escrow)
  UPDATE public.wallets
  SET escrow_balance = GREATEST(escrow_balance - v_escrow.amount, 0),
      updated_at = NOW()
  WHERE user_id = v_contract.client_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_escrow(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. ADMIN REVERSE ESCROW — refund reconciliation (service role only)
--    Called by the webhook on refund.processed: returns the escrow to a
--    refunded state, un-marks the contract, and debits the client's escrow
--    balance (the money was returned to the payment method by Razorpay).
--    Idempotent: reversing an already-reversed / released escrow is a no-op.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reverse_escrow(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_escrow RECORD;
BEGIN
  SELECT * INTO v_escrow
  FROM public.escrow
  WHERE contract_id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Only reverse a currently-funded escrow (never touch released/refunded)
  IF v_escrow.status <> 'funded' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.escrow
  SET status = 'refunded', updated_at = NOW()
  WHERE contract_id = p_contract_id;

  UPDATE public.contracts
  SET status = 'pending', escrow_funded = false, updated_at = NOW()
  WHERE id = p_contract_id;

  -- Return the held funds: debit the client's escrow balance (Razorpay
  -- already returned the money to the client's payment method)
  UPDATE public.wallets
  SET escrow_balance = GREATEST(escrow_balance - v_escrow.amount, 0),
      updated_at = NOW()
  WHERE user_id = v_escrow.client_id;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reverse_escrow(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reverse_escrow(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_reverse_escrow(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reverse_escrow(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. ADMIN FUND ESCROW — schema-correct + idempotent (service role only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_fund_escrow(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract RECORD;
  v_escrow_amount NUMERIC;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Idempotency guard: never double-fund
  IF v_contract.escrow_funded THEN
    RETURN TRUE;
  END IF;

  -- How much is held in escrow for this contract (the escrowed bid)
  SELECT COALESCE(amount, 0) INTO v_escrow_amount
  FROM public.escrow
  WHERE contract_id = p_contract_id;

  -- Mark escrow funded
  UPDATE public.escrow
  SET status = 'funded', funded_at = NOW()
  WHERE contract_id = p_contract_id;

  -- Mark contract active + funded
  UPDATE public.contracts
  SET status = 'active', escrow_funded = true, updated_at = NOW()
  WHERE id = p_contract_id;

  -- Advance project
  UPDATE public.projects
  SET status = 'in_progress'
  WHERE id = v_contract.project_id;

  -- Track escrowed funds on the client wallet (escrow balance)
  IF v_escrow_amount > 0 THEN
    INSERT INTO public.wallets (user_id, balance, escrow_balance, currency)
    VALUES (v_contract.client_id, 0, v_escrow_amount, 'USD')
    ON CONFLICT (user_id) DO UPDATE SET
      escrow_balance = public.wallets.escrow_balance + EXCLUDED.escrow_balance,
      updated_at = NOW();
  END IF;

  RETURN TRUE;
END;
$$;

-- Lock it down: only the service role may call this internal RPC
REVOKE EXECUTE ON FUNCTION public.admin_fund_escrow(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fund_escrow(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_fund_escrow(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fund_escrow(UUID) TO service_role;
