-- ============================================================
-- 1. WITHDRAWAL METHOD CONSTRAINT
-- Frontend sends method = 'razorpay_payout' (UPI/bank via RazorpayX)
-- but the CHECK only allowed ('paypal','bank') → every withdrawal
-- failed with withdrawals_method_check violation. Widen it to all
-- methods the app actually uses.
-- ============================================================
ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_method_check;
ALTER TABLE public.withdrawals
  ADD CONSTRAINT withdrawals_method_check
  CHECK (method = ANY (ARRAY['paypal','bank','upi','crypto','razorpay_payout','bank_transfer']::text[]));

-- ============================================================
-- 2. SUBSCRIPTION TRIAL — one free trial ever, then pay
-- enforce_subscription_trial_guard already exists; make sure the
-- trigger is attached so INSERTs on subscriptions are guarded.
-- Freelancer Pro trial = 1 day, client Pro trial = 7 days.
-- ============================================================
DROP TRIGGER IF EXISTS trg_enforce_subscription_trial_guard ON public.subscriptions;
CREATE TRIGGER trg_enforce_subscription_trial_guard
BEFORE INSERT ON public.subscriptions
FOR EACH ROW
WHEN (NEW.status = 'trial')
EXECUTE FUNCTION public.enforce_subscription_trial_guard();

UPDATE public.subscription_plans
SET trial_days = CASE WHEN role = 'client' THEN 7 ELSE 1 END
WHERE price > 0 AND trial_days <> CASE WHEN role = 'client' THEN 7 ELSE 1 END;

-- ============================================================
-- 3. VERIFICATION (BOTH USERS) — freelancer_profiles was supposed
-- to have verification_status but the migration never ran here, so
-- ensure BOTH tables have it. profiles also gets kyc_verified_at.
-- Backfill profiles from freelancer_profiles where the same user
-- exists (clients that are also freelancers stay in sync).
-- ============================================================
ALTER TABLE public.freelancer_profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;

UPDATE public.profiles p
SET verification_status = COALESCE(fp.verification_status, 'unverified'),
    kyc_verified_at = p.kyc_verified_at
FROM public.freelancer_profiles fp
WHERE fp.user_id = p.id
  AND (p.verification_status = 'unverified' OR p.verification_status IS NULL);
