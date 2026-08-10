-- KYC: Rejection attempt tracking + 24-hour cooldown after 3 failed attempts.
-- When document auto-verification fails (name/number mismatch or invalid format),
-- the user can resubmit up to 3 times. After 3 failures, they are blocked for
-- 24 hours. The frontend shows remaining attempts and cooldown timer in real-time.

-- 1. Add tracking columns to identity_verifications
ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS rejection_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ DEFAULT NULL;

-- 2. Update kyc_verify_row to track rejection attempts + block after 3
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

    -- Reset any previously verified status on profiles (clean slate for resubmit)
    UPDATE public.profiles
      SET verification_status = NULL
      WHERE id = v_rec.user_id
        AND verification_status = 'verified';
    UPDATE public.freelancer_profiles
      SET verification_status = NULL
      WHERE user_id = v_rec.user_id
        AND verification_status = 'verified';
  END IF;
END;
$$;

-- 3. Update auto_verify_kyc to skip blocked rows (blocked_until > now())
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
  FOR v_row IN
    SELECT id
    FROM public.identity_verifications
    WHERE status = 'pending'
      AND coalesce(rejection_reason, '') = ''
      AND coalesce(rejection_count, 0) < 3
      AND (blocked_until IS NULL OR blocked_until <= now())
      AND created_at <= now() - interval '10 minutes'
  LOOP
    PERFORM public.kyc_verify_row(v_row.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 4. Also update the trigger function notification to include rejection_count
--    in metadata so the frontend can show attempt info.
CREATE OR REPLACE FUNCTION public.kyc_auto_verify_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_label text;
  v_title text;
  v_message text;
  v_url text;
  v_attempts_left int;
BEGIN
  -- 🕐 INSERT: keep 'pending' so the 10-minute sweep performs verification.
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Only act on a real status transition (verified/rejected).
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('verified', 'rejected') THEN
    RETURN NEW;
  END IF;

  v_label := CASE NEW.document_type
    WHEN 'aadhaar'         THEN 'Aadhaar card'
    WHEN 'pan'             THEN 'PAN card'
    WHEN 'passport'        THEN 'passport'
    WHEN 'drivers_license' THEN 'driver''s license'
    WHEN 'national_id'     THEN 'national ID'
    ELSE 'identity document'
  END;

  IF NEW.status = 'verified' THEN
    v_title := 'Identity Verified ✅';
    v_message := 'Your ' || v_label || ' has been verified. Your verified badge is now live.';
  ELSE
    v_attempts_left := 3 - coalesce(NEW.rejection_count, 0);
    v_title := 'Verification Update 📋';
    v_message := 'Your ' || v_label || ' could not be approved.'
      || CASE WHEN coalesce(NEW.rejection_reason, '') <> ''
              THEN ' Reason: ' || NEW.rejection_reason ELSE '' END
      || CASE WHEN v_attempts_left > 0 AND NEW.blocked_until IS NULL
              THEN ' You have ' || v_attempts_left || ' attempt' ||
                   CASE WHEN v_attempts_left = 1 THEN '' ELSE 's' END || ' remaining.'
              WHEN NEW.blocked_until IS NOT NULL
              THEN ' You have been blocked for 24 hours due to multiple failed attempts.'
              ELSE '' END;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = NEW.user_id;
  v_url := CASE WHEN v_role = 'client' THEN '/client/verification' ELSE '/dashboard/verification' END;

  -- 🔔 Real-time in-app notification
  INSERT INTO public.notifications (
    user_id, type, title, message, action_url, metadata
  ) VALUES (
    NEW.user_id,
    'verification',
    v_title,
    v_message,
    v_url,
    jsonb_build_object(
      'verification_id', NEW.id,
      'document_type', NEW.document_type,
      'provider', coalesce(NEW.verification_provider, 'manual'),
      'status', NEW.status,
      'rejection_count', coalesce(NEW.rejection_count, 0),
      'blocked_until', NEW.blocked_until
    )
  );

  RETURN NEW;
END;
$$;