-- ============================================================
-- FIX: escrow row creation
--
-- ROOT CAUSE
-- Contracts created via createFromProposal (client "Accept & Hire"
-- JS path) had NO escrow row. admin_fund_escrow only UPDATE'd the
-- escrow table — when the row was missing it silently skipped — yet
-- still marked the contract escrow_funded = true / status = 'active'.
-- Result: freelancer UI showed "In Progress" + "Not Funded ₹0" and
-- escrow details showed 0 funded / 0 held / 0 released.
--
-- FIX
-- 1. admin_fund_escrow now INSERTs the escrow row when missing
--    (repairs broken state on retry) and only returns early when the
--    contract is fully consistent (funded + escrow row funded).
-- 2. Data repair: create escrow rows for every existing contract that
--    is marked funded/active but has no escrow row, and credit the
--    client wallet escrow balance once.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_fund_escrow(p_contract_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_contract RECORD;
  v_escrow_amount NUMERIC;
  v_prev_status TEXT;
  v_newly_funded BOOLEAN := false;
BEGIN
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Idempotency guard: only skip when the state is fully consistent.
  -- (escrow_funded = true but NO funded escrow row = broken state → repair.)
  IF v_contract.escrow_funded AND EXISTS (
    SELECT 1 FROM public.escrow
    WHERE contract_id = p_contract_id AND status = 'funded'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Create or update the escrow row (repairs contracts without a shell)
  SELECT amount, status INTO v_escrow_amount, v_prev_status
  FROM public.escrow
  WHERE contract_id = p_contract_id;

  IF v_escrow_amount IS NULL THEN
    INSERT INTO public.escrow (
      contract_id, client_id, freelancer_id, amount, status, funded_at, updated_at
    ) VALUES (
      p_contract_id, v_contract.client_id, v_contract.freelancer_id,
      v_contract.amount, 'funded', NOW(), NOW()
    )
    RETURNING amount INTO v_escrow_amount;
    v_newly_funded := true;
  ELSE
    v_newly_funded := (v_prev_status IS DISTINCT FROM 'funded');
    UPDATE public.escrow
    SET status = 'funded',
        funded_at = COALESCE(funded_at, NOW()),
        updated_at = NOW()
    WHERE contract_id = p_contract_id;
  END IF;

  -- Mark contract active + funded
  UPDATE public.contracts
  SET status = 'active', escrow_funded = true, updated_at = NOW()
  WHERE id = p_contract_id;

  -- Advance project
  UPDATE public.projects
  SET status = 'in_progress'
  WHERE id = v_contract.project_id;

  -- Track escrowed funds on the client wallet (escrow balance) — ONLY when
  -- this call is what transitions the escrow to funded (never double-credit).
  IF v_newly_funded AND v_escrow_amount > 0 THEN
    INSERT INTO public.wallets (user_id, balance, escrow_balance, currency)
    VALUES (v_contract.client_id, 0, v_escrow_amount, 'INR')
    ON CONFLICT (user_id) DO UPDATE SET
      escrow_balance = public.wallets.escrow_balance + EXCLUDED.escrow_balance,
      updated_at = NOW();
  END IF;

  RETURN TRUE;
END;
$function$;

-- ============================================================
-- DATA REPAIR: existing contracts marked funded but with no escrow row
-- ============================================================
INSERT INTO public.escrow (
  contract_id, client_id, freelancer_id, amount, status, funded_at, updated_at
)
SELECT c.id, c.client_id, c.freelancer_id, c.amount, 'funded', c.updated_at, NOW()
FROM public.contracts c
WHERE c.escrow_funded = true
  AND c.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM public.escrow e WHERE e.contract_id = c.id);

-- Credit client wallets once for the repaired escrows
INSERT INTO public.wallets (user_id, balance, escrow_balance, currency)
SELECT c.client_id, 0, c.amount, 'INR'
FROM public.contracts c
WHERE c.escrow_funded = true
  AND c.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM public.escrow e WHERE e.contract_id = c.id)
ON CONFLICT (user_id) DO UPDATE SET
  escrow_balance = public.wallets.escrow_balance + EXCLUDED.escrow_balance,
  updated_at = NOW();

-- REVERSE REPAIR: contracts funded via the old fund() path (escrow row
-- status = 'funded' but escrow_funded flag never set) → mark funded so UI
-- and reality match again.
UPDATE public.contracts c
SET escrow_funded = true, updated_at = NOW()
WHERE c.escrow_funded = false
  AND EXISTS (
    SELECT 1 FROM public.escrow e
    WHERE e.contract_id = c.id AND e.status = 'funded'
  );
