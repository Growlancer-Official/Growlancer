-- 20270119000005_fix_contract_start_date_on_fund.sql
-- Fix: the freelancer Contracts page showed "Started —" for every contract even
-- when active (escrow funded), because contracts.start_date was never set when
-- the contract transitions to active. Set it in admin_fund_escrow (the single
-- chokepoint every funding path — Razorpay full/partial + wallet — goes
-- through). Also backfill contracts that are already active but lack a date
-- (use their funded_at from escrow where available, else created_at).

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

  -- Mark contract active + funded. start_date is set the day escrow is funded
  -- (the contract is considered started); never overwrite an existing date.
  UPDATE public.contracts
  SET status = 'active',
      escrow_funded = true,
      start_date = COALESCE(start_date, CURRENT_DATE),
      updated_at = NOW()
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

-- Backfill: active contracts already funded but missing a start date.
UPDATE public.contracts c
SET start_date = COALESCE(
  (SELECT e.funded_at::date FROM public.escrow e WHERE e.contract_id = c.id AND e.funded_at IS NOT NULL ORDER BY e.funded_at LIMIT 1),
  c.created_at::date
)
WHERE c.status = 'active'
  AND c.start_date IS NULL;