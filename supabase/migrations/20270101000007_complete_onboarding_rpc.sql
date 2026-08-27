-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Onboarding completion silently fails
--
-- Problem:
--   The frontend does:
--     supabase.from('profiles_private').update({ onboarding_completed: true })
--   This fails silently because:
--   1. profiles_private has a validate_india_phone trigger that fires on
--      EVERY UPDATE — even when only changing onboarding_completed. If the
--      user's phone field has any value that doesn't match strict Indian
--      10-digit format, the UPDATE is rejected.
--   2. Even with valid RLS policies, the trigger rejection is swallowed by
--      the frontend error handling.
--
--   Result: onboarding_completed stays false → ProtectedRoute redirects
--   user back to /onboarding in an infinite loop.
--
-- Fix:
--   Create complete_onboarding() SECURITY DEFINER RPC that:
--   - Verifies the caller owns the profile
--   - Sets onboarding_completed = true
--   - Uses set_config bypass so BEFORE UPDATE triggers allow it
--   - Bypasses the phone validation trigger (runs as function owner)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Bypass BEFORE UPDATE trigger (protect_profiles_privilege_columns)
  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  UPDATE public.profiles_private
  SET onboarding_completed = true, updated_at = now()
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Allow authenticated users to call this
GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;
