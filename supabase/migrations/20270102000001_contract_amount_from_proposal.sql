-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT AMOUNT TRUST FIX (H3)
--
-- Problem: create_contract_with_escrow accepted p_amount from the request
-- body. A client could accept a ₹50,000 proposal but create the contract at
-- ₹2,000 — escrow, release payouts and the 5% fee then followed the tampered
-- amount.
--
-- Fix:
--   1. Guarantee proposals.proposed_rate exists (it is used by the frontend
--      hire flow but was never defined in migrations — live-DB drift) and
--      backfill it from bid_amount.
--   2. create_contract_with_escrow now derives the authoritative amount from
--      the proposal row (proposed_rate, falling back to bid_amount) and
--      REJECTS any client-supplied p_amount that differs. The amount can no
--      longer be tampered with at contract creation.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. proposed_rate column (idempotent) + backfill from bid_amount when present
--    NOTE: the live database renamed bid_amount → proposed_rate years ago and
--    no longer has bid_amount, while fresh builds from migrations still do.
--    The backfill therefore checks information_schema first so the same
--    migration file works against both schema shapes.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS proposed_rate NUMERIC(10,2);

DO $$
DECLARE
  v_has_bid_amount BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'proposals'
      AND column_name = 'bid_amount'
  ) INTO v_has_bid_amount;

  IF v_has_bid_amount THEN
    UPDATE public.proposals
    SET proposed_rate = bid_amount
    WHERE proposed_rate IS NULL AND bid_amount IS NOT NULL;
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. create_contract_with_escrow — server-authoritative amount
--    Based on the 20261220000000 full-payout version (idempotency + hire
--    semantics + escrow parties), with ONE change: the amount is derived from
--    the proposal row (proposed_rate / bid_amount) and any mismatched
--    client-supplied p_amount is rejected.
-- ───────────────────────────────────────────────────────────────────────────
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
  v_authoritative_amount numeric;
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

  -- 🛡️ AUTHORITATIVE AMOUNT: always from the proposal row, never the request.
  -- proposed_rate is the negotiated bid on the proposal (present on both the
  -- live and fresh-build schemas thanks to the column guarantee above).
  v_authoritative_amount := ROUND(v_proposal.proposed_rate::numeric, 2);
  IF v_authoritative_amount IS NULL OR v_authoritative_amount <= 0 OR v_authoritative_amount > 100000 THEN
    RAISE EXCEPTION 'Invalid contract amount';
  END IF;

  -- Reject any client-supplied amount that does not match the proposal.
  -- Legit flows (workflowService.hireFreelancerFromProposal) always pass the
  -- proposal amount, so this only ever fires on tampering.
  IF p_amount IS NOT NULL AND ROUND(p_amount::numeric, 2) <> v_authoritative_amount THEN
    RAISE EXCEPTION 'Contract amount does not match the proposal amount';
  END IF;

  -- Fees: 5% platform fee is charged to the CLIENT on top at payment time.
  -- The freelancer receives 100% of the contract amount.
  v_platform_fee := ROUND(v_authoritative_amount * 0.05, 2); -- 5% (client-paid)
  v_freelancer_amount := v_authoritative_amount;             -- 100% to freelancer

  -- Create contract
  INSERT INTO contracts (
    project_id, proposal_id, freelancer_id, client_id,
    amount, platform_fee, freelancer_amount, status, escrow_funded
  ) VALUES (
    p_project_id, p_proposal_id, p_freelancer_id, p_client_id,
    v_authoritative_amount, v_platform_fee, v_freelancer_amount, 'pending', false
  )
  RETURNING id INTO v_contract_id;

  -- Create escrow record — client_id / freelancer_id are NOT NULL and gate
  -- the "Escrow participants can view" RLS policy.
  INSERT INTO escrow (contract_id, client_id, freelancer_id, amount, status)
  VALUES (v_contract_id, p_client_id, p_freelancer_id, v_authoritative_amount, 'pending');

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