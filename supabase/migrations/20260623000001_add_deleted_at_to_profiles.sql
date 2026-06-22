-- Add deleted_at column to profiles table for soft-delete support
-- This allows filtering out deleted users from all queries (matching, referrals, etc.)

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Create an index on deleted_at for efficient filtering
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles (deleted_at);

-- Create an index on role + deleted_at for common queries
CREATE INDEX IF NOT EXISTS idx_profiles_role_deleted_at ON public.profiles (role, deleted_at);

-- Drop existing function first (parameter name conflict), then recreate with soft-delete
DROP FUNCTION IF EXISTS public.process_account_deletion(UUID);

CREATE OR REPLACE FUNCTION public.process_account_deletion(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_user_id UUID;
BEGIN
  -- Get the user_id from the deletion request
  SELECT user_id INTO v_user_id FROM public.user_deletion_requests WHERE id = p_request_id;
  
  -- Soft-delete the profile
  UPDATE public.profiles
  SET deleted_at = NOW(), updated_at = NOW()
  WHERE id = v_user_id;
  
  v_result := jsonb_build_object(
    'success', true,
    'message', 'Account soft-deleted successfully'
  );
  
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
