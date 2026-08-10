-- ═══════════════════════════════════════════════════════════════════════════
-- KYC duplicate-document protection
-- One identity document = ONE verified account. If a user tries to verify a
-- document number that is already verified on a DIFFERENT account, the submit
-- is rejected immediately with a clear message ("already verified on another
-- account"). This prevents same-person multi-account verification abuse.
-- ═══════════════════════════════════════════════════════════════════════════

-- Normalized, comparable document number (uppercase, alphanumeric only).
-- Generated column keeps lookups indexable and consistent across Aadhaar/PAN
-- etc. regardless of how the user typed the number.
ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS document_hash text
  GENERATED ALWAYS AS (
    upper(regexp_replace(coalesce(document_number, ''), '[^A-Z0-9]', '', 'g'))
  ) STORED;

-- Non-unique index over *verified* documents → the BEFORE trigger below can
-- find a conflicting verified owner in O(1) even at scale. (Deliberately NOT a
-- UNIQUE index: legacy rows may contain duplicates, and the trigger already
-- enforces the rule with a friendly error message.)
CREATE INDEX IF NOT EXISTS idx_identity_verifications_verified_doc_hash
  ON public.identity_verifications (document_hash)
  WHERE status = 'verified';

-- Friendly rejection instead of a raw constraint error.
CREATE OR REPLACE FUNCTION public.kyc_reject_duplicate_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm  text;
  v_owner uuid;
BEGIN
  -- Only guard pending submissions / rows being moved to verified.
  IF NEW.status <> 'pending' AND NEW.status <> 'verified' THEN
    RETURN NEW;
  END IF;

  v_norm := upper(regexp_replace(coalesce(NEW.document_number, ''), '[^A-Z0-9]', '', 'g'));
  IF v_norm = '' THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_owner
  FROM public.identity_verifications
  WHERE status = 'verified'
    AND user_id <> NEW.user_id
    AND document_hash = v_norm
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'This document is already verified on another account. Each identity document can only be verified on one Growlancer account. Contact support if you believe this is a mistake.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_reject_duplicate_document ON public.identity_verifications;
CREATE TRIGGER trg_kyc_reject_duplicate_document
BEFORE INSERT OR UPDATE OF document_number, document_type, status
ON public.identity_verifications
FOR EACH ROW
EXECUTE FUNCTION public.kyc_reject_duplicate_document();
