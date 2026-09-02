-- Fix: get_wallet_balance INSERT fails on Supabase read replicas
-- with "cannot execute INSERT in a read-only transaction" error.
-- The wallet row is always created by onboarding/update_wallet_balance,
-- so the INSERT here is unnecessary and breaks the balance read.

CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
BEGIN
  -- Just SELECT — wallet row is guaranteed to exist after onboarding.
  -- If it doesn't yet, return zero balance instead of failing on INSERT.
  SELECT balance, pending_balance, currency INTO v_wallet
  FROM wallets WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'balance', 0,
      'pending_balance', 0,
      'currency', 'INR');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_wallet.balance,
    'pending_balance', v_wallet.pending_balance,
    'currency', v_wallet.currency);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_balance(UUID) TO authenticated, service_role;
