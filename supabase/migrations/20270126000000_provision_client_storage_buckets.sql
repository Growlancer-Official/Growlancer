-- ============================================================================
-- MR-26 (finding STORAGE-001) — Provision client-upload buckets via migration only
--
-- The browser helpers previously called supabase.storage.createBucket(...) with
-- public: true whenever they observed a "Bucket not found" error:
--   * src/lib/avatarUpload.ts  (createBucket for 'avatars')
--   * src/lib/avatarPack.ts    (inline createBucket for 'company-logos')
-- A client-held session must never be able to create/mutate storage buckets —
-- that is an unintended, attacker-influenced storage-configuration surface.
-- Bucket provisioning belongs in migrations only; the client code no longer
-- creates buckets (see the accompanying source change in this batch).
--
-- This migration re-asserts the two buckets those helpers use, idempotently, so
-- any environment provisioned without them is repaired, and re-asserts the
-- uid-scoped INSERT policies that the (now session-derived) paths rely on.
--
-- Canonical bucket definitions (for reference, unchanged):
--   avatars        — 20260722000000_create_storage_buckets.sql
--   company-logos  — 20260919010000_create_company_logos_bucket.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. avatars bucket (idempotent)
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2. company-logos bucket (idempotent)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  2097152, -- 2MB (matches the client-side logo size limit)
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp']::text[];

-- ----------------------------------------------------------------------------
-- 3. Re-assert uid-scoped INSERT policies (idempotent)
--    Writes are scoped to the first path segment = auth.uid(); MR-27 makes the
--    client build the path from the session id so this policy is always met.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
CREATE POLICY "Users can upload their own avatars" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload their own company logos" ON storage.objects;
CREATE POLICY "Users can upload their own company logos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- LIVE-DB VERIFICATION REQUIRED
-- ============================================================================
--
-- V1 — both buckets exist with the intended public flag and limits:
--   SELECT id, public, file_size_limit
--   FROM storage.buckets WHERE id IN ('avatars', 'company-logos');
--   -- EXPECT: avatars | t | 5242880
--   --         company-logos | t | 2097152
--
-- V2 — uid-scoped INSERT policies are present:
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname IN ('Users can upload their own avatars',
--                        'Users can upload their own company logos');
--   -- EXPECT: 2 rows, both cmd = INSERT
--
-- V3 — after deploying the client change, no browser bucket creation remains:
--   (run in the repo) search_files for "createBucket" under src/ → EXPECT 0
-- ============================================================================
