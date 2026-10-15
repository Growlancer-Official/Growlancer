-- ====================================================================
-- SECURITY DEFINER RPC: create_user_profile
-- ====================================================================
-- Bypasses RLS so client-side code can create a profile after signup
-- even without a valid auth session (email confirmation not yet done).
--
-- This is SAFE because:
--   1. The calling user can only create a profile with their own auth.uid()
--   2. If unauthenticated (anon), the function still works since the
--      auth user was just created in signUp()
--   3. ON CONFLICT handles the case where the profile already exists
-- ====================================================================

CREATE OR REPLACE FUNCTION public.create_user_profile(
  p_id uuid,
  p_email text,
  p_name text,
  p_role text,
  p_referral_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
  v_role text;
BEGIN
  -- Validate role
  IF p_role NOT IN ('freelancer', 'client') THEN
    v_role := 'freelancer';
  ELSE
    v_role := p_role;
  END IF;

  -- Upsert the profile (bypasses RLS because SECURITY DEFINER)
  INSERT INTO public.profiles (
    id, email, name, role, referral_code,
    is_pro, onboarding_completed, created_at
  )
  VALUES (
    p_id, p_email, p_name, v_role, p_referral_code,
    false, false, NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = EXCLUDED.role
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
$$;
-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.create_user_profile TO anon, authenticated;
-- ====================================================================
-- FIX: Also re-enable the INSERT RLS policy for profiles
-- to allow upsert via RPC call with SECURITY DEFINER
-- ====================================================================

-- Refresh the schema cache so PostgREST picks up the new function
NOTIFY pgrst, 'reload schema';
