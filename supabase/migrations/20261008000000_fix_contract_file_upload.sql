-- ============================================================
-- Fix contract file uploads (workspace deliverables)
-- ============================================================
-- The file-upload edge function previously pointed at a 'deliverables'
-- bucket that has never existed in production -> every workspace upload
-- failed with "Bucket not found". This migration:
--   1. Aligns the existing 'contract-files' bucket with the edge function
--      (25MB limit + the exact allowed mime types).
--   2. Adds storage INSERT + DELETE policies scoped to contract
--      participants (files live under <contract_id>/...).
--   3. Ensures contract_files stays in the supabase_realtime publication
--      so file lists update live for both client and freelancer.

-- ---------- 1. Bucket config (idempotent upsert) ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contract-files',
  'contract-files',
  true,
  26214400, -- 25MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------- 2. storage.objects policies ----------
-- Remove legacy wide-open policies (any authenticated user could insert/delete
-- arbitrary objects in the bucket). The contract-scoped policies below fully
-- replace them, so we drop the wide ones for defense in depth.
DROP POLICY IF EXISTS "Users can upload contract files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete contract files" ON storage.objects;
-- No flow ever updates storage objects in this bucket (the edge function only
-- uploads, reads and removes), so drop the wide-open UPDATE policy too.
DROP POLICY IF EXISTS "Users can update contract files" ON storage.objects;

-- INSERT: only the client or freelancer of the contract can upload
-- (file path always starts with the contract id: <contract_id>/...)
DROP POLICY IF EXISTS "Contract participants can upload files" ON storage.objects;
CREATE POLICY "Contract participants can upload files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contract-files'
  AND EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
  )
);

-- DELETE: same contract-participant scoping (the edge function additionally
-- restricts deletion to the original uploader as defense in depth)
DROP POLICY IF EXISTS "Contract participants can delete contract files" ON storage.objects;
CREATE POLICY "Contract participants can delete contract files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'contract-files'
  AND EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND (c.client_id = auth.uid() OR c.freelancer_id = auth.uid())
  )
);

-- ---------- 3. Realtime (idempotent) ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contract_files'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contract_files;
  END IF;
END $$;
