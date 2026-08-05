-- Growlancer Internship Applications
-- Stores applications submitted through the internships page
-- Run this migration to create the backing table

CREATE TABLE IF NOT EXISTS public.internship_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  role_id text NOT NULL,
  role_name text NOT NULL,
  education text,
  graduation_date text,
  discord_handle text,
  github_url text,
  portfolio_url text,
  resume_url text,
  cover_letter text NOT NULL,
  why_growlancer text,
  weekly_availability integer,
  available_from date,
  available_to date,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for querying by status and role
CREATE INDEX IF NOT EXISTS idx_internship_applications_status ON internship_applications(status);
CREATE INDEX IF NOT EXISTS idx_internship_applications_role ON internship_applications(role_id);
CREATE INDEX IF NOT EXISTS idx_internship_applications_created ON internship_applications(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.internship_applications ENABLE ROW LEVEL SECURITY;

-- Anyone can submit an application (anon + authenticated)
DROP POLICY IF EXISTS "Anyone can submit internship application" ON public.internship_applications;
CREATE POLICY "Anyone can submit internship application"
  ON public.internship_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- No public read access to applications
DROP POLICY IF EXISTS "No public read on internship applications" ON public.internship_applications;
CREATE POLICY "No public read on internship applications"
  ON public.internship_applications
  FOR SELECT
  TO anon, authenticated
  USING (false);

-- Only authenticated users with admin role can update applications
DROP POLICY IF EXISTS "Admin only can update internship applications" ON public.internship_applications;
CREATE POLICY "Admin only can update internship applications"
  ON public.internship_applications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (
    SELECT id FROM public.profiles WHERE role = 'admin'
  ));

-- Only authenticated users with admin role can delete applications
DROP POLICY IF EXISTS "Admin only can delete internship applications" ON public.internship_applications;
CREATE POLICY "Admin only can delete internship applications"
  ON public.internship_applications
  FOR DELETE
  TO authenticated
  USING (auth.uid() IN (
    SELECT id FROM public.profiles WHERE role = 'admin'
  ));

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_internship_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_internship_applications_updated_at ON internship_applications;
CREATE TRIGGER update_internship_applications_updated_at
  BEFORE UPDATE ON internship_applications
  FOR EACH ROW EXECUTE FUNCTION update_internship_applications_updated_at();
