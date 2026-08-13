-- ────────────────────────────────────────────────────────────────────────────
-- Contest submission file uploads
--
-- Private bucket so files are only reachable via signed URLs. Contest
-- entries are public (community voting model), so anyone (anon or
-- authenticated) may READ, but only authenticated users may UPLOAD.
-- Storage RLS does not cover signed URL access (service_role signs), so
-- uploads are safely gated to authenticated users.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contest-submissions', 'contest-submissions', false, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

-- Upload: any authenticated user (they must also be able to insert a
-- contest_submissions row — that insert is still gated by its own RLS).
CREATE POLICY "Authenticated users can upload contest submissions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contest-submissions');

-- Read: public (contest entries are public; files are served via signed URL)
CREATE POLICY "Anyone can read contest submissions"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'contest-submissions');

-- Update/delete: owner only (path is {contestId}/{userId}/...)
CREATE POLICY "Owners can update contest submission files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'contest-submissions' AND (storage.foldername(name))[2] = auth.uid()::text)
  WITH CHECK (bucket_id = 'contest-submissions' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY "Owners can delete contest submission files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contest-submissions' AND (storage.foldername(name))[2] = auth.uid()::text);
