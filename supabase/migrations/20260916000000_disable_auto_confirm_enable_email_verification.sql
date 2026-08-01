-- =============================================================================
-- 20260916000000_disable_auto_confirm_enable_email_verification.sql
-- =============================================================================
-- Purpose: Disable the auto-confirm email trigger so Supabase Auth's REAL
--          email verification flow works (user must click the confirmation link).
--
-- IMPORTANT: This migration must ONLY be applied AFTER email delivery is
--            confirmed working in the Supabase Dashboard:
--              • Auth → Email → Confirm email = ON
--              • Custom SMTP cleared (Supabase built-in sender) OR working SMTP
--            If email sending is broken, signup will fail with
--            "Error sending confirmation email" (HTTP 500).
--
-- This migration is the opposite of 20260915000000_restore_auto_confirm_trigger.
-- Keep the trigger in place (i.e. do NOT run this) while email delivery is
-- failing so signup/login keep working seamlessly.
-- =============================================================================

-- 1) Drop the trigger on auth.users (removes auto-confirmation behavior)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2) Drop the helper function(s) created by the restore migration
DROP FUNCTION IF EXISTS public.auto_confirm_email();
DROP FUNCTION IF EXISTS auto_confirm_email();

-- NOTE: Any existing unverified users stay unverified and can re-confirm
-- via a fresh verification email (Resend from the VerifyEmailPage).
