-- Certificate System Enhancement
-- Adds admin-issuable platform certificates with unique verification codes

-- Add new columns to existing skill_certifications table
ALTER TABLE public.skill_certifications 
  ADD COLUMN IF NOT EXISTS verification_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS certificate_type TEXT DEFAULT 'skill_test' CHECK (certificate_type IN ('skill_test', 'platform', 'internship', 'achievement')),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS recipient_email TEXT;

-- Create index for fast verification lookups
CREATE INDEX IF NOT EXISTS idx_skill_certifications_verification_code 
  ON public.skill_certifications(verification_code);
CREATE INDEX IF NOT EXISTS idx_skill_certifications_status 
  ON public.skill_certifications(status);
CREATE INDEX IF NOT EXISTS idx_skill_certifications_issued_by 
  ON public.skill_certifications(issued_by);

-- Enable realtime for skill_certifications
-- Note: IF NOT EXISTS is not supported in ALTER PUBLICATION for some PG versions
-- Instead we use DO block for idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'skill_certifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.skill_certifications;
  END IF;
END
$$;

-- Function to generate unique verification code
CREATE OR REPLACE FUNCTION public.generate_certificate_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
  done BOOLEAN;
BEGIN
  done := false;
  WHILE NOT done LOOP
    -- Format: GRW-CERT-XXXXX (5 random alphanumeric chars)
    code := 'GRW-CERT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM public.skill_certifications WHERE verification_code = code) THEN
      done := true;
    END IF;
  END LOOP;
  RETURN code;
END;
$$;

-- Grant access to service role
GRANT EXECUTE ON FUNCTION public.generate_certificate_code TO service_role;

-- Update existing rows with verification codes if they don't have one
UPDATE public.skill_certifications 
SET verification_code = 'GRW-CERT-' || upper(substr(md5(id::text || random()::text), 1, 5))
WHERE verification_code IS NULL;

-- Notify realtime
SELECT pg_notify('pgrst', 'reload schema');
