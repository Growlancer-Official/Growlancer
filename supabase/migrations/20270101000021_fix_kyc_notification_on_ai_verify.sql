-- FIX: KYC notification not firing when AI pre-verifies documents
--
-- Root cause: When the frontend inserts a row with status='verified'
-- (AI pre-verified), the INSERT trigger calls kyc_verify_row() which
-- returns early (status is not 'pending'). The notification INSERT is
-- only in the UPDATE branch, so no notification is ever created for
-- AI-pre-verified submissions.
--
-- Fix: Add notification creation in the INSERT path when the inserted
-- row already has status='verified' or status='rejected'.

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
  IF TG_OP = 'INSERT' THEN
    PERFORM public.kyc_verify_row(NEW.id);

    -- If AI pre-verified on INSERT (status is already 'verified'),
    -- fire the notification now — kyc_verify_row returns early for
    -- non-pending rows so the UPDATE-branch notification never runs.
    IF NEW.status = 'verified' THEN
      v_label := CASE NEW.document_type
        WHEN 'aadhaar'         THEN 'Aadhaar card'
        WHEN 'pan'             THEN 'PAN card'
        WHEN 'passport'        THEN 'passport'
        WHEN 'drivers_license' THEN 'driver''s license'
        WHEN 'national_id'     THEN 'national ID'
        ELSE 'identity document'
      END;
      v_title := 'Identity Verified ✅';
      v_message := 'Your ' || v_label || ' has been verified. Your verified badge is now live.';

      SELECT role INTO v_role FROM public.profiles WHERE id = NEW.user_id;
      v_url := CASE WHEN v_role = 'client' THEN '/client/verification' ELSE '/dashboard/verification' END;

      -- Notification insert must not roll back verification (defensive)
      BEGIN
        INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
        VALUES (NEW.user_id, 'verification', v_title, v_message, v_url,
          jsonb_build_object(
            'verification_id', NEW.id,
            'document_type', NEW.document_type,
            'provider', coalesce(NEW.verification_provider, 'ai_vision'),
            'status', 'verified',
            'rejection_count', 0
          ));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'KYC notification insert failed: %', SQLERRM;
      END;
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('verified', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- Bypass BEFORE UPDATE triggers on profiles/freelancer_profiles
  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  IF NEW.status = 'verified' THEN
    UPDATE public.profiles
      SET verification_status = 'verified'
      WHERE id = NEW.user_id;
    UPDATE public.freelancer_profiles
      SET verification_status = 'verified'
      WHERE user_id = NEW.user_id;
  ELSE
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
