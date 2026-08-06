-- ═══════════════════════════════════════════════════════════════════
-- 20260918000000_fix_create_user_profile_orphaned_email_conflict.sql
--
-- 🛡️ Self-healing profile creation for re-signups with previously-deleted emails.
--
-- PROBLEM
-- When a user is deleted (Auth dashboard or hard_delete_user), the auth.users
-- row is removed but an orphaned public.profiles row can remain. If that email
-- is later used to sign up again (e.g. GitHub/LinkedIn OAuth, or a fresh
-- email/password signup), create_user_profile runs:
--
--   INSERT ... ON CONFLICT (id) DO UPDATE ...
--
-- The old orphan row has a DIFFERENT id, so the email unique constraint
-- (profiles_email_unique) fires → ERROR 23505 → profile is never created.
-- The app then has a valid auth session but NO profile → the user is bounced
-- back to the login page ('OAuth login works but returns to login' — the user
-- lands on /?modal=login with an 'Already logged in' banner).
--
-- FIX
-- Before the upsert, delete any profile row that (a) conflicts on the same
-- email, (b) is NOT the caller's own row, and (c) is a TRUE orphan (its
-- auth.users row no longer exists). The fresh INSERT then succeeds and the
-- AFTER INSERT triggers (wallet, notification preferences, subscription)
-- recreate the supporting rows for the new account.
--
-- If a conflicting orphan still carries NO-ACTION FK rows (disputes, contests
-- winner, etc.) the DELETE raises and the RPC fails as before — the common
-- re-signup case (a deleted test/garbage account) now self-heals.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_user_profile(p_id uuid, p_email text, p_name text, p_role text, p_referral_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_role text;
  v_safe_ref_code text;
BEGIN
  -- Validate role
  IF p_role NOT IN ('freelancer', 'client') THEN
    v_role := 'freelancer';
  ELSE
    v_role := p_role;
  END IF;

  -- 🆕 Orphaned-email cleanup: a profile whose auth.users row was deleted is
  -- garbage; it must not block a legitimate re-signup of the same email.
  DELETE FROM public.profiles
   WHERE email = p_email
     AND id <> p_id
     AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = public.profiles.id);

  -- Ensure unique referral code: if p_referral_code is provided, try it;
  -- otherwise or if collision detected, generate from user ID hash
  IF p_referral_code IS NOT NULL AND p_referral_code != '' THEN
    -- Check if the provided referral code already exists
    IF EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = p_referral_code) THEN
      -- Collision! Append a short hash of the user ID to make it unique
      v_safe_ref_code := p_referral_code || '-' || SUBSTRING(MD5(p_id::text) FROM 1 FOR 4);
    ELSE
      v_safe_ref_code := p_referral_code;
    END IF;
  ELSE
    -- No referral code provided, generate one from user ID
    v_safe_ref_code := UPPER(v_role || '-' || SUBSTRING(MD5(p_id::text) FROM 1 FOR 6));
  END IF;

  -- Upsert the profile (bypasses RLS because SECURITY DEFINER)
  INSERT INTO public.profiles (
    id, email, name, role, referral_code,
    is_pro, onboarding_completed, created_at
  )
  VALUES (
    p_id, p_email, p_name, v_role, v_safe_ref_code,
    false, false, NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    referral_code = CASE WHEN EXCLUDED.referral_code IS NOT NULL THEN EXCLUDED.referral_code ELSE profiles.referral_code END
  RETURNING jsonb_build_object(
    'id', id,
    'email', email,
    'name', name,
    'role', role,
    'referral_code', referral_code,
    'is_pro', is_pro,
    'onboarding_completed', onboarding_completed,
    'created_at', created_at
  ) INTO result;
  RETURN result;
END;
$function$;
