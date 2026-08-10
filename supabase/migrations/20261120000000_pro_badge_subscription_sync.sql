-- PRO badge sync: profiles.is_pro must reflect ONLY a live subscription or
-- an active (unexpired) trial. Previously is_pro was set true on trial start
-- and NEVER reset, so the PRO badge stayed visible forever after the trial
-- ended / subscription lapsed. This migration:
--   1. Adds a helper that recomputes is_pro from the latest subscription row.
--   2. Adds an AFTER INSERT/UPDATE/DELETE trigger on subscriptions so any
--      status change (trial start, payment, cron expiry, cancellation) flips
--      the badge in real time.
--   3. Backfills existing stale flags so old expired trials stop showing PRO.

CREATE OR REPLACE FUNCTION public.sync_profile_pro_flag(v_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_is_pro boolean := false;
BEGIN
  -- Latest subscription row for this user (any status)
  SELECT * INTO v_sub
    FROM public.subscriptions
   WHERE user_id = v_user_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    IF v_sub.status = 'active' THEN
      -- Active paid subscription → PRO (cron / cancel flows move it out of
      -- 'active' when it lapses, which re-fires this trigger).
      v_is_pro := true;
    ELSIF v_sub.status = 'trial' THEN
      -- Trial is PRO only while the trial end date is still in the future.
      v_is_pro := v_sub.trial_end_date IS NOT NULL AND v_sub.trial_end_date > now();
    END IF;
  END IF;

  UPDATE public.profiles
     SET is_pro = v_is_pro
   WHERE id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_pro_flag_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  PERFORM public.sync_profile_pro_flag(v_user_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_pro_flag_trg ON public.subscriptions;
CREATE TRIGGER sync_profile_pro_flag_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_pro_flag_trigger_fn();

-- Backfill: reset any stale PRO flags where the user has NO active/trial
-- subscription anymore (or an expired trial). Keeps every badge honest.
UPDATE public.profiles p
   SET is_pro = EXISTS (
     SELECT 1
       FROM public.subscriptions s
      WHERE s.user_id = p.id
        AND (
          s.status = 'active'
          OR (s.status = 'trial' AND s.trial_end_date IS NOT NULL AND s.trial_end_date > now())
        )
   )
 WHERE p.is_pro = true;
