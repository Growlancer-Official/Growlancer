-- Fix: PostgREST schema cache has stale return type for get_wallet_balance
-- (thinks it returns UUID instead of JSONB — causes "invalid input syntax for 
-- type uuid" error when calling the RPC via REST API).
-- Solution: recreate the function with identical body to force schema re-parse,
-- then notify PostgREST to reload its schema cache.

CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
  v_pending NUMERIC;
  v_escrow NUMERIC;
  v_currency TEXT;
BEGIN
  SELECT balance, pending_balance, COALESCE(escrow_balance, 0), currency
  INTO v_balance, v_pending, v_escrow, v_currency
  FROM wallets WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'balance', 0,
      'pending_balance', 0,
      'escrow_balance', 0,
      'currency', 'INR');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_balance,
    'pending_balance', v_pending,
    'escrow_balance', v_escrow,
    'currency', v_currency);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_balance(UUID) TO authenticated, service_role;

-- Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
