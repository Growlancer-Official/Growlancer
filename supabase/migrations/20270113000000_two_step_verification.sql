-- ════════════════════════════════════════════════════════════════════════
-- GROWLANCER — TWO-STEP VERIFICATION (email → PAN-only) + CLIENT BUSINESS
--
-- 1. PAN rows no longer need a scanned image — the kyc-submit engine verifies
--    the PAN number server-side. Document images become optional (kept only
--    for legacy/non-PAN compliance rows).
-- 2. Clients can optionally record business identity: Udyam registration
--    number and business PAN (GST + company_name already exist on
--    client_profiles). These are SELF-ATTESTED business details — stored with
--    light server-side format checks, never labelled "verified".
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Identity documents are optional (PAN verified by number) ──────────
ALTER TABLE public.identity_verifications
  ALTER COLUMN document_url DROP NOT NULL;

ALTER TABLE public.identity_verifications
  ALTER COLUMN document_url_back DROP NOT NULL;

-- ── 2. Optional client business identity columns ─────────────────────────
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS udyam_number TEXT;

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS business_pan TEXT;

-- ── 3. Server-side normalization (self-attested → format checks only) ────
-- Mirrors validate_client_gstin: blank allowed, non-blank must be
-- well-formed. business_pan uses the standard PAN shape; udyam accepts the
-- common UDYAM-XX-XX-XXXXXXX / plain registration formats (alnum + hyphen).
CREATE OR REPLACE FUNCTION public.normalize_client_business_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pan TEXT;
  v_udyam TEXT;
BEGIN
  v_pan := NULLIF(BTRIM(UPPER(COALESCE(NEW.business_pan, ''))), '');
  IF v_pan IS NULL THEN
    NEW.business_pan := NULL;
  ELSIF NOT (v_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$') THEN
    RAISE EXCEPTION 'Invalid business PAN format';
  ELSE
    NEW.business_pan := v_pan;
  END IF;

  v_udyam := NULLIF(BTRIM(UPPER(COALESCE(NEW.udyam_number, ''))), '');
  IF v_udyam IS NULL THEN
    NEW.udyam_number := NULL;
  ELSIF NOT (v_udyam ~ '^[A-Z0-9-]{8,30}$') THEN
    RAISE EXCEPTION 'Invalid Udyam registration number format';
  ELSE
    NEW.udyam_number := v_udyam;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_client_business_ids ON public.client_profiles;
CREATE TRIGGER trg_normalize_client_business_ids
  BEFORE INSERT OR UPDATE OF business_pan, udyam_number ON public.client_profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_client_business_ids();

-- RLS: client_profiles owner-update policy (auth.uid() = user_id) covers the
-- new columns automatically; nothing else to change here.
