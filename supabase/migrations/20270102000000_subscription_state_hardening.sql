-- ═══════════════════════════════════════════════════════════════════════════
-- SUBSCRIPTION STATE HARDENING (free-Pro bypass + trial-farming fix)
--
-- Problem: subscriptions were created/updated directly from the browser.
--   1. Paid plans were INSERTed with status='active' BEFORE payment, and
--      pay_subscription_with_wallet then refused to charge the already-active
--      row ("no payment required") → free Pro forever.
--   2. Trial re-creation was possible by UPSERTing an old cancelled trial row
--      back to 'trial' with new dates (the trial guard is a BEFORE INSERT
--      trigger, so the UPDATE half of the upsert bypassed it) → unlimited
--      free trials.
--
-- Fix — subscription state is now server-authoritative:
--   1. NO client INSERT policy: subscription rows can only be created by the
--      SECURITY DEFINER RPC `create_user_subscription` (RLS denies direct
--      inserts; the RPC runs as the table owner).
--   2. Client UPDATE policy exists for OWN rows, but a BEFORE UPDATE trigger
--      restricts browser writes to toggling cancel_at_period_end ONLY. Status,
--      plan, dates and payment fields are immutable from the browser.
--      Server-side writers (edge functions/cron: auth.uid() IS NULL) and our
--      own RPCs (which set a session GUC) are unaffected.
--   3. create_user_subscription decides trial vs pending server-side: trial
--      only when the plan offers one, the email is verified, and the user has
--      never used a trial (one per email, ever — trial-history rows are never
--      deleted/overwritten). Paid rows are created 'pending' and only become
--      'active' after real payment (pay_subscription_with_wallet / razorpay
--      verify / webhook capture).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. RLS — SELECT own (already exists); UPDATE own; NO INSERT / DELETE for
--    authenticated. All creation goes through the SECURITY DEFINER RPC.
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can update own subscriptions" ON public.subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Explicitly deny client INSERTs (defence in depth — no policy = denied).
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. BEFORE UPDATE guard — browser sessions may only toggle
--    cancel_at_period_end. Everything else is server-side only.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_subscription_client_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Server-side writers (edge functions / cron / service role) have no user
  -- JWT → auth.uid() IS NULL → always allowed.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Our own SECURITY DEFINER RPCs (create_user_subscription,
  -- pay_subscription_with_wallet) mark the transaction with a session flag so
  -- their internal state transitions are allowed. No client-callable path can
  -- set this flag without running the RPC itself.
  IF current_setting('app.subscription_internal_write', true) = 'internal' THEN
    RETURN NEW;
  END IF;

  -- Otherwise: the browser may ONLY toggle cancel_at_period_end (cancel /
  -- renew). Any change to status / plan / dates / payment fields is rejected.
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.end_date IS DISTINCT FROM OLD.end_date
     OR NEW.subscription_start_date IS DISTINCT FROM OLD.subscription_start_date
     OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date
     OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
     OR NEW.trial_start_date IS DISTINCT FROM OLD.trial_start_date
     OR NEW.trial_end_date IS DISTINCT FROM OLD.trial_end_date
     OR NEW.payment_provider IS DISTINCT FROM OLD.payment_provider
     OR NEW.payment_subscription_id IS DISTINCT FROM OLD.payment_subscription_id
     OR NEW.auto_renew IS DISTINCT FROM OLD.auto_renew THEN
    RAISE EXCEPTION 'Subscription status and billing fields can only be changed by the server after payment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_client_update_guard ON public.subscriptions;
CREATE TRIGGER trg_subscription_client_update_guard
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_subscription_client_update_guard();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. create_user_subscription — server-side creation (trial vs pending).
--    One free trial per email, ever; paid rows start 'pending'.
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
    -- Clear any stale non-trial row for this plan so the fresh INSERT wins
    -- (trial-history rows with trial_start_date are NEVER deleted — that is
    -- what makes "one trial per email, ever" hold).
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
    -- Re-subscribing after cancel reuses the old row via upsert.
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
    -- Conflict row could not be reused (e.g. it is a used-trial row) — fetch
    -- the existing pending/active row for the same plan instead of failing.
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

-- ───────────────────────────────────────────────────────────────────────────
-- 4. pay_subscription_with_wallet — charge rows that were never paid. The
--    already-active refusal now also requires a recorded payment_provider,
--    and the RPC marks the transaction as internal so its status flip passes
--    the update guard.
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
  -- a future end date AND a recorded payment provider. A client-created
  -- 'active' row with no provider (never charged) no longer slips past the
  -- guard — it is charged like a 'pending' row. (With the new RLS posture such
  -- rows can no longer be created by the browser at all — belt and braces.)
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