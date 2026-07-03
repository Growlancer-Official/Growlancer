-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Country gate + Phone validation for India-only launch
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add country column to profiles (for OAuth country gate) ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text DEFAULT NULL;

COMMENT ON COLUMN public.profiles.country IS 'User country (e.g. "IN" for India). Used for OAuth country gating.';

-- ── 2. Add phone column to profiles if not exists ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text DEFAULT NULL;

COMMENT ON COLUMN public.profiles.phone IS 'User phone number including country code (e.g. +919876543210). Server-side validated to start with +91 for India launch.';

-- ── 3. Server-side +91 phone validation trigger ──
-- This enforces that any phone number stored must start with +91 (India).
CREATE OR REPLACE FUNCTION public.validate_india_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only validate if phone is provided (not null/empty)
  IF NEW.phone IS NOT NULL AND NEW.phone <> '' THEN
    -- Must start with +91 (India country code)
    IF NEW.phone !~ '^\+91[0-9]{10}$' THEN
      RAISE EXCEPTION 'Phone number must start with +91 followed by a 10-digit Indian mobile number'
        USING HINT = 'Format: +919XXXXXXXXX';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_india_phone ON public.profiles;
CREATE TRIGGER trg_validate_india_phone
  BEFORE INSERT OR UPDATE OF phone
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_india_phone();

-- ── 4. RPC: Insert into waitlist ──
CREATE OR REPLACE FUNCTION public.join_waitlist(
  p_email text,
  p_country text,
  p_signup_source text DEFAULT 'oauth',
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id bigint;
  v_result jsonb;
BEGIN
  -- Check if already on waitlist
  SELECT id INTO v_existing_id
  FROM public.waitlist
  WHERE email = p_email
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing entry
    UPDATE public.waitlist
    SET 
      country = COALESCE(p_country, country),
      signup_source = COALESCE(p_signup_source, signup_source),
      user_id = COALESCE(p_user_id, user_id),
      updated_at = now()
    WHERE id = v_existing_id
    RETURNING jsonb_build_object(
      'success', true,
      'waitlist_id', id,
      'already_exists', true
    ) INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Update failed'));
  END IF;

  -- Insert new waitlist entry
  INSERT INTO public.waitlist (email, country, signup_source, user_id)
  VALUES (p_email, p_country, p_signup_source, p_user_id)
  RETURNING jsonb_build_object(
    'success', true,
    'waitlist_id', id,
    'already_exists', false
  ) INTO v_result;

  RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Insert failed'));
END;
$$;

-- ── 5. RPC: Update user country ──
CREATE OR REPLACE FUNCTION public.update_user_country(
  p_user_id uuid,
  p_country text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET country = p_country,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 6. RLS on waitlist table (re-apply in case it was missed) ──
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Only admins can view waitlist entries
DROP POLICY IF EXISTS "Admins can view waitlist" ON public.waitlist;
CREATE POLICY "Admins can view waitlist"
  ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- Anyone can insert into waitlist (anon RPC calls via SECURITY DEFINER)
DROP POLICY IF EXISTS "Allow insert for join_waitlist RPC" ON public.waitlist;
CREATE POLICY "Allow insert for join_waitlist RPC"
  ON public.waitlist
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- ── 7. RLS on profiles country/phone columns ──
-- Users can update their own country and phone
DROP POLICY IF EXISTS "Users can update own country and phone" ON public.profiles;
CREATE POLICY "Users can update own country and phone"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
