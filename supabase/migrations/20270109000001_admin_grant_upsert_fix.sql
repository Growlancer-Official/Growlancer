-- ═══════════════════════════════════════════════════════════════════════════
-- HOTFIX: admin_grant_lifetime_premium re-grant after revoke
--
-- Live test surfaced: subscriptions carries a UNIQUE constraint
-- (user_id, plan_id) — subscriptions_user_plan_unique. After a revoke the
-- row still exists (status='cancelled'), so the grant RPC's plain INSERT
-- violates the constraint. The grant must UPSERT on that key instead:
-- re-activate any existing row for (user_id, premium_monthly) regardless of
-- its current status, and only INSERT when no row exists at all.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_grant_lifetime_premium(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_admin BOOLEAN := false;
  v_target_user UUID;
  v_target_email TEXT;
  v_existing RECORD;
  v_sub_id UUID;
  v_end TIMESTAMPTZ := '2099-12-31T23:59:59+00:00'::timestamptz;
BEGIN
  -- (1) Caller verification — service context OR verified admin only.
  IF v_caller IS NOT NULL THEN
    SELECT COALESCE(is_admin, false) INTO v_is_admin
      FROM public.profiles_private
     WHERE id = v_caller;
    IF NOT v_is_admin THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Unauthorized: admin access required');
    END IF;
  END IF;

  -- (2) Resolve the target STRICTLY by email → real auth user id.
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email is required');
  END IF;

  SELECT id, lower(email) INTO v_target_user, v_target_email
    FROM auth.users
   WHERE lower(email) = lower(btrim(p_email))
   LIMIT 1;

  IF v_target_user IS NULL THEN
    SELECT id INTO v_target_user
      FROM public.profiles_private
     WHERE lower(email) = lower(btrim(p_email))
     LIMIT 1;
  END IF;

  IF v_target_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No account found with that email');
  END IF;

  -- (3) Idempotency — never duplicate an ACTIVE lifetime grant.
  SELECT * INTO v_existing
    FROM public.subscriptions
   WHERE user_id = v_target_user
     AND plan_id = 'premium_monthly'
     AND payment_provider = 'admin_grant'
     AND status = 'active'
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_granted', true,
      'subscription_id', v_existing.id,
      'user_id', v_target_user,
      'email', v_target_email,
      'end_date', v_existing.subscription_end_date
    );
  END IF;

  -- (4) Supersede other active/trial rows so the billing cron can never
  --     attempt a charge (trial→paid conversion or renewal) on this user.
  UPDATE public.subscriptions
     SET status = 'cancelled',
         updated_at = NOW()
   WHERE user_id = v_target_user
     AND status IN ('active', 'trial')
     AND payment_provider IS DISTINCT FROM 'admin_grant';

  -- (5) UPSERT on the (user_id, plan_id) unique key: re-activate a
  --     previously cancelled/other-status row, INSERT only if none exists.
  --     status='active' → trial guard skipped; is_pro flips via
  --     sync_profile_pro_flag trigger.
  UPDATE public.subscriptions
     SET plan = 'pro',
         status = 'active',
         payment_provider = 'admin_grant',
         cancel_at_period_end = false,
         subscription_start_date = COALESCE(subscription_start_date, NOW()),
         subscription_end_date = v_end,
         expiry_date = v_end,
         updated_at = NOW()
   WHERE user_id = v_target_user
     AND plan_id = 'premium_monthly'
   RETURNING id INTO v_sub_id;

  IF v_sub_id IS NULL THEN
    INSERT INTO public.subscriptions (
      user_id, plan_id, plan, status, payment_provider,
      cancel_at_period_end, subscription_start_date,
      subscription_end_date, expiry_date, updated_at
    ) VALUES (
      v_target_user, 'premium_monthly', 'pro', 'active', 'admin_grant',
      false, NOW(), v_end, v_end, NOW()
    ) RETURNING id INTO v_sub_id;
  END IF;

  -- (6) Immutable audit entry.
  INSERT INTO public.payment_audit_logs (
    user_id, actor_role, action, entity_type, entity_id, provider,
    amount, currency, metadata
  ) VALUES (
    v_target_user, 'admin', 'lifetime_premium_grant', 'subscription',
    v_sub_id::text, 'admin_grant', 0, 'INR',
    jsonb_build_object(
      'granted_by', v_caller,
      'target_email', v_target_email,
      'plan_id', 'premium_monthly',
      'end_date', v_end,
      'billing', 'none — founder comp, never charged'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_granted', false,
    'subscription_id', v_sub_id,
    'user_id', v_target_user,
    'email', v_target_email,
    'end_date', v_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_lifetime_premium(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_lifetime_premium(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_lifetime_premium(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_lifetime_premium(TEXT) TO service_role;
