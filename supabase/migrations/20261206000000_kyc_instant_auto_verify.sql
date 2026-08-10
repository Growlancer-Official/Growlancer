-- ═══════════════════════════════════════════════════════════════════════════
-- KYC: INSTANT auto-verification (remove the forced ~10-minute delay)
-- Previous migrations (20261112000001/2) changed the INSERT trigger to keep
-- rows 'pending' and let a pg_cron sweep verify them only after they are
-- 10 minutes old — a FORCED delay, and it broke in prod (rows stuck pending
-- forever because the sweep never ran reliably).
--
-- Now: the moment a submission is inserted, kyc_verify_row runs the actual
-- check (document-number format validation) and flips the row to
-- verified/rejected IMMEDIATELY. The pg_cron sweep stays purely as a safety
-- net for anything the trigger could not process — with NO time gate.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Trigger function: verify INSTANTLY on INSERT ────────────────────────
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
  -- ⚡ INSERT: run the real check RIGHT NOW — no forced delay. kyc_verify_row
  -- flips the row to verified/rejected, which re-fires this trigger (UPDATE
  -- branch) so the notification below is still sent.
  IF TG_OP = 'INSERT' THEN
    PERFORM public.kyc_verify_row(NEW.id);
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

-- ── 2) Safety-net sweep: no more 10-minute gate ────────────────────────────
-- Processes any eligible pending row immediately. Only rows flagged for
-- manual admin review (rejection_reason set) are skipped, so the sweep can
-- never fight an admin decision.
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
  LOOP
    PERFORM public.kyc_verify_row(v_row.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
