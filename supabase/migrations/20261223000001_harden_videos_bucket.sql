-- ============================================================================
-- SECURITY HARDENING v7b — videos storage bucket (live-DB drift found in audit)
--
-- The `videos` bucket existed in the live DB WITHOUT any migration (created
-- ad-hoc in the dashboard). State found:
--   • public = true  → any file URL was publicly readable
--   • INSERT "Authenticated can upload videos"  → any authenticated user
--   • UPDATE "Authenticated can update videos"  → bucket only, ANY file
--   • DELETE "Authenticated can delete videos"  → bucket only, ANY file
--   • SELECT "Videos access"                    → owner folder or contract
--     participants (already scoped)
--
-- Any authenticated user could overwrite/delete ANY video (including contract
-- deliverables) and host arbitrary files on a public bucket. Fix:
--   1. bucket → private (signed URLs only, consistent with every other bucket)
--   2. INSERT/UPDATE/DELETE → scoped to the same rule SELECT uses:
--      own folder ({uid}/...) OR contract participant ({contractId}/...)
-- ============================================================================

-- 1) Private bucket (signed URLs only)
UPDATE storage.buckets
SET public = false
WHERE id = 'videos';

-- 2) Drop the open write policies
DROP POLICY IF EXISTS "Authenticated can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete videos" ON storage.objects;

-- 3) Ownership-scoped upload/update/delete (mirrors "Videos access" SELECT)
CREATE POLICY "Owners can upload videos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'videos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
      )
    )
  );

CREATE POLICY "Owners can update videos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'videos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
      )
    )
  )
  WITH CHECK (
    bucket_id = 'videos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
      )
    )
  );

CREATE POLICY "Owners can delete videos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'videos' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.contracts c
        WHERE c.id::text = (storage.foldername(name))[1]
          AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
      )
    )
  );
