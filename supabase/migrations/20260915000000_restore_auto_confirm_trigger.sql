-- ====================================================================
-- RESTORE AUTO-CONFIRM TRIGGER FOR AUTH USERS (idempotent)
-- ====================================================================
-- WHY: SMTP is NOT configured in the Supabase Dashboard, so Supabase
-- Auth cannot deliver confirmation emails. Without this trigger every
-- email signup fails with "Error sending confirmation email" (500),
-- users get stuck on the homepage, and login never works.
--
-- This trigger auto-confirms email on user creation so signup + login
-- work immediately. The Brevo-powered welcome email (edge function
-- admin-data → send_welcome_email) still arrives via the Brevo API
-- (BREVO_API_KEY), which does not depend on Supabase SMTP.
--
-- PRODUCTION UPGRADE PATH: Once Brevo SMTP is configured in the
-- Supabase Dashboard (Auth → Email → SMTP), set Confirm email = ON in
-- the Dashboard and re-drop this trigger (users will verify via link).
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
