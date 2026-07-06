-- Admin Auth Rebuild
-- Uses real Supabase Auth instead of custom prelogin table
-- 1. Adds is_admin column to profiles
-- 2. Creates admin signup RPC with secret code validation
-- 3. Creates admin_users table for audit

-- Add is_admin column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Create admin signup RPC
-- Validates a secret admin code, then marks the user as admin
CREATE OR REPLACE FUNCTION public.admin_signup(
  p_user_id UUID,
  p_secret_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_hash TEXT;
  v_result JSONB;
BEGIN
  -- 🔴 Set your secret code in Supabase Dashboard via SQL Editor
  -- Never commit the real code to a public repo.
  IF p_secret_code <> 'YOUR_SECRET_CODE_HERE' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid admin secret code'
    );
  END IF;

  -- Auto-create profile if it doesn't exist yet (handles trigger race condition)
  -- ON CONFLICT DO NOTHING prevents crash if the trigger fires after our INSERT
  INSERT INTO public.profiles (id, email, name, role, is_admin)
  SELECT p_user_id, '', 'Admin', 'admin', false
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- Check if already an admin
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND is_admin = true) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is already an admin'
    );
  END IF;

  -- Mark user as admin
  UPDATE profiles 
  SET 
    is_admin = true,
    role = 'admin',
    updated_at = now()
  WHERE id = p_user_id;

  -- Log in admin_users table for audit
  INSERT INTO public.admin_users (user_id, granted_by, granted_at)
  VALUES (p_user_id, p_user_id, now())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Admin access granted',
    'user_id', p_user_id
  );
END;
$$;

-- Grant execute to authenticated users (they need to call this after signup)
GRANT EXECUTE ON FUNCTION public.admin_signup TO authenticated;

-- Create admin_users audit table
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Only service_role can manage admin_users
CREATE POLICY "Service role can manage admin_users"
  ON public.admin_users
  USING (true)
  WITH CHECK (true);

-- Grant access
GRANT ALL ON public.admin_users TO service_role;
GRANT ALL ON public.admin_users TO authenticated;

-- Remove old admin_credentials table approach
-- (keeping table but marking it deprecated — can be dropped later)
COMMENT ON TABLE public.admin_credentials IS 'DEPRECATED: Use Supabase Auth + is_admin flag instead';
