-- Newsletter Subscribers Table
-- Stores email newsletter subscriptions with Brevo contact sync

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT DEFAULT 'website',   -- 'website', 'signup', 'admin_added'
  brevo_contact_id TEXT,            -- Brevo contact ID for sync
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  unsubscribed_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for lookups (idempotent — table/index may already exist from a manual patch)
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_subscribed ON newsletter_subscribers(subscribed_at) WHERE unsubscribed_at IS NULL;

-- RLS: only admins can see all, users can subscribe themselves
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (subscribe)
DROP POLICY IF EXISTS "Anyone can subscribe to newsletter" ON newsletter_subscribers;
CREATE POLICY "Anyone can subscribe to newsletter"
  ON newsletter_subscribers
  FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can view their own subscription
DROP POLICY IF EXISTS "Users can view own subscription" ON newsletter_subscribers;
CREATE POLICY "Users can view own subscription"
  ON newsletter_subscribers
  FOR SELECT
  USING (auth.role() = 'authenticated' AND auth.email() = email);

-- Admins can view all
DROP POLICY IF EXISTS "Admins can manage all subscribers" ON newsletter_subscribers;
CREATE POLICY "Admins can manage all subscribers"
  ON newsletter_subscribers
  FOR ALL
  USING (auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_newsletter_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_newsletter_updated_at ON newsletter_subscribers;
CREATE TRIGGER trg_newsletter_updated_at
  BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION update_newsletter_updated_at();
