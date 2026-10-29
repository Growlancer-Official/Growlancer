-- Two transparent paid tiers: Pro keeps the canonical Rs 299 plan and Premium
-- adds advanced analytics. Free analytics stays simple and available to all.
BEGIN;

-- The code already uses the canonical premium_monthly subscription for paid
-- access. Rename that existing row to Pro and add Premium as a second tier.
-- Do not activate legacy plans or alter existing subscriptions.
UPDATE public.subscription_plans
   SET name = 'Pro',
       description = 'More AI assistant and AI writing capacity for freelancers.',
       features = jsonb_build_array(
         'Unlimited AI assistant messages',
         'AI writing — 100 generations per day (Free: 5 per day)',
         'Pro badge on your public profile',
         'Cancel anytime — no lock-in'
       ),
       updated_at = now()
 WHERE id = 'premium_monthly'
   AND role = 'freelancer'
   AND price = 299
   AND interval = 'month';

-- Premium must only be enabled when the canonical Pro row was found. The plan
-- schema's exact constraints and defaults can differ across deployed history;
-- copy its known columns, avoiding unknown/privileged fields.
DO $premium_seed$
DECLARE
  v_pro public.subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_pro
    FROM public.subscription_plans
   WHERE id = 'premium_monthly'
     AND role = 'freelancer'
     AND price = 299
     AND interval = 'month'
     AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical active Pro plan (premium_monthly, Rs 299/month) is required';
  END IF;

  INSERT INTO public.subscription_plans (
    id, name, description, price, interval, role, features, is_active,
    ai_messages_limit, ai_priority, trial_days, currency
  )
  VALUES (
    'premium_advanced_monthly',
    'Premium',
    'Everything in Pro plus advanced freelancer analytics.',
    v_pro.price + 200,
    v_pro.interval,
    'freelancer',
    jsonb_build_array(
      'Everything in Pro',
      'Advanced analytics: earnings trends, proposal conversion and performance metrics',
      'Cancel anytime — no lock-in'
    ),
    true,
    v_pro.ai_messages_limit,
    v_pro.ai_priority,
    0,
    COALESCE(v_pro.currency, 'INR')
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    interval = EXCLUDED.interval,
    role = EXCLUDED.role,
    features = EXCLUDED.features,
    is_active = true,
    ai_messages_limit = EXCLUDED.ai_messages_limit,
    ai_priority = EXCLUDED.ai_priority,
    trial_days = EXCLUDED.trial_days,
    currency = EXCLUDED.currency,
    updated_at = now();
END;
$premium_seed$;

DO $assert_tiers$
BEGIN
  IF (SELECT count(*) FROM public.subscription_plans
       WHERE role = 'freelancer' AND is_active AND price > 0) <> 2 THEN
    RAISE EXCEPTION 'expected exactly two active paid freelancer tiers';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id='premium_monthly' AND name='Pro' AND price=299 AND is_active) THEN
    RAISE EXCEPTION 'canonical Rs 299 Pro tier missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id='premium_advanced_monthly' AND name='Premium' AND is_active AND price > 299 AND features::text ILIKE '%advanced analytics%') THEN
    RAISE EXCEPTION 'advanced Premium tier was not configured';
  END IF;
END;
$assert_tiers$;

COMMIT;
