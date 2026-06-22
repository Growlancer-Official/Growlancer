-- Wallet RPC Functions Migration
-- Run this in Supabase SQL Editor
--
-- Provides secure RPC functions for wallet operations:
-- - Getting wallet balance (auto-creates wallet if missing)
-- - Updating wallet balance with negative balance prevention
-- - Holding/releasing funds to/from pending balance
-- - Processing and cancelling withdrawals
-- - Managing payout methods
--
-- All RPCs are SECURITY DEFINER and validate auth.uid() matches p_user_id.

-- ====================================================================
-- 1. GET WALLET BALANCE
-- ====================================================================

-- Returns the user's wallet balance, pending_balance, and currency.
-- Auto-creates a wallet if one does not exist for the user.
CREATE OR REPLACE FUNCTION get_wallet_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet RECORD;
BEGIN
  -- Ensure wallet exists
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

-- ====================================================================
-- 2. UPDATE WALLET BALANCE
-- ====================================================================

-- Adds p_amount to the user's balance. Negative amounts are allowed for
-- deductions, but the balance must not go below zero.
-- Returns: { success, balance, pending_balance }
CREATE OR REPLACE FUNCTION update_wallet_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
BEGIN
  -- Validate auth
  IF p_user_id <> auth.uid() THEN
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
    RETURN jsonb_build_object(
      'success', false,
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

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_wallet.balance,
    'pending_balance', v_wallet.pending_balance
  );
END;
$$;

-- ====================================================================
-- 3. HOLD WALLET FUNDS
-- ====================================================================

-- Moves p_amount from balance to pending_balance.
-- Used when an escrow hold, withdrawal, or payment is initiated.
-- Requires sufficient available balance.
-- Returns: { success, balance, pending_balance }
CREATE OR REPLACE FUNCTION hold_wallet_funds(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
BEGIN
  -- Validate auth
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Lock the wallet row
  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- Check sufficient balance
  IF v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'balance', v_wallet.balance,
      'pending_balance', v_wallet.pending_balance
    );
  END IF;

  -- Move funds from balance to pending_balance
  UPDATE wallets
  SET balance = balance - p_amount,
      pending_balance = pending_balance + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance, pending_balance INTO v_wallet.balance, v_wallet.pending_balance;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_wallet.balance,
    'pending_balance', v_wallet.pending_balance
  );
END;
$$;

-- ====================================================================
-- 4. RELEASE WALLET FUNDS
-- ====================================================================

-- Moves p_amount from pending_balance back to balance.
-- Used when escrow is released, withdrawal fails/is cancelled, or hold expires.
-- Requires sufficient pending_balance.
-- Returns: { success, balance, pending_balance }
CREATE OR REPLACE FUNCTION release_wallet_funds(p_user_id UUID, p_amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_wallet wallets%ROWTYPE;
BEGIN
  -- Validate auth
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Lock the wallet row
  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- Check sufficient pending_balance
  IF v_wallet.pending_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient pending balance',
      'balance', v_wallet.balance,
      'pending_balance', v_wallet.pending_balance
    );
  END IF;

  -- Move funds from pending_balance back to balance
  UPDATE wallets
  SET balance = balance + p_amount,
      pending_balance = pending_balance - p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance, pending_balance INTO v_wallet.balance, v_wallet.pending_balance;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_wallet.balance,
    'pending_balance', v_wallet.pending_balance
  );
END;
$$;

-- ====================================================================
-- 5. PROCESS WITHDRAWAL COMPLETE
-- ====================================================================

-- Called when a PayPal payout (or other withdrawal method) completes.
-- Withdrawal flow:
--   1. Withdrawal created -> hold_wallet_funds() moves amount to pending_balance
--   2. Withdrawal processed via PayPal API
--   3. This function finalizes: marks withdrawal completed, deducts pending_balance
-- Returns: { success }
CREATE OR REPLACE FUNCTION process_withdrawal_complete(p_withdrawal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_withdrawal RECORD;
  v_wallet wallets%ROWTYPE;
BEGIN
  -- Fetch the withdrawal record
  SELECT * INTO v_withdrawal
  FROM withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  -- Only process pending/processing withdrawals
  IF v_withdrawal.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is not in a processable state');
  END IF;

  -- Validate auth: only the withdrawal owner or an admin can complete
  IF v_withdrawal.user_id <> auth.uid() AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Lock the wallet and deduct pending_balance
  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- Ensure sufficient pending balance
  IF v_wallet.pending_balance < v_withdrawal.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient pending balance');
  END IF;

  -- Deduct from pending_balance
  UPDATE wallets
  SET pending_balance = pending_balance - v_withdrawal.amount,
      updated_at = NOW()
  WHERE user_id = v_withdrawal.user_id;

  -- Update withdrawal status
  UPDATE withdrawals
  SET status = 'completed',
      processed_at = NOW()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ====================================================================
-- 6. CANCEL WITHDRAWAL
-- ====================================================================

-- Called when a withdrawal is cancelled.
-- Moves funds from pending_balance back to balance and marks withdrawal as cancelled.
-- Returns: { success }
CREATE OR REPLACE FUNCTION cancel_withdrawal(p_withdrawal_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_withdrawal RECORD;
  v_wallet wallets%ROWTYPE;
BEGIN
  -- Validate auth
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Fetch the withdrawal record
  SELECT * INTO v_withdrawal
  FROM withdrawals
  WHERE id = p_withdrawal_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  -- Only cancel pending/processing withdrawals
  IF v_withdrawal.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal cannot be cancelled in its current state');
  END IF;

  -- Lock the wallet
  SELECT * INTO v_wallet
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Wallet not found');
  END IF;

  -- Move funds from pending_balance back to balance
  UPDATE wallets
  SET balance = balance + v_withdrawal.amount,
      pending_balance = pending_balance - v_withdrawal.amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Update withdrawal status
  UPDATE withdrawals
  SET status = 'cancelled'
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ====================================================================
-- 7. GET PAYOUT METHODS
-- ====================================================================

-- Returns a JSON array of the user's payout methods.
-- Sensitive fields (account_number, routing_number) are masked.
-- Returns: JSON array of payout methods with masked sensitive data
CREATE OR REPLACE FUNCTION get_payout_methods(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Validate auth
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_array();
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pm.id,
      'type', pm.type,
      'email', pm.email,
      'phone', pm.phone,
      'account_holder_name', pm.account_holder_name,
      'account_number', CASE
        WHEN pm.account_number IS NOT NULL THEN
          '****' || RIGHT(pm.account_number, 4)
        ELSE NULL
      END,
      'routing_number', CASE
        WHEN pm.routing_number IS NOT NULL THEN
          '****' || RIGHT(pm.routing_number, 4)
        ELSE NULL
      END,
      'bank_name', pm.bank_name,
      'is_default', pm.is_default,
      'created_at', pm.created_at
    )
    ORDER BY pm.is_default DESC, pm.created_at DESC
  ) INTO v_result
  FROM payout_methods pm
  WHERE pm.user_id = p_user_id;

  -- Return empty array if no methods found
  IF v_result IS NULL THEN
    v_result := '[]'::JSONB;
  END IF;

  RETURN v_result;
END;
$$;

-- ====================================================================
-- 8. SET DEFAULT PAYOUT METHOD
-- ====================================================================

-- Sets a specific payout method as the user's default.
-- All other payout methods for this user will have is_default set to false.
-- Returns: { success }
CREATE OR REPLACE FUNCTION set_default_payout_method(p_method_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_method RECORD;
BEGIN
  -- Validate auth
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Verify the payout method belongs to the user
  SELECT * INTO v_method
  FROM payout_methods
  WHERE id = p_method_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout method not found');
  END IF;

  -- Unset all default flags for this user
  UPDATE payout_methods
  SET is_default = false,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Set the target method as default
  UPDATE payout_methods
  SET is_default = true,
      updated_at = NOW()
  WHERE id = p_method_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ====================================================================
-- 9. DELETE PAYOUT METHOD
-- ====================================================================

-- Deletes a payout method, ensuring it belongs to the specified user.
-- Returns: { success }
CREATE OR REPLACE FUNCTION delete_payout_method(p_method_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_method RECORD;
BEGIN
  -- Validate auth
  IF p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Verify the payout method belongs to the user and delete it
  DELETE FROM payout_methods
  WHERE id = p_method_id AND user_id = p_user_id
  RETURNING * INTO v_method;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payout method not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ====================================================================
-- GRANT EXECUTE PERMISSIONS
-- ====================================================================

-- All RPCs are accessible to authenticated users
GRANT EXECUTE ON FUNCTION get_wallet_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_wallet_balance(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION hold_wallet_funds(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION release_wallet_funds(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION process_withdrawal_complete(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_withdrawal(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_payout_methods(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_default_payout_method(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_payout_method(UUID, UUID) TO authenticated;