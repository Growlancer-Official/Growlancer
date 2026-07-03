-- Add LOR certificate type and enhanced fields for internship certificates
-- LOR = Letter of Recommendation for top-performing interns

-- 1. Alter the CHECK constraint to include 'lor' type
ALTER TABLE public.skill_certifications 
  DROP CONSTRAINT IF EXISTS skill_certifications_certificate_type_check;

ALTER TABLE public.skill_certifications 
  ADD CONSTRAINT skill_certifications_certificate_type_check 
  CHECK (certificate_type IN ('skill_test', 'platform', 'internship', 'achievement', 'lor'));

-- 2. Add new fields for LOR and enhanced internship certificates
ALTER TABLE public.skill_certifications 
  ADD COLUMN IF NOT EXISTS internship_period TEXT,
  ADD COLUMN IF NOT EXISTS performance_summary TEXT,
  ADD COLUMN IF NOT EXISTS skills_demonstrated TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS project_contribution TEXT,
  ADD COLUMN IF NOT EXISTS duration_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duration_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS issuer_title TEXT DEFAULT 'Founder & CEO',
  ADD COLUMN IF NOT EXISTS issuer_signature_url TEXT;

-- 3. Create a dedicated view for internship certificates & LORs
CREATE OR REPLACE VIEW public.internship_certificates_view AS
SELECT 
  id,
  user_id,
  verification_code,
  certificate_type,
  status,
  recipient_name,
  recipient_email,
  skill AS role_name,
  level,
  issued_at,
  issued_by,
  internship_period,
  performance_summary,
  skills_demonstrated,
  project_contribution,
  duration_start,
  duration_end,
  metadata,
  created_at
FROM public.skill_certifications
WHERE certificate_type IN ('internship', 'lor');

-- Grant access
GRANT SELECT ON public.internship_certificates_view TO service_role, anon;

-- Notify realtime
SELECT pg_notify('pgrst', 'reload schema');
