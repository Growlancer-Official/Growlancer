-- ====================================================================
-- REMOVE AUTO-CONFIRM TRIGGER — Brevo SMTP is now working
-- ====================================================================
-- Previously added auto-confirm as a workaround. Now that the Brevo SMTP
-- key has been renewed and verified working, we remove the trigger so
-- that real email verification is enforced.
-- ====================================================================

-- 1. Confirm all existing unverified users (so current users don't get locked out)
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 2. Drop the auto-confirm trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS auto_confirm_email;

-- 3. Refresh schema cache
NOTIFY pgrst, 'reload schema';
