-- ═══════════════════════════════════════════════════════════════════════════
-- Lifetime Premium grant (founder comp) — user a84b864f-7dcd-48a6-a10d-1672b54fd451
-- (banyubiru2892@gmail.com, profile name "Ibnu", role freelancer)
--
-- Grants a never-expiring Premium subscription by inserting the canonical
-- premium_monthly subscription row with a far-future end date:
--
--   • Client UPDATE guard (trg_subscription_client_update_guard): service-side
--     writes have no user JWT → auth.uid() IS NULL → allowed.
--   • Trial guard (trg_subscriptions_trial_guard): only fires for
--     status='trial'; this row is status='active' → untouched.
--   • is_pro sync (sync_profile_pro_flag): AFTER INSERT/UPDATE on
--     subscriptions recomputes profiles.is_pro from this row → status='active'
--     → is_pro = true automatically (with its own bypass flag).
--   • Billing cron (subscription-billing-cron): trial leg only touches
--     status='trial'; renewal leg only touches rows with subscription_end_date
--     inside a 24h window — 2099-12-31 can never enter it. Never charged,
--     never expired.
--   • Frontend isProSubscription(): status 'active' + plan price > 0 → Pro
--     badge and premium gates pass; the page shows "Current Plan".
--   • Wallet/Razorpay upgrade paths: the wallet RPC refuses to charge an
--     already-active subscription with a future end date + payment_provider —
--     set to 'admin_grant' (free-text column, no CHECK constraint) so the
--     no-double-charge guard holds.
--
-- Idempotent: re-running the migration updates the existing grant instead of
-- inserting a duplicate (no UNIQUE constraint exists on subscriptions, so an
-- explicit existence check is used instead of ON CONFLICT).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user_id UUID := 'a84b864f-7dcd-48a6-a10d-1672b54fd451';
  v_end TIMESTAMPTZ := '2099-12-31T23:59:59+00:00'::timestamptz;
BEGIN
  -- Guard: profile must exist (FK would otherwise abort with a generic error).
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'Profile % not found — cannot grant lifetime Premium', v_user_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = v_user_id AND plan_id = 'premium_monthly'
  ) THEN
    UPDATE public.subscriptions
       SET plan = 'pro',
           status = 'active',
           payment_provider = 'admin_grant',
           cancel_at_period_end = false,
           subscription_end_date = v_end,
           expiry_date = v_end,
           updated_at = NOW()
     WHERE user_id = v_user_id AND plan_id = 'premium_monthly';
  ELSE
    INSERT INTO public.subscriptions (
      user_id,
      plan_id,
      plan,
      status,
      payment_provider,
      cancel_at_period_end,
      subscription_start_date,
      subscription_end_date,
      expiry_date,
      updated_at
    ) VALUES (
      v_user_id,
      'premium_monthly',
      'pro',
      'active',
      'admin_grant',
      false,
      NOW(),
      v_end,
      v_end,
      NOW()
    );
  END IF;
END;
$$;
