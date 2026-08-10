-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: KYC verification was stuck "pending" forever
--
-- Root cause: the auto-verify path flips the row to verified/rejected and the
-- trigger then inserts a notification with type='verification' — but the
-- notifications_type_check CHECK constraint did NOT allow 'verification', so
-- EVERY verification UPDATE rolled back (error 23514) and the row stayed
-- 'pending' forever. The 10-minute cron sweep hit the same wall.
--
-- Fix: 1) allow 'verification' notifications, 2) make the notification insert
-- inside the trigger non-fatal (verification must never depend on it).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Allow 'verification' notifications ──────────────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
      'proposal', 'invite', 'contract', 'message', 'payment', 'escrow',
      'review', 'system', 'refund', 'dispute', 'reminder', 'admin',
      'verification', 'milestone', 'ticket', 'payout'
    ])
  );

-- ── 2) Trigger: notification failures must never roll back verification ────
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

  -- 🔔 Real-time in-app notification (non-fatal — verification succeeds even
  -- if a notification insert ever fails for an unrelated reason)
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    -- Never let a notification failure block the verification itself
    NULL;
  END;

  RETURN NEW;
END;
$$;
