-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: KYC trigger now syncs verification_status to profiles/freelancer_profiles
--
-- Previously, the kyc_auto_verify_trigger_fn only sent notifications. The
-- actual verification_status sync happened in kyc_verify_row (SECURITY DEFINER).
-- However, when a row is INSERT'd with status='verified' (AI pre-verified path),
-- kyc_verify_row skips it (only processes 'pending' rows), so the frontend had
-- to do direct UPDATEs on profiles — which now fail with the new WITH CHECK.
--
-- Fix: Add profile sync to the trigger's UPDATE branch (verified/rejected),
-- so all status transitions are handled server-side in SECURITY DEFINER context.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.kyc_auto_verify_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
  -- branch) so the notification + profile sync below are still sent.
  IF TG_OP = 'INSERT' THEN
    PERFORM public.kyc_verify_row(NEW.id);
    RETURN NEW;
  END IF;

  -- Only act on a real status transition (verified/rejected).
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('verified', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- 🔐 Sync verification_status to profiles + freelancer_profiles
  -- (SECURITY DEFINER context — bypasses the WITH CHECK on the UPDATE policy)
  IF NEW.status = 'verified' THEN
    UPDATE public.profiles
      SET verification_status = 'verified'
      WHERE id = NEW.user_id;
    UPDATE public.freelancer_profiles
      SET verification_status = 'verified'
      WHERE user_id = NEW.user_id;
  ELSE
    -- rejected → reset to 'unverified' (only if previously verified)
    UPDATE public.profiles
      SET verification_status = 'unverified'
      WHERE id = NEW.user_id
        AND verification_status = 'verified';
    UPDATE public.freelancer_profiles
      SET verification_status = 'unverified'
      WHERE user_id = NEW.user_id
        AND verification_status = 'verified';
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
$function$;
