-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER RPCs to sync profiles_private columns
-- without triggering the validate_india_phone trigger on unrelated UPDATEs.
-- ═══════════════════════════════════════════════════════════════════════════

-- Sync email in profiles_private (used by AuthCallbackPage on email_change)
CREATE OR REPLACE FUNCTION public.sync_private_email(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles_private
  SET email = p_email, updated_at = now()
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_private_email(TEXT) TO authenticated;

-- Sync referral_code in profiles_private (used by createUserProfile fallback)
CREATE OR REPLACE FUNCTION public.sync_private_referral(p_referral_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles_private
  SET referral_code = p_referral_code, updated_at = now()
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_private_referral(TEXT) TO authenticated;
