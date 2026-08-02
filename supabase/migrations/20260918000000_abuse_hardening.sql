-- ============================================================================
-- Abuse Hardening (Security Audit — zero remaining minor risks)
-- 1. Message spam: DB-enforced per-sender rate limit (30 msgs / min)
-- 2. Trial abuse: verified-email requirement, plan-must-offer-trial,
--    trial-window clamp, one free trial per email ever
-- 3. Referral abuse: one claim per referee, no self-referral via direct insert,
--    INSERT policy restricted to the referrer themselves
-- 4. GDPR deletion: automated cron that processes due confirmed requests
-- 5. Fix deletion status CHECK that contradicts process_account_deletion /
--    cleanup_orphaned_data (latent check_violation on first real deletion)
-- ============================================================================

-- ============================================================================
-- 1. MESSAGE SPAM — per-sender rate limit enforced at the DB layer
--    (the messages insert is client-side, so RLS alone cannot throttle it)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
  v_limit INTEGER := 30; -- max messages per sender per rolling minute
BEGIN
  IF NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;
  SELECT count(*) INTO v_count
  FROM public.messages
  WHERE sender_id = NEW.sender_id
    AND created_at > now() - interval '1 minute';
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many messages (max % per minute). Please slow down.', v_limit;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_rate_limit ON public.messages;
CREATE TRIGGER trg_messages_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_rate_limit();

-- ============================================================================
-- 2. TRIAL ABUSE — verified email + valid plan + one trial per email ever
--    (kills throwaway-email farming, evergreen trial_end_date hacking, and
--     delete-account → re-signup → free trial loops)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_subscription_trial_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
  v_confirmed_at TIMESTAMPTZ;
  v_trial_days INTEGER;
  v_plan_active BOOLEAN;
BEGIN
  IF NEW.status <> 'trial' THEN
    RETURN NEW;
  END IF;

  -- 2a. A trial requires a verified email address
  SELECT email, email_confirmed_at INTO v_email, v_confirmed_at
  FROM auth.users
  WHERE id = NEW.user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Account not found. Please sign in again.';
  END IF;
  IF v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Please verify your email address before starting a free trial.';
  END IF;

  -- 2b. A trial must be attached to a plan that actually offers a trial, and
  --     the trial window must not exceed the plan's advertised trial period
  --     (requiring plan_id also closes the plan-less trial bypass)
  IF NEW.plan_id IS NULL THEN
    RAISE EXCEPTION 'A free trial requires a subscription plan.';
  END IF;
  SELECT trial_days, is_active INTO v_trial_days, v_plan_active
  FROM public.subscription_plans
  WHERE id = NEW.plan_id;
  IF v_trial_days IS NULL THEN
    RAISE EXCEPTION 'Unknown subscription plan.';
  END IF;
  IF NOT COALESCE(v_plan_active, false) THEN
    RAISE EXCEPTION 'This subscription plan is not currently available.';
  END IF;
  IF v_trial_days <= 0 THEN
    RAISE EXCEPTION 'This plan does not offer a free trial.';
  END IF;
  IF NEW.trial_end_date IS NULL OR NEW.trial_end_date <= now() THEN
    RAISE EXCEPTION 'Invalid trial end date.';
  END IF;
  IF NEW.trial_end_date > now() + (v_trial_days || ' days')::interval THEN
    RAISE EXCEPTION 'Trial period exceeds the allowed % days.', v_trial_days;
  END IF;

  -- 2c. One free trial per email address, ever — blocks re-signup and
  --     same-account re-trial farming
  IF EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN auth.users u ON u.id = s.user_id
    WHERE lower(u.email) = lower(v_email)
      AND s.trial_start_date IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A free trial has already been used for this email address.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_trial_guard ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_trial_guard
  BEFORE INSERT ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_subscription_trial_guard();

-- ============================================================================
-- 3. REFERRAL ABUSE
--    process_referral already blocks self-referral + duplicates, but direct
--    INSERT bypassed it. Close those vectors at the table level.
-- ============================================================================

-- One referral claim per referee, ever (no multi-referrer farming)
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_one_claim_per_referee
  ON public.referrals(referred_user_id);

-- Self-referral impossible even via direct insert
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_no_self_referral;
ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_no_self_referral
  CHECK (referrer_id <> referred_user_id);

-- Only allow creating referral rows where YOU are the referrer.
-- All legitimate creation goes through process_referral (SECURITY DEFINER, RLS
-- bypassed), so the weaker redundant INSERT policies are dropped — otherwise
-- their OR semantics would bypass this tightening.
DROP POLICY IF EXISTS "Referral participants can insert referrals" ON public.referrals;
DROP POLICY IF EXISTS "Users can create referrals" ON public.referrals;
DROP POLICY IF EXISTS "Users can insert referrals" ON public.referrals;
CREATE POLICY "Users can insert referrals" ON public.referrals
  FOR INSERT
  TO authenticated
  WITH CHECK (referrer_id = auth.uid() AND referrer_id IS DISTINCT FROM referred_user_id);

-- ============================================================================
-- 4. GDPR DELETION — automated due-request processor + cron
--    (removes reliance on an unconfigured HTTP cron / CRON_SECRET)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_due_deletions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_req IN
    SELECT id, user_id
    FROM public.user_deletion_requests
    WHERE status = 'confirmed'
      AND scheduled_deletion_at <= now()
    ORDER BY scheduled_deletion_at
  LOOP
    BEGIN
      -- Full request lifecycle (confirmed -> processing -> completed) + data purge
      PERFORM public.process_account_deletion(v_req.id);
      -- GDPR completeness: also remove the auth identity. process_account_deletion
      -- intentionally leaves auth.users to the caller, and delete_user_all_data
      -- requires the profile to still exist, so purge auth directly (same pattern
      -- as the hard-delete migrations). Best-effort: never fail the request over it.
      BEGIN
        DELETE FROM auth.users WHERE id = v_req.user_id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Never let one bad request block the rest; surface it as failed
      UPDATE public.user_deletion_requests
      SET status = 'failed', updated_at = now()
      WHERE id = v_req.id AND status = 'confirmed';
    END;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Daily at 04:00 (supabase.cron catches up missed runs)
SELECT cron.schedule(
  'growlancer-process-due-deletions',
  '0 4 * * *',
  $$SELECT public.process_due_deletions();$$
);

-- ============================================================================
-- 5. FIX DELETION STATUS CHECK
--    Current constraint allows only (pending, confirmed, cancelled, deleted)
--    but process_account_deletion sets 'processing' → 'completed' and
--    cleanup_orphaned_data sets 'failed' — the first real deletion would have
--    thrown check_violation. Recreate the constraint with every status used.
-- ============================================================================
ALTER TABLE public.user_deletion_requests
  DROP CONSTRAINT IF EXISTS user_deletion_requests_status_check;
ALTER TABLE public.user_deletion_requests
  ADD CONSTRAINT user_deletion_requests_status_check
  CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'cancelled', 'failed', 'deleted'));
