-- ═══════════════════════════════════════════════════════════════════════════
-- KYC duplicate-identity protection — extended
-- Catches the SAME PERSON trying to verify on multiple accounts, even when
-- they use a DIFFERENT document type/number:
--   1) Same normalized document number on another account (verified/pending)
--      → blocked (existing rule, now also covers pending rows).
--   2) Same full name AND same date of birth on another account
--      (verified/pending) → blocked. Name alone is never enough (common names
--      like "Rahul Kumar" are shared by thousands) — requiring name + DOB
--      together is the strong same-person signal used by real KYC providers.
-- ═══════════════════════════════════════════════════════════════════════════

-- Fast lookup for the name+DOB check (functional index on normalized name).
CREATE INDEX IF NOT EXISTS idx_identity_verifications_name_dob
  ON public.identity_verifications (lower(trim(coalesce(full_name, ''))), date_of_birth)
  WHERE status IN ('pending', 'verified');

-- Replace the old document-only guard with the extended identity guard.
CREATE OR REPLACE FUNCTION public.kyc_reject_duplicate_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm  text;
  v_name  text;
  v_owner uuid;
BEGIN
  -- Only guard submissions / rows being moved to verified.
  IF NEW.status <> 'pending' AND NEW.status <> 'verified' THEN
    RETURN NEW;
  END IF;

  -- 1) Document-number duplicate (normalized: uppercase, alphanumeric only)
  v_norm := upper(regexp_replace(coalesce(NEW.document_number, ''), '[^A-Z0-9]', '', 'g'));
  IF v_norm <> '' THEN
    SELECT user_id INTO v_owner
    FROM public.identity_verifications
    WHERE user_id <> NEW.user_id
      AND document_hash = v_norm
      AND status IN ('pending', 'verified')
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'This document is already in use on another account. Each identity document can only be verified on one Growlancer account. Contact support if you believe this is a mistake.';
    END IF;
  END IF;

  -- 2) Same-person duplicate: same full name AND same date of birth
  v_name := lower(trim(coalesce(NEW.full_name, '')));
  IF v_name <> '' AND NEW.date_of_birth IS NOT NULL THEN
    SELECT user_id INTO v_owner
    FROM public.identity_verifications
    WHERE user_id <> NEW.user_id
      AND lower(trim(coalesce(full_name, ''))) = v_name
      AND date_of_birth = NEW.date_of_birth
      AND status IN ('pending', 'verified')
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'This identity (name and date of birth) is already verified on another account. One identity can only be verified on one Growlancer account. Contact support if you believe this is a mistake.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_reject_duplicate_document ON public.identity_verifications;
CREATE TRIGGER trg_kyc_reject_duplicate_identity
BEFORE INSERT OR UPDATE OF document_number, document_type, status, full_name, date_of_birth
ON public.identity_verifications
FOR EACH ROW
EXECUTE FUNCTION public.kyc_reject_duplicate_identity();
