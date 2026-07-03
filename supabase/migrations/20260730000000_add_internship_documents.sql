-- Growlancer Internship Documents
-- Adds columns for storing document URLs (Offer Letter, NDA, Internship Letter)
-- Admin manually uploads these PDFs when selecting an intern

ALTER TABLE public.internship_applications
  ADD COLUMN IF NOT EXISTS offer_letter_url text,
  ADD COLUMN IF NOT EXISTS nda_url text,
  ADD COLUMN IF NOT EXISTS internship_letter_url text;

-- Create a storage bucket for internship documents (PDFs)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('internship_documents', 'internship_documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload and manage documents
DROP POLICY IF EXISTS "Admins can manage internship documents" ON storage.objects;
CREATE POLICY "Admins can manage internship documents"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'internship_documents' AND
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  )
  WITH CHECK (
    bucket_id = 'internship_documents' AND
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );

-- Allow public read access to document files
DROP POLICY IF EXISTS "Anyone can read internship documents" ON storage.objects;
CREATE POLICY "Anyone can read internship documents"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'internship_documents');
