-- Create Storage Buckets for Avatars and Portfolio Images
-- Run this in Supabase SQL Editor
--
-- This migration:
-- 1. Creates the 'avatars' bucket (public, 5MB limit, images only)
-- 2. Creates the 'portfolio-images' bucket (public, 5MB limit, images only)
-- 3. Sets up RLS policies for both buckets
-- 4. Fixes the 'pm.email does not exist' issue by ensuring payout_methods table has email

-- ====================================================================
-- 1. AVATARS BUCKET
-- ====================================================================

-- Insert bucket into storage.buckets (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[];

-- ====================================================================
-- 2. PORTFOLIO-IMAGES BUCKET
-- ====================================================================

-- Insert bucket into storage.buckets (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-images',
  'portfolio-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[];

-- ====================================================================
-- 3. RLS POLICIES FOR AVATARS BUCKET
-- ====================================================================

-- Public read access for avatars
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
CREATE POLICY "Public can view avatars" ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Authenticated users can upload their own avatars
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
CREATE POLICY "Users can upload their own avatars" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own avatars
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own avatars
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ====================================================================
-- 4. RLS POLICIES FOR PORTFOLIO-IMAGES BUCKET
-- ====================================================================

-- Public read access for portfolio images
DROP POLICY IF EXISTS "Public can view portfolio images" ON storage.objects;
CREATE POLICY "Public can view portfolio images" ON storage.objects FOR SELECT
USING (bucket_id = 'portfolio-images');

-- Authenticated users can upload their own portfolio images
DROP POLICY IF EXISTS "Users can upload their own portfolio images" ON storage.objects;
CREATE POLICY "Users can upload their own portfolio images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'portfolio-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own portfolio images
DROP POLICY IF EXISTS "Users can update their own portfolio images" ON storage.objects;
CREATE POLICY "Users can update their own portfolio images" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'portfolio-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own portfolio images
DROP POLICY IF EXISTS "Users can delete their own portfolio images" ON storage.objects;
CREATE POLICY "Users can delete their own portfolio images" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'portfolio-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ====================================================================
-- 5. FIX: Ensure payout_methods has email column for pm.email RPC
-- ====================================================================

-- Check if email column exists on payout_methods, add if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'payout_methods'
    AND column_name = 'email'
  ) THEN
    ALTER TABLE payout_methods ADD COLUMN email TEXT;
    RAISE NOTICE 'Added email column to payout_methods table';
  END IF;
END $$;

-- ====================================================================
-- 6. ENSURE SKILL_CERTIFICATIONS TABLE EXISTS
-- ====================================================================

CREATE TABLE IF NOT EXISTS skill_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  passed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  certificate_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill)
);

-- Ensure RLS is enabled and policies exist
ALTER TABLE skill_certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own certifications" ON skill_certifications;
CREATE POLICY "Users can view own certifications" ON skill_certifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own certifications" ON skill_certifications;
CREATE POLICY "Users can insert own certifications" ON skill_certifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own certifications" ON skill_certifications;
CREATE POLICY "Users can update own certifications" ON skill_certifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Public can view all certifications (for profile display)
DROP POLICY IF EXISTS "Public can view certifications" ON skill_certifications;
CREATE POLICY "Public can view certifications" ON skill_certifications
  FOR SELECT USING (true);
