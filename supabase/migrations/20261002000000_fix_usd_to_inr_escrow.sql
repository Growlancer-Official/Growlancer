-- ═══════════════════════════════════════════════════════════════════════════
-- FIX LEFTOVER USD → INR (escrow / wallet functions)
-- Migration 20261002000000
-- The platform is fully INR now (India-only via Cashfree, PayPal Coming Soon).
-- Two SECURITY DEFINER functions + the wallets.currency default still wrote
-- 'USD', which corrupted client escrow-balance tracking. This fixes them.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── wallets.currency default → INR ─────────────────────────────────────────
ALTER TABLE public.wallets
  ALTER COLUMN currency SET DEFAULT 'INR';

-- Backfill any existing USD wallets to INR (no mixed-currency wallets exist;
-- the platform has never held real money, and INR is now the single currency).
UPDATE public.wallets SET currency = 'INR' WHERE currency = 'USD';

-- ─── ensure_wallet_for_user (trigger) → INR ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_wallet_for_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.wallets (user_id, balance, pending_balance, currency)
  VALUES (NEW.id, 0.00, 0.00, 'INR')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ─── admin_fund_escrow → INR ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_fund_escrow(p_contract_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    VALUES (v_contract.client_id, 0, v_escrow_amount, 'INR')
    ON CONFLICT (user_id) DO UPDATE SET
      escrow_balance = public.wallets.escrow_balance + EXCLUDED.escrow_balance,
      updated_at = NOW();
  END IF;
  RETURN TRUE;
END;
$function$;

-- ─── admin_reverse_escrow → comment only (logic is currency-neutral) ────────
COMMENT ON FUNCTION public.admin_reverse_escrow(uuid) IS
  'Reverse a funded escrow back to refunded (used by Cashfree refund webhook). Funds were already returned to the client by Cashfree.';
