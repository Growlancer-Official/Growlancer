-- Fix: Wallet RPCs not callable from edge functions (service_role)
--
-- Root cause: update_wallet_balance, hold_wallet_funds, release_wallet_funds
-- only granted EXECUTE to `authenticated`. Edge functions use service_role
-- (supabaseAdmin) which can't invoke them → wallet_topup silently fails.
--
-- Fix: 1) Re-grant EXECUTE to both authenticated AND service_role
--       2) Relax auth.uid() checks to also allow service_role callers

-- ====================================================================
-- 1. RE-GRANT EXECUTE PERMISSIONS
-- ====================================================================

GRANT EXECUTE ON FUNCTION public.update_wallet_balance(UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hold_wallet_funds(UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_wallet_funds(UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_withdrawal_complete(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance(UUID) TO authenticated, service_role;

-- ====================================================================
-- 2. RELAX auth.uid() CHECKS IN WALLET RPCs
-- ====================================================================
-- When called from edge functions via service_role, auth.uid() returns NULL.
-- The original check `IF p_user_id <> auth.uid()` would fail because
-- UUID <> NULL evaluates to NULL (falsy) — so it actually passes. BUT
-- some Supabase configs return a service_role UUID for auth.uid(), which
-- breaks the check. Add an explicit service_role bypass.

-- UPDATE WALLET BALANCE
CREATE OR REPLACE FUNCTION public.update_wallet_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_caller UUID := auth.uid();
  v_is_service_role BOOLEAN := (current_setting('role', true) = 'service_role');
BEGIN
  -- Allow service_role (edge functions) OR the wallet owner
  IF NOT v_is_service_role AND v_caller <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Lock the wallet row for update to prevent race conditions
  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Auto-create wallet if missing
    INSERT INTO wallets (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_wallet
    FROM wallets
    WHERE user_id = p_user_id
    FOR UPDATE;
  END IF;

  -- Check for negative balance
  IF v_wallet.balance + p_amount < 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Insufficient balance',
      'balance', v_wallet.balance,
      'pending_balance', v_wallet.pending_balance
    );
  END IF;

  -- Update balance
  UPDATE wallets
  SET balance = balance + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance, pending_balance INTO v_wallet.balance, v_wallet.pending_balance;

  RETURN jsonb_build_object('success', true,
    'balance', v_wallet.balance,
    'pending_balance', v_wallet.pending_balance
  );
END;
$$;

-- HOLD WALLET FUNDS
CREATE OR REPLACE FUNCTION public.hold_wallet_funds(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_caller UUID := auth.uid();
  v_is_service_role BOOLEAN := (current_setting('role', true) = 'service_role');
BEGIN
  IF NOT v_is_service_role AND v_caller <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Insufficient balance',
      'balance', v_wallet.balance,
      'pending_balance', v_wallet.pending_balance
    );
  END IF;

  UPDATE wallets
  SET balance = balance - p_amount,
      pending_balance = pending_balance + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance, pending_balance INTO v_wallet.balance, v_wallet.pending_balance;

  RETURN jsonb_build_object('success', true,
    'balance', v_wallet.balance,
    'pending_balance', v_wallet.pending_balance
  );
END;
$$;

-- RELEASE WALLET FUNDS
CREATE OR REPLACE FUNCTION public.release_wallet_funds(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
  v_caller UUID := auth.uid();
  v_is_service_role BOOLEAN := (current_setting('role', true) = 'service_role');
BEGIN
  IF NOT v_is_service_role AND v_caller <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  IF v_wallet.pending_balance < p_amount THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Insufficient pending balance',
      'balance', v_wallet.balance,
      'pending_balance', v_wallet.pending_balance
    );
  END IF;

  UPDATE wallets
  SET balance = balance + p_amount,
      pending_balance = pending_balance - p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance, pending_balance INTO v_wallet.balance, v_wallet.pending_balance;

  RETURN jsonb_build_object('success', true,
    'balance', v_wallet.balance,
    'pending_balance', v_wallet.pending_balance
  );
END;
$$;

-- GET WALLET BALANCE
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
BEGIN
  INSERT INTO wallets (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, pending_balance, currency INTO v_wallet
  FROM wallets WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'balance', v_wallet.balance,
    'pending_balance', v_wallet.pending_balance,
    'currency', v_wallet.currency
  );
END;
$$;
