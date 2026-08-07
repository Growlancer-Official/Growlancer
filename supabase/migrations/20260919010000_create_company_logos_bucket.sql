-- Create company-logos storage bucket (public so logos render everywhere)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  2097152, -- 2MB (matches avatarPack.ts client-side limit)
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated users to upload their own company logo.
-- File path format: {user_id}/company-logo-{timestamp}.{ext} → first folder = user id.
DROP POLICY IF EXISTS "Users can upload their own company logos" ON storage.objects;
CREATE POLICY "Users can upload their own company logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow anyone to view company logos (public bucket)
DROP POLICY IF EXISTS "Anyone can view company logos" ON storage.objects;
CREATE POLICY "Anyone can view company logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'company-logos');

-- Policy: Allow users to update (replace) their own company logo
DROP POLICY IF EXISTS "Users can update their own company logos" ON storage.objects;
CREATE POLICY "Users can update their own company logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow users to delete their own company logo
DROP POLICY IF EXISTS "Users can delete their own company logos" ON storage.objects;
CREATE POLICY "Users can delete their own company logos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
