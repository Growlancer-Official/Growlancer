-- Create portfolio-images storage bucket for portfolio item images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-images',
  'portfolio-images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated users to upload their own portfolio images
DROP POLICY IF EXISTS "Users can upload their own portfolio images" ON storage.objects;
CREATE POLICY "Users can upload their own portfolio images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'portfolio-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow anyone to view portfolio images (public bucket)
DROP POLICY IF EXISTS "Anyone can view portfolio images" ON storage.objects;
CREATE POLICY "Anyone can view portfolio images" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'portfolio-images');

-- Policy: Allow users to update their own portfolio images
DROP POLICY IF EXISTS "Users can update their own portfolio images" ON storage.objects;
CREATE POLICY "Users can update their own portfolio images" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'portfolio-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy: Allow users to delete their own portfolio images
DROP POLICY IF EXISTS "Users can delete their own portfolio images" ON storage.objects;
CREATE POLICY "Users can delete their own portfolio images" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'portfolio-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Add image_url column to services table (for service cover images)
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add image_url column to portfolio_items table if it uses the services-like structure
-- (portfolio_items table already has image_url, media_urls columns from original schema)
