-- ====================================================================
-- REMOVE AUTO-CONFIRM TRIGGER — SMTP now properly configured via API
-- ====================================================================
-- SMTP settings were successfully set via Supabase Management API.
-- Reverting auto-confirm so real email verification is enforced.
-- ====================================================================

-- 1. Confirm all existing unverified users
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 2. Drop the auto-confirm trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS auto_confirm_email;

-- 3. Refresh schema cache
NOTIFY pgrst, 'reload schema';
