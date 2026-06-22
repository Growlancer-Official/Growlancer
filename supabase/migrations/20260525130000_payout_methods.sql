-- Payout Methods Table Migration
-- Run this in Supabase SQL Editor
--
-- Creates the payout_methods table for storing freelancer payout preferences.
-- Supports PayPal, bank transfer, and Stripe payout methods.
-- Enforces a single default payout method per user.

-- ==================== PAYOUT METHODS TABLE ====================

CREATE TABLE IF NOT EXISTS payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('paypal', 'bank_transfer', 'stripe')),
  email TEXT,
  phone TEXT,
  account_holder_name TEXT,
  account_number TEXT,
  routing_number TEXT,
  bank_name TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== AUTO-UPDATE UPDATED_AT ====================

-- Trigger function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_payout_methods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to payout_methods table
DROP TRIGGER IF EXISTS trigger_payout_methods_updated_at ON payout_methods;
CREATE TRIGGER trigger_payout_methods_updated_at
BEFORE UPDATE ON payout_methods
FOR EACH ROW
EXECUTE FUNCTION update_payout_methods_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE payout_methods ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own payout methods
DROP POLICY IF EXISTS "Users can view own payout methods" ON payout_methods;
CREATE POLICY "Users can view own payout methods" ON payout_methods
  FOR SELECT USING (auth.uid() = user_id);

-- Users can INSERT their own payout methods
DROP POLICY IF EXISTS "Users can insert own payout methods" ON payout_methods;
CREATE POLICY "Users can insert own payout methods" ON payout_methods
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can UPDATE their own payout methods
DROP POLICY IF EXISTS "Users can update own payout methods" ON payout_methods;
CREATE POLICY "Users can update own payout methods" ON payout_methods
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can DELETE their own payout methods
DROP POLICY IF EXISTS "Users can delete own payout methods" ON payout_methods;
CREATE POLICY "Users can delete own payout methods" ON payout_methods
  FOR DELETE USING (auth.uid() = user_id);

-- Admins can SELECT all payout methods
DROP POLICY IF EXISTS "Admins can view all payout methods" ON payout_methods;
CREATE POLICY "Admins can view all payout methods" ON payout_methods
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ==================== ENSURE SINGLE DEFAULT PAYOUT METHOD ====================

-- Function/trigger to ensure only ONE method can be default per user
-- When inserting or updating is_default = true, set all other methods
-- for that user to is_default = false
CREATE OR REPLACE FUNCTION ensure_single_default_payout_method()
RETURNS TRIGGER AS $$
BEGIN
  -- If the new/updated row is being set as default, unset all others
  IF NEW.is_default = true THEN
    UPDATE payout_methods
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to payout_methods table
DROP TRIGGER IF EXISTS trigger_ensure_single_default_payout ON payout_methods;
CREATE TRIGGER trigger_ensure_single_default_payout
AFTER INSERT OR UPDATE OF is_default ON payout_methods
FOR EACH ROW
WHEN (NEW.is_default = true)
EXECUTE FUNCTION ensure_single_default_payout_method();

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_payout_methods_user_id ON payout_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_methods_type ON payout_methods(type);
CREATE INDEX IF NOT EXISTS idx_payout_methods_is_default ON payout_methods(is_default) WHERE is_default = true;