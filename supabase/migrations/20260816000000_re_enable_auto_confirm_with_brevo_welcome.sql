-- ====================================================================
-- RE-ENABLE AUTO-CONFIRM TRIGGER (Final)
-- ====================================================================
-- Supabase Auth SMTP is not working despite correct configuration.
-- Using auto-confirm + real Brevo welcome email instead.
-- Auto-confirm trigger handles auth, Brevo sends real welcome emails.
-- ====================================================================

-- 1. Confirm all existing unverified users
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 2. Re-create the auto-confirm trigger
CREATE OR REPLACE FUNCTION auto_confirm_email()
RETURNS TRIGGER
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auto_confirm_email();

-- 3. Refresh schema cache
NOTIFY pgrst, 'reload schema';
