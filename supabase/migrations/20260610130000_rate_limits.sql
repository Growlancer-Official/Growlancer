-- Rate Limits Table Migration
-- Run this in Supabase SQL Editor
--
-- Provides persistent rate limiting for edge functions.
-- Replaces in-memory Map-based rate limiting that resets on cold start.
-- Edge functions use upsert to track request counts per identifier+route.

CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,          -- IP address or user ID
  route TEXT NOT NULL,               -- e.g., 'withdrawal', 'paypal', '2fa-management'
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identifier, route, window_start)
);

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON rate_limits(identifier, route, window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup
  ON rate_limits(window_start);

-- ==================== CLEANUP FUNCTION ====================

-- Deletes expired rate limit records older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '24 hours';
END;
$$;

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only the edge functions (service_role) need access; anon users should not
-- query this table directly. Default deny-all policy is sufficient.
-- Service role bypasses RLS, so no explicit policies are needed for edge functions.

-- ==================== SCHEDULED CLEANUP (optional) ====================
-- To enable automatic cleanup, uncomment:
-- SELECT cron.schedule('cleanup-rate-limits', '0 3 * * *', 'SELECT cleanup_expired_rate_limits();');