-- 20261028000000_fund_escrow_from_wallet.sql
-- Fund escrow from the client's Growlancer wallet (added via wallet top-up).
--
-- Runs the ENTIRE financial operation in ONE SECURITY DEFINER transaction:
--   ownership check → amount recompute (contract / milestones, server-side) →
--   5% platform fee → locked balance check → atomic debit → escrow funding →
--   ledger entries. No multi-step race conditions, no client-trusted amounts.
--
-- The platform fee is kept in the client's wallet as a separate 'platform_fee'
-- debit ledger entry; escrow only holds the funding amount (parity with the
-- Razorpay path where the client pays amount + fee and escrow holds amount).

CREATE OR REPLACE FUNCTION public.fund_escrow_from_wallet(
  p_contract_id uuid,
  p_milestone_indices integer[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid            uuid := auth.uid();
  v_contract       RECORD;
  v_funding_amount NUMERIC := 0;
  v_fee            NUMERIC := 0;
  v_total          NUMERIC := 0;
  v_balance        NUMERIC := 0;
  v_milestones     jsonb;
  v_idx            integer;
  v_ms_amount      NUMERIC;
  v_escrow_id      uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Load + lock the contract row (ownership check)
  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Contract not found');
  END IF;

  IF v_contract.client_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
  END IF;

  -- Idempotency: never double-fund
  IF v_contract.escrow_funded THEN
    RETURN jsonb_build_object('success', false, 'error', 'Escrow is already funded', 'balance', NULL);
  END IF;

  -- Server-side amount recompute (never trust the client)
  IF p_milestone_indices IS NOT NULL AND array_length(p_milestone_indices, 1) > 0 THEN
    v_milestones := COALESCE(v_contract.milestones, '[]'::jsonb);
    FOREACH v_idx IN ARRAY p_milestone_indices LOOP
      BEGIN
        v_ms_amount := COALESCE((v_milestones->v_idx->>'amount')::numeric, 0);
      EXCEPTION WHEN OTHERS THEN
        v_ms_amount := 0;
      END;
      v_funding_amount := v_funding_amount + v_ms_amount;
    END LOOP;
    IF v_funding_amount <= 0 THEN
      v_funding_amount := COALESCE(v_contract.amount, 0);
    END IF;
  ELSE
    v_funding_amount := COALESCE(v_contract.amount, 0);
  END IF;

  -- Platform fee: prefer the contract's stored fee (parity with the Razorpay
  -- full-funding path); fall back to the standard 5% for partial funding.
  IF p_milestone_indices IS NULL OR array_length(p_milestone_indices, 1) IS NULL THEN
    v_fee := COALESCE(v_contract.platform_fee, ROUND(v_funding_amount * 0.05 * 100) / 100);
  ELSE
    v_fee := ROUND(v_funding_amount * 0.05 * 100) / 100;
  END IF;
  v_total := ROUND((v_funding_amount + v_fee) * 100) / 100;

  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid funding amount');
  END IF;

  -- Ensure the client has a wallet (auto-create if missing)
  INSERT INTO public.wallets (user_id, currency)
  VALUES (v_uid, 'INR')
  ON CONFLICT (user_id) DO NOTHING;

  -- Locked atomic debit — fails if balance < total
  UPDATE public.wallets
  SET balance = balance - v_total,
      updated_at = NOW()
  WHERE user_id = v_uid AND balance >= v_total
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_uid;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient wallet balance',
      'balance', v_balance,
      'required', v_total
    );
  END IF;

  -- Fund the escrow (marks escrow funded + contract active + project in_progress)
  PERFORM public.admin_fund_escrow(p_contract_id);

  SELECT id INTO v_escrow_id FROM public.escrow WHERE contract_id = p_contract_id LIMIT 1;

  -- Ledger: client debit for the ESCROWED amount (what went into escrow). The
  -- platform fee is recorded separately below, so the two rows sum exactly to
  -- the amount actually paid (no double-counted fee).
  INSERT INTO public.transactions (user_id, contract_id, escrow_id, type, amount, currency, status, description, source, metadata)
  VALUES (
    v_uid, p_contract_id, v_escrow_id,
    'debit', v_funding_amount, 'INR', 'completed',
    'Escrow funded from wallet',
    'escrow',
    jsonb_build_object('method', 'wallet', 'platform_fee', v_fee, 'milestone_indices', p_milestone_indices)
  );

  -- Ledger: platform fee (kept by the platform)
  IF v_fee > 0 THEN
    INSERT INTO public.transactions (user_id, contract_id, escrow_id, type, amount, currency, status, description, source, metadata)
    VALUES (
      v_uid, p_contract_id, v_escrow_id,
      'debit', v_fee, 'INR', 'completed',
      'Platform fee for escrow funding',
      'platform_fee',
      jsonb_build_object('method', 'wallet', 'funding_amount', v_funding_amount)
    );
  END IF;

  -- Notify both parties (fully-qualified — search_path is '')
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES
      (v_contract.client_id, 'payment', 'Escrow funded',
       'Your escrow payment of INR ' || v_total || ' was received and the contract is now active.',
       '/dashboard/contracts',
       jsonb_build_object('contract_id', p_contract_id, 'method', 'wallet')),
      (v_contract.freelancer_id, 'contract', 'Contract funded — work can begin',
       'The client has funded the escrow. You can now start working on the contract.',
       '/dashboard/contracts',
       jsonb_build_object('contract_id', p_contract_id));
  EXCEPTION WHEN OTHERS THEN
    -- Notifications are best-effort; never fail the funding over them
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_balance,
    'amount', v_funding_amount,
    'platform_fee', v_fee,
    'total', v_total
  );
END;
$function$;

-- Grants
REVOKE ALL ON FUNCTION public.fund_escrow_from_wallet(uuid, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fund_escrow_from_wallet(uuid, integer[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fund_escrow_from_wallet(uuid, integer[]) TO service_role;
