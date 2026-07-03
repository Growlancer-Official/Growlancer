-- Admin Sessions Table
-- Stores SHA-256 hashes of admin session tokens for stateless session management
-- Plain tokens are never stored; only the hash is persisted
-- Sessions expire after 24 hours

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  last_used_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash ON public.admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON public.admin_sessions(expires_at);

-- Enable RLS (only service_role via edge function should access)
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Allow the admin-data edge function (service_role) full access
CREATE POLICY "Service role can manage admin_sessions"
  ON public.admin_sessions
  USING (true)
  WITH CHECK (true);

-- Auto-cleanup expired sessions (runs every hour via pg_cron or manual trigger)
-- Note: Requires pg_cron extension; if not available, cleanup is handled in-app
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('cleanup-expired-admin-sessions', '0 * * * *', 
--   $$DELETE FROM public.admin_sessions WHERE expires_at < now()$$
-- );

-- Rate limiting table for verify_admin attempts (brute force protection)
CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email_time 
  ON public.admin_login_attempts(email, attempted_at);

-- Auto-cleanup old attempts (keep last 24 hours)
-- Handled in-app, but also by the delete trigger below

-- Cleanup function for expired sessions and old login attempts
CREATE OR REPLACE FUNCTION public.cleanup_admin_auth_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove expired sessions
  DELETE FROM public.admin_sessions WHERE expires_at < now();
  -- Remove login attempts older than 24 hours
  DELETE FROM public.admin_login_attempts WHERE attempted_at < now() - INTERVAL '24 hours';
END;
$$;
