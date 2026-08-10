-- ============================================================
-- KYC: per-document FRONT + BACK images
-- Aadhaar / Passport / Driver's License / National ID accept a
-- front AND a back scan; PAN / Other accept a single (front) image.
-- document_url holds the front image; document_url_back the back.
-- ============================================================
ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS document_url_back TEXT;

-- Ensure the realtime publication includes identity_verifications so the
-- pending → verified flip pushes live to both freelancer & client dashboards.
DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'identity_verifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.identity_verifications;
  END IF;
END
$pub$;
