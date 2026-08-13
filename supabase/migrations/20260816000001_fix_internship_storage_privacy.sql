-- ============================================================
-- SECURITY HARDENING v6b — internship storage privacy
--
-- internship_resumes (public bucket + "Anyone can read" policy)
--   → ANYONE (even unauthenticated anon) could list/read every
--     applicant's resume: full name, phone, address, education.
-- internship_documents (public bucket) → offer letters / NDAs
--   were served via public URLs with no read policy.
--
-- Fix: both buckets private + admin-only read via signed URLs.
-- Upload stays open (anon application flow uploads the resume
-- client-side with the anon key), delete stays admin-only.
-- ============================================================

-- 1) Buckets become private (public object URLs stop working)
UPDATE storage.buckets SET public = false
WHERE id IN ('internship_resumes', 'internship_documents');

-- 2) Drop the anon read-all-resumes policy
DROP POLICY IF EXISTS "Anyone can read internship resumes" ON storage.objects;

-- 3) Admin-only read for internship resumes (signed-URL generation)
CREATE POLICY "Admins can read internship resumes" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'internship_resumes'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 4) Admin-only read for internship documents (offer letter / NDA / internship letter)
CREATE POLICY "Admins can read internship documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'internship_documents'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
