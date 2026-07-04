-- Drop auto-confirm trigger and function
-- Enabling real email verification via Supabase Auth SMTP

-- 1. Confirm all existing unverified users so they aren't locked out
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email_confirmed_at IS NULL;

-- 2. Drop the auto-confirm trigger (IF EXISTS for safety)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Drop the auto-confirm function
DROP FUNCTION IF EXISTS public.auto_confirm_email();

-- 4. Refresh schema cache
NOTIFY pgrst, 'reload schema';
