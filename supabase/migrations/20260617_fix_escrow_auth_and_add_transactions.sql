-- Fix Escrow Auth Bug + Create Transactions Table
-- Run this in Supabase SQL Editor
--
-- Two critical fixes:
-- 1. Fixes release_escrow RPC which incorrectly calls update_wallet_balance
--    (auth.uid() check fails when client tries to credit freelancer wallet)
-- 2. Creates the transactions table (referenced by withdrawal edge function
--    and escrow release but no migration existed)

-- ====================================================================
-- 1. CREATE TRANSACTIONS TABLE
-- ====================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'payment', 'refund', 'fee', 'withdrawal')),
  amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  description TEXT,
  source TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_contract_id ON transactions(contract_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_transactions_updated_at ON transactions;
CREATE TRIGGER trigger_transactions_updated_at
BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_transactions_updated_at();

-- RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
CREATE POLICY "Users can insert own transactions" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- 2. FIX release_escrow - Direct wallet update instead of calling
--    update_wallet_balance (which fails auth check)
-- ====================================================================

CREATE OR REPLACE FUNCTION release_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_contract RECORD;
  v_escrow RECORD;
BEGIN
  -- Validate auth
  IF p_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch contract with row lock
  SELECT * INTO v_contract
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  -- Verify client owns this contract
  IF v_contract.client_id <> p_client_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
  END IF;

  -- Get escrow record
  SELECT * INTO v_escrow
  FROM escrow
  WHERE contract_id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Escrow not found for this contract';
  END IF;

  -- Verify escrow is funded
  IF v_escrow.status <> 'funded' THEN
    RAISE EXCEPTION 'Escrow is not in funded state';
  END IF;

  -- Update escrow status
  UPDATE escrow
  SET status = 'released',
      released_at = NOW()
  WHERE contract_id = p_contract_id;

  -- Update contract status
  UPDATE contracts
  SET status = 'completed',
      updated_at = NOW()
  WHERE id = p_contract_id;

  -- Create transaction record for freelancer
  INSERT INTO transactions (
    user_id,
    contract_id,
    type,
    amount,
    status,
    description
  ) VALUES (
    v_contract.freelancer_id,
    p_contract_id,
    'payment',
    v_contract.freelancer_amount,
    'completed',
    'Escrow release for contract #' || p_contract_id::TEXT
  );

  -- Direct wallet update (SECURITY DEFINER bypasses RLS/auth checks)
  -- FIXED: Previously called update_wallet_balance() which checks auth.uid()
  --        against p_user_id. Since the client calls release_escrow, the
  --        auth.uid() is the client, not the freelancer, causing a failure.
  --        Now we update the wallet directly within this SECURITY DEFINER context.
  UPDATE wallets
  SET balance = balance + v_contract.freelancer_amount,
      updated_at = NOW()
  WHERE user_id = v_contract.freelancer_id;

  -- Auto-create wallet if missing (shouldn't happen, but just in case)
  IF NOT FOUND THEN
    INSERT INTO wallets (user_id, balance)
    VALUES (v_contract.freelancer_id, v_contract.freelancer_amount);
  END IF;

  RETURN TRUE;
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION release_escrow(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION create_contract_with_escrow(UUID, UUID, UUID, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fund_escrow(UUID, UUID) TO authenticated;

-- ====================================================================
-- 3. FIX process_withdrawal_complete - Same auth issue
--    When admin/system processes a withdrawal, auth.uid() is the admin
--    not the withdrawal owner. Fix by doing direct wallet update.
-- ====================================================================

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

  -- Deduct from pending_balance directly (SECURITY DEFINER bypasses auth checks)
  UPDATE wallets
  SET pending_balance = pending_balance - v_withdrawal.amount,
      updated_at = NOW()
  WHERE user_id = v_withdrawal.user_id;

  -- Update withdrawal status
  UPDATE withdrawals
  SET status = 'completed',
      processed_at = NOW()
  WHERE id = p_withdrawal_id;

  -- Create transaction record
  INSERT INTO transactions (user_id, type, amount, status, description, source)
  VALUES (v_withdrawal.user_id, 'withdrawal', v_withdrawal.amount, 'completed',
          'Withdrawal completed (' || v_withdrawal.method || ')',
          v_withdrawal.method);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION process_withdrawal_complete(UUID) TO authenticated;
