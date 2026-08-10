-- KYC: Delayed auto-verification (≈10 minutes) + real-time notification.
--
-- Previously kyc_auto_verify_trigger_fn verified submissions INSTANTLY. Now the
-- submission stays 'pending', the 10-minute cron sweep (auto_verify_kyc) verifies
-- it (industry-standard 10–20 min window), and a real-time in-app notification is
-- created so both freelancer and client see the verified status flip live.
--
-- The notification is created by a SECURITY DEFINER trigger (runs as owner,
-- bypassing RLS) — a normal client insert would fail because the notifications
-- RLS insert policy requires user_id = auth.uid().

-- 1. Trigger: on INSERT → stay pending (sweep owns verification).
--    On UPDATE to verified/rejected → fire the real-time in-app notification.
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
BEGIN
  -- 🕐 INSERT: keep 'pending' so the 10-minute sweep performs verification.
  --    (The old code verified instantly here — removed.)
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
    WHEN 'drivers_license' THEN "driver's license"
    WHEN 'national_id'     THEN 'national ID'
    ELSE 'identity document'
  END;

  IF NEW.status = 'verified' THEN
    v_title := 'Identity Verified ✅';
    v_message := 'Your ' || v_label || ' has been verified. Your verified badge is now live.';
  ELSE
    v_title := 'Verification Update 📋';
    v_message := 'Your ' || v_label || ' could not be approved.'
      || CASE WHEN coalesce(NEW.rejection_reason, '') <> ''
              THEN ' Reason: ' || NEW.rejection_reason
              ELSE '' END;
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = NEW.user_id;
  v_url := CASE WHEN v_role = 'client' THEN '/client/verification' ELSE '/dashboard/verification' END;

  -- 🔔 Real-time in-app notification (notifications is on supabase_realtime →
  --    bell badge + toast fire live for both roles).
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
      'status', NEW.status
    )
  );

  RETURN NEW;
END;
$$;

-- 2. Defensive trigger (re)creation — guarantees trg_kyc_auto_verify exists on
--    fresh environments too (not just relying on the older migration).
DROP TRIGGER IF EXISTS trg_kyc_auto_verify ON public.identity_verifications;
CREATE TRIGGER trg_kyc_auto_verify
  AFTER INSERT OR UPDATE OF status ON public.identity_verifications
  FOR EACH ROW EXECUTE FUNCTION public.kyc_auto_verify_trigger_fn();

-- 3. Verify a single pending row (status update only — the trigger notifies).
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

-- 4. Bulk sweep — only verifies fresh submissions that are AT LEAST 10 MINUTES
--    old and not already flagged for manual admin review.
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
      AND created_at <= now() - interval '10 minutes'
  LOOP
    PERFORM public.kyc_verify_row(v_row.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 5. Reschedule the sweep every 10 minutes (runs at :00 :10 :20 ... so a
--    submission is verified at its 10-minute mark at the latest).
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
