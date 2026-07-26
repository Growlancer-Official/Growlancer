-- ═══════════════════════════════════════════════════════════════════
-- RE-ENABLE AUTO-CONFIRM EMAIL TRIGGER
-- ═══════════════════════════════════════════════════════════════════
-- The previous migration (20260726000000) dropped the auto-confirm
-- trigger to enable Brevo SMTP verification. However, Brevo SMTP is
-- not yet configured in the Supabase Auth settings, so confirmation
-- emails are never sent and users cannot log in.
--
-- This migration re-creates the auto_confirm_email() function and
-- trigger so that users can sign up and use the site immediately.
-- Welcome emails via Brevo API will still be sent for onboarding.
--
-- When Brevo SMTP is properly configured in the Supabase Dashboard,
-- this trigger can be dropped again for real email verification.
-- ═══════════════════════════════════════════════════════════════════

SET search_path = '';

-- 1. Confirm all existing unverified users
UPDATE auth.users
SET
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 2. Re-create the auto-confirm function (safe: OR REPLACE)
CREATE OR REPLACE FUNCTION public.auto_confirm_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Auto-confirm the email for new signups
  UPDATE auth.users
  SET
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = NEW.id
    AND email_confirmed_at IS NULL;

  RETURN NEW;
END;
$$;

-- 3. Re-create the trigger (safe: DROP IF EXISTS first)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_email();

-- 4. Refresh schema cache
NOTIFY pgrst, 'reload schema';
