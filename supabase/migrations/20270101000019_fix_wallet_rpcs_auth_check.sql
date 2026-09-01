-- Fix: wallet RPC auth check was using current_setting('role') which is a
-- PostgreSQL session setting, NOT the Supabase JWT role. Use auth.uid() IS NULL
-- instead — service_role connections have no JWT, so auth.uid() returns NULL.
-- The original check `p_user_id <> auth.uid()` actually worked for service_role
-- because NULL <> UUID evaluates to NULL (falsy), but let's be explicit.

CREATE OR REPLACE FUNCTION public.update_wallet_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_caller UUID := auth.uid();
BEGIN
  -- Allow: service_role (auth.uid() is NULL) OR the wallet owner
  IF v_caller IS NOT NULL AND v_caller <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_wallet
  FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO v_wallet
    FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF v_wallet.balance + p_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance',
      'balance', v_wallet.balance, 'pending_balance', v_wallet.pending_balance);
  END IF;

  UPDATE wallets SET balance = balance + p_amount, updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance, pending_balance INTO v_wallet.balance, v_wallet.pending_balance;

  RETURN jsonb_build_object('success', true,
    'balance', v_wallet.balance, 'pending_balance', v_wallet.pending_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_wallet_balance(UUID, NUMERIC) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hold_wallet_funds(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NOT NULL AND v_caller <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_wallet
  FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance',
      'balance', v_wallet.balance, 'pending_balance', v_wallet.pending_balance);
  END IF;

  UPDATE wallets SET balance = balance - p_amount, pending_balance = pending_balance + p_amount, updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance, pending_balance INTO v_wallet.balance, v_wallet.pending_balance;

  RETURN jsonb_build_object('success', true,
    'balance', v_wallet.balance, 'pending_balance', v_wallet.pending_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hold_wallet_funds(UUID, NUMERIC) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_wallet_funds(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NOT NULL AND v_caller <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_wallet
  FROM wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_wallet.pending_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient pending balance',
      'balance', v_wallet.balance, 'pending_balance', v_wallet.pending_balance);
  END IF;

  UPDATE wallets SET balance = balance + p_amount, pending_balance = pending_balance - p_amount, updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance, pending_balance INTO v_wallet.balance, v_wallet.pending_balance;

  RETURN jsonb_build_object('success', true,
    'balance', v_wallet.balance, 'pending_balance', v_wallet.pending_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_wallet_funds(UUID, NUMERIC) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
BEGIN
  INSERT INTO wallets (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance, pending_balance, currency INTO v_wallet
  FROM wallets WHERE user_id = p_user_id;
  RETURN jsonb_build_object(
    'balance', v_wallet.balance, 'pending_balance', v_wallet.pending_balance, 'currency', v_wallet.currency);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_balance(UUID) TO authenticated, service_role;
