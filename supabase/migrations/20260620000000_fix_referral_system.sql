-- ============================================================================
-- Fix Referral System
-- 1. Creates process_referral RPC for handling referral workflow
-- 2. Cleans up orphaned referral_stats for deleted users
-- 3. Adds proper RLS policies for referral tables
-- ============================================================================

-- ==================== CLEANUP ORPHANED REFERRAL DATA ====================

-- Remove referral_stats entries for users whose profiles no longer exist
DELETE FROM public.referral_stats rs
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = rs.user_id
);

-- Remove referrals where referrer profile no longer exists
DELETE FROM public.referrals r
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.referrer_id);

-- ==================== PROCESS REFERRAL RPC ====================

-- Process a referral when a new user signs up with a referral code
--  1. Looks up the referrer by referral_code
--  2. Creates a referrals row with referred_user_id and referred_email
--  3. Updates referral_stats for the referrer
--  4. Returns success status
CREATE OR REPLACE FUNCTION public.process_referral(
  p_referral_code TEXT,
  p_new_user_id UUID,
  p_new_user_email TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  -- Validate inputs
  IF p_referral_code IS NULL OR p_referral_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No referral code provided');
  END IF;

  IF p_new_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No user ID provided');
  END IF;

  -- Find the referrer (user who owns this referral code)
  SELECT id INTO v_referrer_id
  FROM public.profiles
  WHERE referral_code = p_referral_code
    AND id != p_new_user_id  -- prevent self-referral
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
  END IF;

  -- Check for duplicate referral (same referee already referred)
  IF EXISTS (
    SELECT 1 FROM public.referrals
    WHERE referrer_id = v_referrer_id AND referred_user_id = p_new_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already referred');
  END IF;

  -- Create the referral record
  INSERT INTO public.referrals (referrer_id, referred_user_id, referred_email, referral_code, status, bonus_claimed)
  VALUES (v_referrer_id, p_new_user_id, p_new_user_email, p_referral_code, 'pending', false);

  -- Create or update referral_stats for the referrer
  INSERT INTO public.referral_stats (user_id, total_referrals, valid_referrals, points, level, updated_at)
  VALUES (v_referrer_id, 1, 0, 0, 1, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    total_referrals = COALESCE(referral_stats.total_referrals, 0) + 1,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id
  );
END;
$$;

-- ==================== COMPLETE REFERRAL RPC ====================

-- Mark a referral as "completed" when the referred user completes their first meaningful action
CREATE OR REPLACE FUNCTION public.complete_referral(
  p_referee_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  -- Find the referrer for this referee
  SELECT referrer_id INTO v_referrer_id
  FROM public.referrals
  WHERE referred_user_id = p_referee_user_id AND status = 'pending'
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No pending referral found');
  END IF;

  -- Update referral status
  UPDATE public.referrals
  SET status = 'completed', bonus_claimed = true
  WHERE referred_user_id = p_referee_user_id AND status = 'pending';

  -- Update referral_stats
  UPDATE public.referral_stats
  SET
    valid_referrals = COALESCE(valid_referrals, 0) + 1,
    points = COALESCE(points, 0) + 10,
    updated_at = NOW()
  WHERE user_id = v_referrer_id;

  RETURN jsonb_build_object('success', true, 'referrer_id', v_referrer_id);
END;
$$;

-- ==================== RLS POLICY FOR REFERRAL TABLES ====================

-- Allow authenticated users to read all referrals (used for leaderboard building)
DROP POLICY IF EXISTS "Authenticated users can read referrals" ON public.referrals;
CREATE POLICY "Authenticated users can read referrals" ON public.referrals
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert into referrals (for referral processing)
DROP POLICY IF EXISTS "Users can insert referrals" ON public.referrals;
CREATE POLICY "Users can insert referrals" ON public.referrals
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update referrals (for status updates)
DROP POLICY IF EXISTS "Users can update referrals" ON public.referrals;
CREATE POLICY "Users can update referrals" ON public.referrals
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read referral_stats (for leaderboard)
DROP POLICY IF EXISTS "Authenticated users can read referral_stats" ON public.referral_stats;
CREATE POLICY "Authenticated users can read referral_stats" ON public.referral_stats
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert into referral_stats (for initial creation by RPC)
DROP POLICY IF EXISTS "Users can insert referral_stats" ON public.referral_stats;
CREATE POLICY "Users can insert referral_stats" ON public.referral_stats
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update referral_stats (for increment by RPC)
DROP POLICY IF EXISTS "Users can update referral_stats" ON public.referral_stats;
CREATE POLICY "Users can update referral_stats" ON public.referral_stats
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ==================== INDEXES ====================

-- Add index for looking up referrer by referral_code (speeds up process_referral)
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code)
  WHERE referral_code IS NOT NULL;

-- Add index for looking up referrals by referred_user_id (speeds up complete_referral)
CREATE INDEX IF NOT EXISTS idx_referrals_referred_user_id ON public.referrals(referred_user_id);
