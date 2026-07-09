-- Admin Auth Rebuild
-- Uses real Supabase Auth instead of custom prelogin table
-- 1. Adds is_admin column to profiles
-- 2. Creates grant_admin_role RPC (no secret code — code validation happens in edge function)
-- 3. Creates admin_users table for audit
--
-- 🔴 SECURITY: The admin_signup secret code is NOT stored in this migration.
--    It's set as an Edge Function environment variable: ADMIN_SIGNUP_SECRET
--    in the Supabase project dashboard. The admin-signup edge function
--    reads it via Deno.env.get() and calls grant_admin_role() after verification.

-- Add is_admin column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- grant_admin_role: Called ONLY by the admin-signup edge function
-- (using service_role key). No secret code check here — that
-- happens in the edge function via Deno.env.get('ADMIN_SIGNUP_SECRET').
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_admin_role(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Auto-create profile if it doesn't exist yet (handles trigger race condition)
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

-- Only service_role (edge function) should call grant_admin_role
GRANT EXECUTE ON FUNCTION public.grant_admin_role TO service_role;
REVOKE EXECUTE ON FUNCTION public.grant_admin_role FROM authenticated, anon;

-- Drop the old admin_signup RPC (had hardcoded secret code — vulnerable)
DROP FUNCTION IF EXISTS public.admin_signup(UUID, TEXT);

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
