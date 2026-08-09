-- ============================================================
-- FIX: _refundable_amount returned non-zero on completed contracts
--
-- ROOT CAUSE: for milestone-less contracts (full-contract escrow)
-- the function only subtracted released amounts from the MILESTONES
-- JSONB. When the escrow row itself was released (contract completed)
-- but the contract has no milestones, it still reported the full
-- escrow amount as refundable — so a completed contract looked
-- refundable and refunds could be attempted on released funds.
--
-- FIX: return 0 when the contract is completed OR the escrow row
-- itself has been released. Funds already moved to the freelancer
-- are never refundable.
-- ============================================================

CREATE OR REPLACE FUNCTION public._refundable_amount(p_contract_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_escrow_amount NUMERIC;
  v_escrow_status TEXT;
  v_released NUMERIC := 0;
  v_ms JSONB;
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Completed contracts: funds already released to the freelancer.
  IF v_contract.status = 'completed' THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(amount, 0), status INTO v_escrow_amount, v_escrow_status
  FROM public.escrow
  WHERE contract_id = p_contract_id;

  -- Released escrow (full release on milestone-less contracts): nothing left.
  IF v_escrow_status = 'released' THEN
    RETURN 0;
  END IF;

  -- Fallback: contract is escrow-funded but the escrow row is missing
  -- (data created before the fund flow reliably wrote escrow rows). The
  -- funds are still held, so the refundable amount is the contract amount.
  IF v_escrow_amount = 0 AND v_contract.escrow_funded THEN
    v_escrow_amount := COALESCE(v_contract.amount, 0);
  END IF;

  SELECT milestones INTO v_ms FROM public.contracts WHERE id = p_contract_id;

  IF v_ms IS NOT NULL THEN
    -- Only funds actually moved OUT of escrow are non-refundable.
    SELECT COALESCE(SUM((elem->>'amount')::NUMERIC), 0) INTO v_released
    FROM jsonb_array_elements(v_ms) AS elem
    WHERE (elem->>'status') IN ('released', 'paid');
  END IF;

  RETURN GREATEST(v_escrow_amount - v_released, 0);
END $$;

GRANT EXECUTE ON FUNCTION public._refundable_amount(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public._refundable_amount(UUID) TO service_role;
