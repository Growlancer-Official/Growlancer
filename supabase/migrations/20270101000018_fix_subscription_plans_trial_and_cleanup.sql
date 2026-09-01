-- Fix subscription plans for production
--
-- 1. premium_monthly: add 7-day free trial (was 0 — users couldn't trial)
-- 2. pro-monthly: deactivate (has pay-to-win features: "Priority in search
--    results", "100 connects/month" — violates merit-based ranking policy)
-- 3. Deactivate ALL other stray plans — only premium_monthly should be active

-- Activate trial on the canonical plan
UPDATE subscription_plans
SET trial_days = 7
WHERE id = 'premium_monthly';

-- Deactivate the stray pro-monthly plan with pay-to-win features
UPDATE subscription_plans
SET is_active = false
WHERE id = 'pro-monthly';

-- Safety net: deactivate ALL paid plans except premium_monthly
UPDATE subscription_plans
SET is_active = false
WHERE price > 0
  AND id <> 'premium_monthly'
  AND is_active = true;

-- Verify: only premium_monthly + free plans should be active
DO $$
DECLARE
  v_active_paid INTEGER;
BEGIN
  SELECT count(*) INTO v_active_paid
  FROM subscription_plans
  WHERE is_active = true AND price > 0 AND id <> 'premium_monthly';

  IF v_active_paid > 0 THEN
    RAISE WARNING 'Found % active paid plans besides premium_monthly', v_active_paid;
  END IF;
END $$;
