-- ====================================================================
-- pay_subscription_with_wallet
-- Atomic wallet → Pro subscription payment.
-- Runs in a single transaction: ownership check → server-side plan
-- price → locked balance check → deduction (negative-balance guarded)
-- → ledger entry → subscription activation → profiles.is_pro sync.
--
-- SECURITY DEFINER: caller's JWT (auth.uid()) must own the subscription.
-- Called by the razorpay edge function action `wallet_subscription_pay`.
-- ====================================================================

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

  -- Lock + load the subscription row (prevents double-pay races)
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

  -- Server-side plan price — never trust a client-supplied amount
  SELECT * INTO v_plan
  FROM public.subscription_plans
  WHERE id = v_subscription.plan_id;

  IF NOT FOUND OR COALESCE(v_plan.price, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'This plan is free — no payment required');
  END IF;

  -- Ensure the wallet row exists
  INSERT INTO public.wallets (user_id) VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Atomic deduction with a negative-balance guard (single UPDATE + RETURNING)
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

  -- Fresh billing period (monthly default, yearly when interval = year)
  v_interval := COALESCE(v_plan.interval, 'month');
  v_end_date := NOW() + CASE WHEN v_interval = 'year' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END;

  -- Activate the subscription
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

  -- Ledger entry (RLS bypassed by SECURITY DEFINER)
  INSERT INTO public.transactions (user_id, type, amount, currency, status, description, source, metadata)
  VALUES (
    v_user_id,
    'debit',
    v_plan.price,
    'INR',
    'completed',
    v_plan.name || ' subscription payment',
    'wallet',
    jsonb_build_object('plan_id', v_plan.id, 'subscription_id', p_subscription_id)
  );

  -- Sync the profile Pro flag so the PRO badge shows instantly everywhere
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

-- Only the authenticated user can execute (the function re-validates ownership)
REVOKE EXECUTE ON FUNCTION public.pay_subscription_with_wallet(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_subscription_with_wallet(UUID) TO authenticated;
