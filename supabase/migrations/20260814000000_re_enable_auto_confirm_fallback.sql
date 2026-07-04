-- ====================================================================
-- RE-ENABLE AUTO-CONFIRM TRIGGER (Fallback)
-- ====================================================================
-- Brevo SMTP is correctly configured (sender verified, relay enabled,
-- API key valid, credits available) but Supabase Auth is still unable
-- to send confirmation emails. This is likely a Supabase-side issue
-- with SMTP password persistence or configuration.
--
-- Re-enabling auto-confirm so testing can proceed. The frontend
-- "Verify Email" UI will still display properly, but users will be
-- auto-confirmed behind the scenes.
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
