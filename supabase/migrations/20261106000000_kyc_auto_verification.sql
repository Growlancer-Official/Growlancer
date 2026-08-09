-- KYC Auto-Verification System
-- Industry-standard flow: user submits identity details → the system validates
-- the document number format instantly → valid documents verify automatically
-- (usually within 10-20 minutes, often instantly) → profiles.verification_status
-- syncs in real time so the green Verified badge appears everywhere.

-- 1. Support Indian document types (Aadhaar, PAN) in addition to passport/ID.
ALTER TABLE public.identity_verifications
  DROP CONSTRAINT IF EXISTS identity_verifications_document_type_check;
ALTER TABLE public.identity_verifications
  ADD CONSTRAINT identity_verifications_document_type_check
  CHECK (document_type IN ('passport', 'drivers_license', 'national_id', 'aadhaar', 'pan', 'other'));

-- 2. Extra applicant details + provider tag.
ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS verification_provider TEXT DEFAULT 'manual';

-- 3. Format validation per document type (syntax check — the first layer of
--    industry KYC. Manual admin review handles genuine edge cases).
CREATE OR REPLACE FUNCTION public.kyc_validate_document_number(p_type TEXT, p_number TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'aadhaar'        THEN coalesce(p_number, '') ~ '^[0-9]{12}$'
    WHEN 'pan'            THEN coalesce(p_number, '') ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
    WHEN 'passport'       THEN coalesce(p_number, '') ~ '^[A-Z][0-9]{7}$'
    WHEN 'drivers_license' THEN coalesce(p_number, '') ~ '^[A-Z0-9]{8,}$'
    ELSE length(coalesce(p_number, '')) >= 6
  END
$$;

-- 4. Verify a single pending row (used by the trigger + the cron sweep).
CREATE OR REPLACE FUNCTION public.kyc_verify_row(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.identity_verifications%ROWTYPE;
BEGIN
  SELECT * INTO v_rec FROM public.identity_verifications WHERE id = p_id;
  IF NOT FOUND OR v_rec.status <> 'pending' THEN
    RETURN;
  END IF;

  IF public.kyc_validate_document_number(v_rec.document_type, v_rec.document_number) THEN
    UPDATE public.identity_verifications
      SET status = 'verified',
          verified_at = now(),
          verification_provider = 'auto',
          rejection_reason = NULL,
          updated_at = now()
      WHERE id = p_id;

    -- Sync the green Verified badge everywhere (both role tables).
    UPDATE public.profiles
      SET verification_status = 'verified'
      WHERE id = v_rec.user_id;
    UPDATE public.freelancer_profiles
      SET verification_status = 'verified'
      WHERE user_id = v_rec.user_id;
  ELSE
    -- Invalid/mismatched format → leave pending for manual admin review.
    UPDATE public.identity_verifications
      SET rejection_reason = 'Document number could not be auto-verified — pending manual review',
          updated_at = now()
      WHERE id = p_id;
  END IF;
END;
$$;

-- 5. Auto-verify immediately on submit.
CREATE OR REPLACE FUNCTION public.kyc_auto_verify_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM public.kyc_verify_row(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_auto_verify ON public.identity_verifications;
CREATE TRIGGER trg_kyc_auto_verify
  AFTER INSERT OR UPDATE OF status ON public.identity_verifications
  FOR EACH ROW EXECUTE FUNCTION public.kyc_auto_verify_trigger_fn();

-- 6. Bulk sweep — the 10-minute safety net for anything the trigger missed.
CREATE OR REPLACE FUNCTION public.auto_verify_kyc()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_row record;
BEGIN
  FOR v_row IN SELECT id FROM public.identity_verifications WHERE status = 'pending' LOOP
    PERFORM public.kyc_verify_row(v_row.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Schedule the sweep every 10 minutes (Supabase pg_cron, when available).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kyc-auto-verify') THEN
      PERFORM cron.unschedule('kyc-auto-verify');
    END IF;
    PERFORM cron.schedule('kyc-auto-verify', '*/10 * * * *', $job$SELECT public.auto_verify_kyc()$job$);
  END IF;
END;
$$;

-- 7. RLS — users can submit + update their own verification rows.
DROP POLICY IF EXISTS "Users can insert own identity verification" ON public.identity_verifications;
CREATE POLICY "Users can insert own identity verification"
  ON public.identity_verifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own identity verification" ON public.identity_verifications;
CREATE POLICY "Users can update own identity verification"
  ON public.identity_verifications FOR UPDATE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.identity_verifications TO authenticated;
