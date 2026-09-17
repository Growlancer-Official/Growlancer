-- ====================================================================
-- FIX: create_user_profile RPC — search_path = 'public'
-- ====================================================================
-- The previous version SET search_path = '' which caused the
-- trigger_ensure_wallet_on_signup trigger to fail because it inherited
-- the empty search_path and couldn't find the wallets table.
--
-- Fix: Use search_path = 'public' which is still restricted enough
-- for security but allows the trigger to find the wallets table.
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
SET search_path = 'public'
AS $$
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
$$;
-- Also fix the ensure_wallet_for_user trigger to use fully qualified table name
-- so it works regardless of the calling function's search_path
CREATE OR REPLACE FUNCTION public.ensure_wallet_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.wallets (user_id, balance, pending_balance, currency)
  VALUES (NEW.id, 0.00, 0.00, 'USD')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
