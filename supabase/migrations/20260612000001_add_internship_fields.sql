-- Growlancer Internship Applications - Add new fields for enhanced application form
-- This migration adds columns needed by the Career/Jobs page application form

ALTER TABLE public.internship_applications
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS university text,
  ADD COLUMN IF NOT EXISTS degree text,
  ADD COLUMN IF NOT EXISTS graduation_year text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS resume_file_path text,
  ADD COLUMN IF NOT EXISTS resume_file_name text;
-- Create a storage bucket for internship resumes
INSERT INTO storage.buckets (id, name, public) 
VALUES ('internship_resumes', 'internship_resumes', true)
ON CONFLICT (id) DO NOTHING;
-- Allow anyone to upload resumes (for anon application submission)
DROP POLICY IF EXISTS "Anyone can upload internship resumes" ON storage.objects;
CREATE POLICY "Anyone can upload internship resumes"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'internship_resumes');
-- Allow public read access to resume files
DROP POLICY IF EXISTS "Anyone can read internship resumes" ON storage.objects;
CREATE POLICY "Anyone can read internship resumes"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'internship_resumes');
-- Allow admins to delete resume files
DROP POLICY IF EXISTS "Admins can delete internship resumes" ON storage.objects;
CREATE POLICY "Admins can delete internship resumes"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'internship_resumes' AND
    auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  );
