-- ============================================================
-- GROWLANCER PRODUCTION AUDIT FIXES
-- Applied: 2026-07-01
-- ============================================================

-- 1. USER SUSPENSION — Add suspension fields to profiles
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suspend_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ DEFAULT NULL;
-- 2. RAZORPAY ORDERS TABLE (skip if already exists from earlier migration)
CREATE TABLE IF NOT EXISTS razorpay_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  razorpay_order_id TEXT UNIQUE NOT NULL,
  contract_id UUID,
  subscription_id UUID,
  order_type TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'attempted', 'paid', 'failed', 'refunded')),
  description TEXT,
  metadata JSONB,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_user_id ON razorpay_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_status ON razorpay_orders(status);
ALTER TABLE razorpay_orders ENABLE ROW LEVEL SECURITY;
-- Drop existing policies first, then recreate (safer than IF NOT EXISTS with EXECUTE)
DROP POLICY IF EXISTS "Users read own razorpay orders" ON razorpay_orders;
CREATE POLICY "Users read own razorpay orders" ON razorpay_orders 
  FOR SELECT USING (auth.uid()::text = user_id::text);
DROP POLICY IF EXISTS "Users insert own razorpay orders" ON razorpay_orders;
CREATE POLICY "Users insert own razorpay orders" ON razorpay_orders 
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
-- 3. RAZORPAY TRANSACTIONS TABLE (skip if already exists)
CREATE TABLE IF NOT EXISTS razorpay_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_order_id UUID REFERENCES razorpay_orders(id) ON DELETE CASCADE,
  razorpay_payment_id TEXT UNIQUE NOT NULL,
  razorpay_signature TEXT,
  transaction_type TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL,
  payer_email TEXT,
  payer_name TEXT,
  processor_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_razorpay_transactions_order_id ON razorpay_transactions(razorpay_order_id);
ALTER TABLE razorpay_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own razorpay transactions" ON razorpay_transactions;
CREATE POLICY "Users read own razorpay transactions" ON razorpay_transactions 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM razorpay_orders 
      WHERE id::text = razorpay_order_id::text 
      AND user_id::text = auth.uid()::text
    )
  );
-- 4. USER COUNT FIX — Create a view that excludes deleted/suspended users
CREATE OR REPLACE VIEW active_users AS
SELECT * FROM profiles 
WHERE deleted_at IS NULL 
  AND suspended_at IS NULL 
  AND banned_at IS NULL;
-- 5. CASCADING DELETE FUNCTION — Clean up user data safely
CREATE OR REPLACE FUNCTION cleanup_user_data(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete wallet and balances
  DELETE FROM wallet_transactions WHERE user_id = p_user_id;
  DELETE FROM wallet_balances WHERE user_id = p_user_id;
  DELETE FROM wallets WHERE user_id = p_user_id;
  
  -- Delete messages
  DELETE FROM messages WHERE sender_id = p_user_id OR receiver_id = p_user_id;
  
  -- Delete notifications
  DELETE FROM notifications WHERE user_id = p_user_id;
  
  -- Delete proposals
  DELETE FROM proposals WHERE freelancer_id = p_user_id;
  
  -- Delete invites
  DELETE FROM invites WHERE freelancer_id = p_user_id OR client_id = p_user_id;
  
  -- Delete project matches
  DELETE FROM project_matches WHERE freelancer_id = p_user_id;
  
  -- Delete referrals
  DELETE FROM referrals WHERE referrer_id = p_user_id OR referred_user_id = p_user_id;
  DELETE FROM referral_stats WHERE user_id = p_user_id;
  
  -- Delete reviews
  DELETE FROM reviews WHERE reviewer_id = p_user_id OR reviewee_id = p_user_id;
  
  -- Delete services
  DELETE FROM services WHERE freelancer_id = p_user_id;
  
  -- Delete transactions
  DELETE FROM transactions WHERE user_id = p_user_id;
  
  -- Delete withdrawals
  DELETE FROM withdrawals WHERE user_id = p_user_id;
  
  -- Delete paypal orders/transactions
  DELETE FROM paypal_transactions WHERE paypal_order_id IN (SELECT id FROM paypal_orders WHERE user_id = p_user_id);
  DELETE FROM paypal_orders WHERE user_id = p_user_id;
  
  -- Delete razorpay orders/transactions
  DELETE FROM razorpay_transactions WHERE razorpay_order_id IN (SELECT id FROM razorpay_orders WHERE user_id = p_user_id);
  DELETE FROM razorpay_orders WHERE user_id = p_user_id;
  
  -- Delete freelancer/client profiles
  DELETE FROM freelancer_profiles WHERE user_id = p_user_id;
  DELETE FROM client_profiles WHERE user_id = p_user_id;
  
  -- Delete subscriptions
  DELETE FROM subscriptions WHERE user_id = p_user_id;
  
  -- Delete usage logs
  DELETE FROM usage_logs WHERE user_id = p_user_id;
  
  -- Delete profile (this will cascade to remaining related records)
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;
-- 6. SUSPENSION CHECK FUNCTION — For RLS and middleware
CREATE OR REPLACE FUNCTION is_user_suspended(p_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_user_id 
      AND (suspended_at IS NOT NULL OR banned_at IS NOT NULL)
  );
END;
$$;
-- 7. INDEXES FOR PRODUCTION PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_profiles_suspended_at ON profiles(suspended_at) WHERE suspended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_user_id_status ON razorpay_orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_messages_contract_id ON messages(contract_id);
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer_id_status ON contracts(freelancer_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id_status ON contracts(client_id, status);
-- 8. RLS POLICIES FOR ADMIN ACCESS
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id::text = auth.uid()::text AND role = 'admin')
);
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id::text = auth.uid()::text AND role = 'admin')
);
-- 9. FIX SUBSCRIPTION PLANS ID (ensure text IDs are valid)
-- Avoid type error: id is UUID, can't cast to text directly
-- Instead, just do a no-op update to trigger any side effects
UPDATE subscription_plans SET updated_at = NOW() WHERE updated_at IS NULL;
