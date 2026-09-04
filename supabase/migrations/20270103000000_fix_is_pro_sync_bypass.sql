-- ═══════════════════════════════════════════════════════════════════════════
-- HOTFIX: is_pro sync bypass (live regression found in E2E verification)
--
-- Root cause: profiles has a BEFORE UPDATE guard (protect_profiles_privilege_columns,
-- migration 20270101000006) that raises on ANY is_pro change unless the
-- transaction carries app.bypass_privilege_check=true — a flag that is only
-- ever set inside legitimate SECURITY DEFINER functions (recompute_seller_level,
-- kyc_auto_verify, grant_admin_role, pay_subscription_with_wallet, onboarding).
--
-- Two callers were never given the flag, so every real PRO-badge flip aborted:
--   1. sync_profile_pro_flag() (migration 20261120000000) — the AFTER
--      INSERT/UPDATE/DELETE recompute on subscriptions. It fires whenever a
--      subscription becomes 'trial'/'active' (razorpay/paypal activation,
--      create_user_subscription trial grant, wallet pay) or leaves them (cron
--      expiry, cancellation) — i.e. the ONLY path that keeps profiles.is_pro
--      honest. Because the guard raised inside it, the whole subscription
--      statement rolled back: paid activation failed, and expired subscriptions
--      could never clear the PRO badge (the exact bug 20261120000000 was built
--      to fix).
--   2. pay_subscription_with_wallet — the 20270101000000 rewrite dropped the
--      bypass flag the 20270101000006 version had set before its explicit
--      `UPDATE profiles SET is_pro = true`, so wallet-based activation also
--      aborted after a successful debit.
--
-- Fix (consistent with the codebase pattern): set the bypass flag inside the
-- two SECURITY DEFINER functions right before their legitimate is_pro writes,
-- and revoke PUBLIC EXECUTE on the sync helpers (users must not invoke a
-- definer-owner recompute with an arbitrary user id).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. sync_profile_pro_flag — set the bypass flag before the is_pro recompute.
--    SECURITY DEFINER, recomputes is_pro from the authoritative subscriptions
--    row; safe by construction (a user cannot create subscription rows, so the
--    recompute can never grant a badge the server has not granted).
-- ───────────────────────────────────────────────────────────────────────────
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

  -- Bypass the profiles BEFORE UPDATE guard: this is a server-side recompute
  -- from the authoritative subscriptions row, not a self-modification.
  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  UPDATE public.profiles
     SET is_pro = v_is_pro
   WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_pro_flag(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_profile_pro_flag(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_pro_flag(UUID) TO service_role;

-- Same grant hygiene for the trigger wrapper (called by the DB only).
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

REVOKE ALL ON FUNCTION public.sync_profile_pro_flag_trigger_fn() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_profile_pro_flag_trigger_fn() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_pro_flag_trigger_fn() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. pay_subscription_with_wallet — restore the bypass flag dropped in the
--    20270102000000 rewrite (the 20270101000006 version had it). Body is
--    otherwise identical to the deployed 20270102000000 version.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pay_subscription_with_wallet(p_subscription_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_subscription RECORD;
  v_plan RECORD;
  v_balance NUMERIC;
  v_end_date TIMESTAMPTZ;
  v_interval TEXT;
BEGIN
  PERFORM set_config('app.subscription_internal_write', 'internal', true);

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
  END IF;

  IF v_subscription.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You do not own this subscription');
  END IF;

  -- Payable states only.
  IF v_subscription.status NOT IN ('pending', 'trial', 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription is not in a payable state');
  END IF;

  -- Already-paid guard: refuse to charge an ACTIVE subscription that carries
  -- a future end date AND a recorded payment provider.
  IF v_subscription.status = 'active'
     AND v_subscription.payment_provider IS NOT NULL
     AND COALESCE(v_subscription.subscription_end_date, v_subscription.expiry_date) > NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription is already active — no payment required');
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_subscription.plan_id;

  IF NOT FOUND OR COALESCE(v_plan.price, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'This plan is free — no payment required');
  END IF;

  INSERT INTO public.wallets (user_id) VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
  SET balance = balance - v_plan.price,
      updated_at = NOW()
  WHERE user_id = v_user_id AND balance >= v_plan.price
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_user_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient wallet balance',
      'balance', v_balance,
      'required', v_plan.price
    );
  END IF;

  v_interval := COALESCE(v_plan.interval, 'month');
  v_end_date := NOW() + CASE WHEN v_interval = 'year' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END;

  UPDATE public.subscriptions
  SET status = 'active',
      plan = 'pro',
      payment_provider = 'wallet',
      cancel_at_period_end = false,
      subscription_start_date = NOW(),
      subscription_end_date = v_end_date,
      expiry_date = v_end_date,
      updated_at = NOW()
  WHERE id = p_subscription_id;

  INSERT INTO public.transactions (user_id, type, amount, currency, status, description, source, metadata)
  VALUES (
    v_user_id,
    'debit',
    v_plan.price,
    'INR',
    'completed',
    v_plan.name || ' subscription payment',
    'subscription',
    jsonb_build_object('plan_id', v_plan.id, 'subscription_id', p_subscription_id)
  );

  -- Bypass the profiles BEFORE UPDATE guard: is_pro is being set by this RPC
  -- only after a real wallet debit (the guard exists to stop users flipping
  -- their own flag with a plain UPDATE, not server-side post-payment writes).
  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  UPDATE public.profiles SET is_pro = true WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'balance', v_balance,
    'amount', v_plan.price,
    'plan', v_plan.name
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_subscription_with_wallet(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_subscription_with_wallet(UUID) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. create_user_subscription — add the same bypass flag for consistency and
--    forward-safety (its trial/active transitions flip is_pro via the sync
--    trigger, which now handles the flag itself, but the RPC must also be
--    self-sufficient if that recompute ever changes shape). Body otherwise
--    identical to the deployed 20270102000000 version.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_user_subscription(p_plan_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan RECORD;
  v_email TEXT;
  v_confirmed_at TIMESTAMPTZ;
  v_used_trial BOOLEAN;
  v_is_trial BOOLEAN;
  v_trial_end TIMESTAMPTZ;
  v_sub_id UUID;
BEGIN
  PERFORM set_config('app.subscription_internal_write', 'internal', true);
  -- Bypass the profiles privilege guard for server-driven is_pro recomputes
  -- fired by the subscriptions sync trigger inside this RPC.
  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = p_plan_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription plan not found or inactive');
  END IF;

  SELECT email, email_confirmed_at INTO v_email, v_confirmed_at
  FROM auth.users WHERE id = v_user_id;

  -- Cancel any existing live row first (one live subscription per user).
  UPDATE public.subscriptions
  SET status = 'cancelled', cancel_at_period_end = true, updated_at = now()
  WHERE user_id = v_user_id AND status IN ('active', 'trial');

  -- Trial eligibility: plan offers one + verified email + never used one.
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = v_user_id AND trial_start_date IS NOT NULL
  ) INTO v_used_trial;

  v_is_trial := v_plan.trial_days > 0 AND v_confirmed_at IS NOT NULL AND NOT v_used_trial;

  IF v_is_trial THEN
    DELETE FROM public.subscriptions
    WHERE user_id = v_user_id AND plan_id = p_plan_id
      AND trial_start_date IS NULL
      AND status IN ('cancelled', 'expired', 'past_due', 'pending');

    -- 60s margin: the INSERT-time trial guard rejects
    -- trial_end_date > now() + trial_days.
    v_trial_end := now() + (v_plan.trial_days || ' days')::interval - interval '60 seconds';

    INSERT INTO public.subscriptions (
      user_id, plan_id, plan, status, start_date,
      trial_start_date, trial_end_date, cancel_at_period_end
    ) VALUES (
      v_user_id, p_plan_id, 'pro', 'trial', now(),
      now(), v_trial_end, false
    )
    ON CONFLICT (user_id, plan_id) DO NOTHING
    RETURNING id INTO v_sub_id;
  ELSE
    -- Paid path: 'pending' — payment (wallet/Razorpay) flips it to 'active'.
    IF COALESCE(v_plan.price, 0) <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'This plan requires payment and is not available through this flow');
    END IF;

    INSERT INTO public.subscriptions (
      user_id, plan_id, plan, status, start_date, cancel_at_period_end
    ) VALUES (
      v_user_id, p_plan_id, 'pro', 'pending', now(), false
    )
    ON CONFLICT (user_id, plan_id) DO UPDATE SET
      status = 'pending',
      cancel_at_period_end = false,
      start_date = now(),
      updated_at = now()
    RETURNING id INTO v_sub_id;
  END IF;

  IF v_sub_id IS NULL THEN
    SELECT id INTO v_sub_id
    FROM public.subscriptions
    WHERE user_id = v_user_id AND plan_id = p_plan_id
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object('success', true, 'subscription_id', v_sub_id, 'trial', v_is_trial);
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_subscription(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_subscription(TEXT) TO authenticated;
