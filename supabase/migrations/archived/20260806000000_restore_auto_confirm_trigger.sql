-- ====================================================================
-- RESTORE AUTO-CONFIRM TRIGGER FOR AUTH USERS
-- ====================================================================
-- This migration reverses the previous migration
-- (20260726000000_disable_auto_confirm_enable_brevo) by restoring
-- the auto_confirm_email trigger that was dropped.
--
-- WHY: The previous migration dropped this trigger expecting Brevo SMTP
-- to handle email verification. However, if Brevo SMTP is not properly
-- configured in the Supabase Dashboard (Authentication → Email → SMTP),
-- no verification emails are sent and users cannot sign in.
--
-- This trigger auto-confirms email on user creation, making signup
-- work immediately without requiring email verification. Welcome
-- emails are still sent via Brevo asynchronously (fire-and-forget).
--
-- INDUSTRY-STANDARD APPROACH: For production, configure Brevo SMTP
-- in Supabase Dashboard → Authentication → Email → SMTP with:
--   Host: smtp-relay.brevo.com
--   Port: 587
--   Username: <Brevo SMTP login>
--   Password: <Brevo SMTP key>
-- Then set enable_confirmations = true in Dashboard and this trigger
-- will no longer be needed (users will verify via email link).
-- ====================================================================

-- Recreate the auto_confirm_email function
CREATE OR REPLACE FUNCTION public.auto_confirm_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      updated_at = NOW()
  WHERE id = NEW.id
    AND email_confirmed_at IS NULL;
  RETURN NEW;
END;
$$;

-- Recreate the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_email();

-- Confirm any existing unverified users (fixes already-created-but-unverified accounts)
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
