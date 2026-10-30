-- ONE flat paid plan at Rs 199/month — the only paid price in the product.
--
-- 20270209000000 created a second tier (premium_advanced_monthly, Rs 499) and
-- renamed the canonical row to "Pro" at Rs 299. The final product model is a
-- single, affordable plan that includes EVERYTHING paid: AI assistant without a
-- monthly cap, AI writing at 100/day, advanced analytics and the badge.
--
-- So: keep one purchasable row, price it at 199, and retire the costlier tier.
-- The retired row is deactivated, never deleted — historical subscriptions still
-- reference it and must keep reading their plan name.
BEGIN;

UPDATE public.subscription_plans
   SET name = 'Premium',
       description = 'Everything paid in one plan: unlimited AI assistant messages, AI writing at 100 generations per day, advanced analytics and a Premium badge.',
       price = 199,
       is_active = true,
       features = jsonb_build_array(
         'Unlimited AI assistant messages',
         'AI writing — 100 generations per day (Free: 5 per day)',
         'Advanced analytics — earnings and view trends, proposal funnel, rating split, top categories',
         'Premium badge on your public profile',
         'Cancel anytime — no lock-in'
       ),
       updated_at = now()
 WHERE id = 'premium_monthly';

-- Retire the Rs 499 tier: no longer purchasable, but the row survives so an
-- existing subscriber's history keeps a readable plan name.
UPDATE public.subscription_plans
   SET is_active = false,
       updated_at = now()
 WHERE id = 'premium_advanced_monthly';

-- Defensive: whatever stray paid rows history left behind must not become
-- purchasable. This is the same guard 20260830000001 applied, re-asserted after
-- the price change above so there is exactly ONE paid plan at any time.
UPDATE public.subscription_plans
   SET is_active = false,
       updated_at = now()
 WHERE price > 0
   AND id <> 'premium_monthly';

COMMIT;
