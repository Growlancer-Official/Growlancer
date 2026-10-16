-- ============================================================================
-- MR-04 (finding MONEY-002) — P0 MONEY CORRECTNESS
--
-- Problem:
--   20260920000000_fix_escrow_schema_drift.sql redefined admin_reverse_escrow
--   and DROPPED the wallet-funded credit path introduced by
--   20260818000000_fix_refund_wallet_double_credit.sql. That newer definition
--   unconditionally only debits the client's escrow_balance:
--       UPDATE wallets SET escrow_balance = GREATEST(escrow_balance - amount, 0) ...
--   For a wallet-funded escrow, the money came out of the client's wallet
--   balance — but nothing returns it, so the client silently loses the funds.
--
-- Fix (authoritative latest definition — restores the 20260818000000 logic):
--   Detect wallet-funded escrow by "no razorpay payment was EVER captured for
--   the contract (razorpay_payment_id IS NOT NULL regardless of current
--   status) AND no paypal capture/refund", then credit the client's wallet
--   balance + record the refund transaction. Card/UPI-funded escrows continue
--   to only debit escrow_balance (the provider already refunded the method).
--   search_path pinned to '' with fully-qualified public.* references.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_reverse_escrow(p_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_escrow RECORD;
  v_wallet_funded BOOLEAN;
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

  -- Wallet-funded = no razorpay payment EVER captured for this contract
  -- (captured OR refunded — payment id present), and no paypal capture either.
  -- Deliberately NO status filter: the webhook marks the order 'refunded'
  -- before this RPC runs, so a status='captured' check would wrongly conclude
  -- "wallet-funded" and double-credit the wallet.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.razorpay_orders
    WHERE contract_id = p_contract_id
      AND order_type = 'contract_escrow'
      AND razorpay_payment_id IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM public.paypal_orders
    WHERE contract_id = p_contract_id
      AND status IN ('captured', 'refunded')
  ) INTO v_wallet_funded;

  IF v_wallet_funded THEN
    UPDATE public.wallets
    SET balance = balance + v_escrow.amount,
        escrow_balance = GREATEST(escrow_balance - v_escrow.amount, 0),
        updated_at = NOW()
    WHERE user_id = v_escrow.client_id;

    INSERT INTO public.transactions (user_id, contract_id, escrow_id, type, amount, currency, status, description, source)
    VALUES (v_escrow.client_id, p_contract_id, v_escrow.id, 'credit', v_escrow.amount, 'INR', 'completed',
            'Escrow refunded to wallet (wallet-funded escrow)', 'refund');
  ELSE
    UPDATE public.wallets
    SET escrow_balance = GREATEST(escrow_balance - v_escrow.amount, 0),
        updated_at = NOW()
    WHERE user_id = v_escrow.client_id;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reverse_escrow(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reverse_escrow(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_reverse_escrow(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reverse_escrow(UUID) TO service_role;

-- ============================================================================
-- LIVE-DB VERIFICATION REQUIRED (run after applying):
--
--   -- (a) the authoritative definition includes the wallet credit path:
--   SELECT pg_get_functiondef('public.admin_reverse_escrow(uuid)'::regprocedure);
--   -- Expect: "balance = balance + v_escrow.amount" and v_wallet_funded logic.
--
--   -- (b) wallet-funded reversal returns the money to the wallet:
--   --   (choose a contract whose escrow was funded from the wallet balance)
--   SELECT balance, escrow_balance FROM public.wallets WHERE user_id = '<CLIENT_UUID>';
--   SELECT public.admin_reverse_escrow('<CONTRACT_UUID>'::uuid);
--   SELECT balance, escrow_balance FROM public.wallets WHERE user_id = '<CLIENT_UUID>';
--   -- Expect: balance increased by the escrow amount; escrow_balance decreased by it.
--
--   -- (c) ledger identity holds after reversal:
--   --   freelancer_credit + platform_revenue == client_total_charged
-- ============================================================================
