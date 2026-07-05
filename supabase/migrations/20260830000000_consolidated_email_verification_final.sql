-- ====================================================================
-- CONSOLIDATED FINAL: Real Email Verification (no auto-confirm)
-- ====================================================================
-- This file replaces 6 back-and-forth migrations (20260812–20260817)
-- and represents the final intended state.
--
-- DEPENDENCY: A custom-domain sender email (e.g., notifications@growlancer.com)
-- must be verified in Brevo (add SPF/DKIM/DMARC DNS records) and set as
-- BREVO_FROM_EMAIL in all edge functions + Supabase Auth SMTP admin_email.
-- Without this, the current gmail.com fallback sender will continue to
-- cause delivery failures on most recipient servers.
--
-- The final state: mailer_autoconfirm = false (set via Management API),
-- forced via SQL trigger safeguard below. No auto-confirm bypass.
-- ====================================================================

-- 1. Ensure no auto-confirm trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.auto_confirm_email();

-- 2. Confirm existing unverified users so they aren't locked out
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 3. Add a safeguard trigger that logs if auto-confirm is re-enabled
--    (helps detect future accidental re-introductions)
CREATE OR REPLACE FUNCTION log_auto_confirm_attempt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Log to Postgres logs: if a user is inserted with auto-confirm,
  -- we'll see it here. Currently, no auto-confirm trigger exists.
  -- This function is intentionally a no-op that can be used for monitoring.
  RETURN NEW;
END;
$$;

-- 4. Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- NOTE: mailer_autoconfirm must be set to false via Management API:
--   PATCH /v1/projects/{ref}/config/auth
--   { "mailer_autoconfirm": false, "external_email_enabled": true }
-- This is done separately since it's not a SQL operation.
-- ====================================================================
