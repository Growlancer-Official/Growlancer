-- Cleanup Duplicate Wallet Tables
-- 
-- Problem: Both `wallet_balances` and `wallet_transactions` tables exist on remote
-- alongside the canonical `wallets` table. These are legacy/alternative tables that
-- are NOT used by the codebase but cause confusion and potential 400 errors when
-- clients inadvertently access them.
--
-- Fix: Drop the unused tables. The `wallets` table (with RPC functions) is the
-- single source of truth for wallet operations.

-- ==================== DROP DUPLICATE TABLES ====================

-- wallet_balances was an earlier design using cents-based columns
-- (available_balance_cents, pending_balance_cents, etc.)
DROP TABLE IF EXISTS wallet_balances CASCADE;

-- wallet_transactions was an earlier design using cents-based columns
DROP TABLE IF EXISTS wallet_transactions CASCADE;

-- ==================== ENSURE WALLET EXISTS FOR ALL USERS ====================

-- Function to backfill wallets for existing users who may not have one
CREATE OR REPLACE FUNCTION backfill_missing_wallets()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO wallets (user_id, balance, pending_balance, currency)
  SELECT id, 0.00, 0.00, 'USD'
  FROM profiles
  WHERE id NOT IN (SELECT user_id FROM wallets)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Run the backfill
SELECT backfill_missing_wallets();

-- Drop the one-time backfill function
DROP FUNCTION IF EXISTS backfill_missing_wallets();

-- ==================== INDEX ====================

-- Ensure index exists for fast lookups
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
