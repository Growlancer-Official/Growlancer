-- Razorpay Payment Tables
-- Stores Razorpay orders and transactions for escrow and subscription payments

-- ─── RAZORPAY ORDERS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS razorpay_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('contract_escrow', 'subscription', 'service_purchase')),
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'captured', 'failed', 'refunded')),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_user_id ON razorpay_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_razorpay_order_id ON razorpay_orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_contract_id ON razorpay_orders(contract_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_orders_status ON razorpay_orders(status);

-- Enable RLS
ALTER TABLE razorpay_orders ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Users can view their own razorpay orders" ON razorpay_orders;
CREATE POLICY "Users can view their own razorpay orders"
  ON razorpay_orders FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own razorpay orders" ON razorpay_orders;
CREATE POLICY "Users can insert their own razorpay orders"
  ON razorpay_orders FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Edge function can update razorpay orders" ON razorpay_orders;
CREATE POLICY "Edge function can update razorpay orders"
  ON razorpay_orders FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ─── RAZORPAY TRANSACTIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS razorpay_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razorpay_order_id UUID REFERENCES razorpay_orders(id) ON DELETE CASCADE,
  razorpay_payment_id TEXT,
  razorpay_transaction_id TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('capture', 'refund')),
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending',
  method TEXT,
  payer_email TEXT,
  payer_contact TEXT,
  processor_response JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_razorpay_transactions_order_id ON razorpay_transactions(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_razorpay_transactions_payment_id ON razorpay_transactions(razorpay_payment_id);

-- Enable RLS
ALTER TABLE razorpay_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Users can view their own razorpay transactions" ON razorpay_transactions;
CREATE POLICY "Users can view their own razorpay transactions"
  ON razorpay_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM razorpay_orders
      WHERE razorpay_orders.id = razorpay_transactions.razorpay_order_id
      AND razorpay_orders.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Edge function can insert razorpay transactions" ON razorpay_transactions;
CREATE POLICY "Edge function can insert razorpay transactions"
  ON razorpay_transactions FOR INSERT
  WITH CHECK (true);

-- ─── TRIGGER: Auto-update razorpay_orders.updated_at ──────────────────────────
CREATE OR REPLACE FUNCTION update_razorpay_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_razorpay_orders_updated_at_trigger ON razorpay_orders;
CREATE TRIGGER update_razorpay_orders_updated_at_trigger
  BEFORE UPDATE ON razorpay_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_razorpay_orders_updated_at();

-- ─── PAYPAL DISPUTES TABLE (for webhook) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS paypal_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id TEXT NOT NULL UNIQUE,
  transaction_id TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  amount DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  processor_response JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_paypal_disputes_dispute_id ON paypal_disputes(dispute_id);
CREATE INDEX IF NOT EXISTS idx_paypal_disputes_status ON paypal_disputes(status);

-- Enable RLS
ALTER TABLE paypal_disputes ENABLE ROW LEVEL SECURITY;

-- Admin-only access
DROP POLICY IF EXISTS "Admins can view disputes" ON paypal_disputes;
CREATE POLICY "Admins can view disputes"
  ON paypal_disputes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS razorpay_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS razorpay_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS paypal_disputes;
