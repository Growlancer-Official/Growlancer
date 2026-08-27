-- ═══════════════════════════════════════════════════════════════════════════
-- CRITICAL FIX: Infinite recursion in RLS policies
--
-- Problem: WITH CHECK clauses on profiles and freelancer_profiles used
-- self-referencing SELECTs (SELECT is_pro FROM profiles WHERE id = auth.uid()
-- inside a policy ON profiles), causing infinite recursion.
--
-- Fix:
--   1. Replace recursive WITH CHECK with simple ownership check
--   2. Add BEFORE UPDATE triggers that block privilege column self-escalation
--   3. SECURITY DEFINER functions set 'app.bypass_privilege_check' to bypass
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. PROFILES — fix recursive WITH CHECK
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role IN ('freelancer', 'client')
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 2. FREELANCER_PROFILES — fix recursive WITH CHECK
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Freelancers can update own" ON public.freelancer_profiles;

CREATE POLICY "Freelancers can update own" ON public.freelancer_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Helper: should we bypass privilege checks?
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.should_bypass_privilege_check()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('app.bypass_privilege_check', true)::boolean,
    false
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. BEFORE UPDATE trigger on profiles — block is_pro, verification_status,
--    role→admin self-escalation
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_profiles_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.should_bypass_privilege_check() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_pro IS DISTINCT FROM OLD.is_pro THEN
    RAISE EXCEPTION 'Cannot self-modify is_pro column';
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    RAISE EXCEPTION 'Cannot self-modify verification_status column';
  END IF;

  IF NEW.role = 'admin' AND OLD.role != 'admin' THEN
    RAISE EXCEPTION 'Cannot self-promote to admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_privilege_columns ON public.profiles;
CREATE TRIGGER protect_privilege_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_privilege_columns();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. BEFORE UPDATE trigger on freelancer_profiles — block verification_status,
--    seller_level self-escalation
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_freelancer_profiles_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.should_bypass_privilege_check() THEN
    RETURN NEW;
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    RAISE EXCEPTION 'Cannot self-modify verification_status column';
  END IF;

  IF NEW.seller_level IS DISTINCT FROM OLD.seller_level THEN
    RAISE EXCEPTION 'Cannot self-modify seller_level column';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_privilege_columns ON public.freelancer_profiles;
CREATE TRIGGER protect_privilege_columns
  BEFORE UPDATE ON public.freelancer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_freelancer_profiles_privilege_columns();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Add bypass flag to SECURITY DEFINER functions that modify protected cols
-- ───────────────────────────────────────────────────────────────────────────

-- recompute_seller_level: add set_config before UPDATE (match exact existing signature)
CREATE OR REPLACE FUNCTION public.recompute_seller_level(p_freelancer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_completed INT;
  v_total INT;
  v_completion NUMERIC;
  v_rating NUMERIC;
  v_level TEXT;
BEGIN
  SELECT COUNT(*) INTO v_completed
  FROM public.contracts
  WHERE freelancer_id = p_freelancer_id AND status = 'completed';

  SELECT COUNT(*) INTO v_total
  FROM public.contracts
  WHERE freelancer_id = p_freelancer_id
    AND status IN ('completed', 'cancelled', 'rejected', 'refunded');

  v_completion := CASE WHEN v_total = 0 THEN 100
                       ELSE ROUND((v_completed::NUMERIC / v_total) * 100, 1) END;

  SELECT COALESCE(rating, 0) INTO v_rating
  FROM public.freelancer_profiles
  WHERE user_id = p_freelancer_id;

  v_level := CASE
    WHEN v_rating >= 4.8 AND v_completed >= 50 AND v_completion >= 95 THEN 'top_rated_plus'
    WHEN v_rating >= 4.5 AND v_completed >= 25 AND v_completion >= 90 THEN 'top_rated'
    WHEN v_rating >= 4.0 AND v_completed >= 5 AND v_completion >= 80 THEN 'rising_talent'
    WHEN v_completed >= 1 THEN 'level_1'
    ELSE 'new'
  END;

  -- Bypass BEFORE UPDATE trigger that blocks seller_level self-change
  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  UPDATE public.freelancer_profiles
  SET seller_level = v_level, updated_at = NOW()
  WHERE user_id = p_freelancer_id;

  RETURN v_level;
END;
$function$;

-- kyc_auto_verify_trigger_fn: add set_config before profile/freelancer_profiles updates
CREATE OR REPLACE FUNCTION public.kyc_auto_verify_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role text;
  v_label text;
  v_title text;
  v_message text;
  v_url text;
  v_attempts_left int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.kyc_verify_row(NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.status NOT IN ('verified', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- Bypass BEFORE UPDATE triggers on profiles/freelancer_profiles
  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  IF NEW.status = 'verified' THEN
    UPDATE public.profiles
      SET verification_status = 'verified'
      WHERE id = NEW.user_id;
    UPDATE public.freelancer_profiles
      SET verification_status = 'verified'
      WHERE user_id = NEW.user_id;
  ELSE
    UPDATE public.profiles
      SET verification_status = 'unverified'
      WHERE id = NEW.user_id
        AND verification_status = 'verified';
    UPDATE public.freelancer_profiles
      SET verification_status = 'unverified'
      WHERE user_id = NEW.user_id
        AND verification_status = 'verified';
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
  RETURN NEW;
END;
$function$;

-- grant_admin_role: add set_config before UPDATE
CREATE OR REPLACE FUNCTION public.grant_admin_role(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles_private
    WHERE user_id = auth.uid() AND is_admin = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admins only');
  END IF;

  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  UPDATE public.profiles
  SET role = 'admin', updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.profiles_private (user_id, is_admin)
  VALUES (p_user_id, true)
  ON CONFLICT (user_id) DO UPDATE SET is_admin = true;

  RETURN jsonb_build_object('success', true, 'message', 'Admin role granted');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_admin_role(UUID) FROM authenticated, anon;

-- pay_subscription_with_wallet: add set_config before is_pro UPDATE
-- NOTE: we add the bypass flag to the EXISTING function body.
-- Since we can't surgically edit, we recreate with the bypass added.
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

  IF v_subscription.status = 'active'
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

  -- Bypass BEFORE UPDATE trigger that blocks is_pro self-change
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
