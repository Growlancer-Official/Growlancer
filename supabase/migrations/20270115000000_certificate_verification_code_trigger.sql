-- ═══════════════════════════════════════════════════════════════════════════
-- Certificates: auto-assign verification_code on INSERT
--
-- Bug: migration 20260802000000 backfilled codes for rows existing AT THAT
-- TIME only. Every skill-test pass afterwards inserted a row with
-- verification_code = NULL → the public verify page (admin-data edge
-- function, action=verify_certificate) looks rows up by verification_code
-- and returned "Certificate not found" for all new certificates, and the
-- certificate page showed a broken QR link (…/verify-certificate/null).
--
-- Fix: BEFORE INSERT trigger generates a unique 'GRW-CERT-XXXXX' code
-- (same format as the original backfill) whenever it is NULL, with a
-- collision-retry loop against the UNIQUE constraint. Also backfills any
-- rows created between the old backfill and this migration.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assign_certificate_verification_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verification_code IS NULL THEN
    LOOP
      NEW.verification_code := 'GRW-CERT-' || upper(substr(md5(NEW.id::text || random()::text::text), 1, 5));
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.skill_certifications
        WHERE verification_code = NEW.verification_code
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_certificate_code ON public.skill_certifications;
CREATE TRIGGER trg_assign_certificate_code
  BEFORE INSERT ON public.skill_certifications
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_certificate_verification_code();

-- Backfill rows inserted after the previous one-time backfill
UPDATE public.skill_certifications
SET verification_code = 'GRW-CERT-' || upper(substr(md5(id::text || random()::text::text), 1, 5))
WHERE verification_code IS NULL;
