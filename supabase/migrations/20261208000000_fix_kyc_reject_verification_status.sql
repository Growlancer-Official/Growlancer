-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: KYC rejection path crashed on profiles.verification_status
--
-- Root cause: when auto-verification REJECTS a document, kyc_verify_row ran
--     UPDATE profiles SET verification_status = NULL ...
-- but profiles.verification_status is NOT NULL (default 'unverified'). The
-- NOT NULL violation rolled back the whole rejection, so the row stayed
-- 'pending' forever — the exact "stuck under review" symptom the user saw.
--
-- Fix: reset to 'unverified' (the column's defined clean state) instead of
-- NULL, so a rejection actually applies. A previously 'verified' badge is
-- cleared the same way it was intended to be, and the user can resubmit.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.kyc_verify_row(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.identity_verifications%ROWTYPE;
  v_new_count INTEGER;
BEGIN
  SELECT * INTO v_rec FROM public.identity_verifications WHERE id = p_id;
  IF NOT FOUND OR v_rec.status <> 'pending' THEN
    RETURN;
  END IF;

  IF public.kyc_validate_document_number(v_rec.document_type, v_rec.document_number) THEN
    -- ✅ Document number format is valid — auto-verify
    UPDATE public.identity_verifications
      SET status = 'verified',
          verified_at = now(),
          verification_provider = 'auto',
          rejection_reason = NULL,
          rejection_count = 0,
          blocked_until = NULL,
          updated_at = now()
      WHERE id = p_id;

    -- Sync the verified badge everywhere (both role tables).
    UPDATE public.profiles
      SET verification_status = 'verified'
      WHERE id = v_rec.user_id;
    UPDATE public.freelancer_profiles
      SET verification_status = 'verified'
      WHERE user_id = v_rec.user_id;
  ELSE
    -- ❌ Document number format does not match — reject + count attempt
    v_new_count := coalesce(v_rec.rejection_count, 0) + 1;

    UPDATE public.identity_verifications
      SET status = 'rejected',
          verified_at = NULL,
          rejection_reason = CASE
            WHEN v_new_count >= 3
              THEN 'Verification failed after 3 attempts. You are blocked for 24 hours.'
            ELSE 'Document number format does not match the expected pattern for ' ||
                 coalesce(v_rec.document_type, 'your document') || '. Please verify and resubmit.'
          END,
          rejection_count = v_new_count,
          blocked_until = CASE
            WHEN v_new_count >= 3 THEN now() + interval '24 hours'
            ELSE NULL
          END,
          updated_at = now()
      WHERE id = p_id;

    -- Reset any previously verified status on profiles (clean slate for
    -- resubmit). Column is NOT NULL — reset to 'unverified', never NULL.
    UPDATE public.profiles
      SET verification_status = 'unverified'
      WHERE id = v_rec.user_id
        AND verification_status = 'verified';
    UPDATE public.freelancer_profiles
      SET verification_status = 'unverified'
      WHERE user_id = v_rec.user_id
        AND verification_status = 'verified';
  END IF;
END;
$$;
