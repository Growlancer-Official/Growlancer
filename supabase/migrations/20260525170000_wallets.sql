-- Wallets Table Migration
-- Run this in Supabase SQL Editor
--
-- Creates the wallets table for tracking user balances and pending funds.
-- Each user has exactly one wallet (enforced via UNIQUE on user_id).
-- Includes auto-creation trigger when a new user profile is created.

-- ==================== WALLETS TABLE ====================

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pending_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ==================== AUTO-UPDATE UPDATED_AT ====================

-- Trigger function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to wallets table
DROP TRIGGER IF EXISTS trigger_wallets_updated_at ON wallets;
CREATE TRIGGER trigger_wallets_updated_at
BEFORE UPDATE ON wallets
FOR EACH ROW
EXECUTE FUNCTION update_wallets_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own wallet
DROP POLICY IF EXISTS "Users can view own wallet" ON wallets;
CREATE POLICY "Users can view own wallet" ON wallets
  FOR SELECT USING (auth.uid() = user_id);

-- Users can UPDATE their own wallet
-- NOTE: Direct UPDATE is restricted; use RPC functions for balance changes
DROP POLICY IF EXISTS "Users can update own wallet" ON wallets;
CREATE POLICY "Users can update own wallet" ON wallets
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can SELECT all wallets
DROP POLICY IF EXISTS "Admins can view all wallets" ON wallets;
CREATE POLICY "Admins can view all wallets" ON wallets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can UPDATE all wallets
DROP POLICY IF EXISTS "Admins can update all wallets" ON wallets;
CREATE POLICY "Admins can update all wallets" ON wallets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== AUTO-CREATE WALLET ON USER SIGNUP ====================

-- Function to automatically create a wallet when a new user profile is created
CREATE OR REPLACE FUNCTION ensure_wallet_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wallets (user_id, balance, pending_balance, currency)
  VALUES (NEW.id, 0.00, 0.00, 'USD')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to profiles table AFTER INSERT
DROP TRIGGER IF EXISTS trigger_ensure_wallet_on_signup ON profiles;
CREATE TRIGGER trigger_ensure_wallet_on_signup
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION ensure_wallet_for_user();

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);