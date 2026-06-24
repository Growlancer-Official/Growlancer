-- ====================================================================
-- DISABLE AUTO-CONFIRM TRIGGER & ENABLE BREVO SMTP VERIFICATION
-- ====================================================================
-- This migration:
--   1. Confirms all EXISTING unverified users (so they can still log in)
--   2. Drops the auto-confirm trigger (so Brevo SMTP can send verification emails)
--   3. Ensures new signups require email verification via Brevo
-- ====================================================================

-- 1. Confirm all existing unverified users (grace period for current users)
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 2. Drop the auto-confirm trigger (so Brevo SMTP handles verification)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS auto_confirm_email;

-- 3. Ensure SITE_URL is set for proper email redirect links
-- NOTE: Also add these URLs in Supabase Dashboard → Authentication → Settings:
--   - Redirect URLs: https://growlancer.vercel.app/auth/callback, https://growlancer.vercel.app/login

-- 4. Refresh schema cache
NOTIFY pgrst, 'reload schema';
