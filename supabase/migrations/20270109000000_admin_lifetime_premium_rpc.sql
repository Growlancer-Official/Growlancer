-- ═══════════════════════════════════════════════════════════════════════════
-- Admin lifetime-Premium grant/revoke RPCs (founder comp, repeatable)
--
-- Replaces the one-off migration approach with a secure, auditable, callable
-- mechanism. The founder/admin decides the recipient by EMAIL — no payment,
-- no trial, no charge is ever involved.
--
-- SECURITY MODEL (consistent with codebase conventions):
--   • Caller check (server-side, never client-trusted):
--       - auth.uid() IS NULL  → service context only (SQL editor / edge
--         functions with the service key / migrations). Anon and
--         authenticated browsers always carry a JWT, so they can NEVER hit
--         this path.
--       - auth.uid() IS NOT NULL → caller must have profiles_private.is_admin
--         = true (same flag the admin-data edge function verifies).
--   • Function is SECURITY DEFINER but only acts on the email-resolved target;
--     it can never grant to the CALLER's chosen id without resolving it to a
--     real auth.users row first (no IDOR — ids come from the DB, not input).
--   • Idempotent: re-granting returns already_granted=true, never duplicates.
--   • Supersedes other active/trial subscription rows of the target so the
--     billing cron can never attempt a REAL charge on top of a comp grant.
--   • is_pro badge flips automatically via sync_profile_pro_flag trigger.
--   • Full audit trail in payment_audit_logs (immutable — no UPDATE policy).
--   • EXECUTE restricted: anon/public revoked; authenticated (admin-checked
--     inside) and service_role allowed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. GRANT lifetime Premium by email
-- ───────────────────────────────────────────────────────────────────────────
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
    -- Fallback: profiles_private email map (handles edge provisioning gaps).
    SELECT id INTO v_target_user
      FROM public.profiles_private
     WHERE lower(email) = lower(btrim(p_email))
     LIMIT 1;
  END IF;

  IF v_target_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No account found with that email');
  END IF;

  -- (3) Idempotency — never duplicate a lifetime grant.
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

  -- (5) Insert the lifetime grant (status='active' → trial guard skipped;
  --     is_pro flips via sync_profile_pro_flag AFTER INSERT trigger).
  INSERT INTO public.subscriptions (
    user_id, plan_id, plan, status, payment_provider,
    cancel_at_period_end, subscription_start_date,
    subscription_end_date, expiry_date, updated_at
  ) VALUES (
    v_target_user, 'premium_monthly', 'pro', 'active', 'admin_grant',
    false, NOW(), v_end, v_end, NOW()
  ) RETURNING id INTO v_sub_id;

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

-- ───────────────────────────────────────────────────────────────────────────
-- 2. REVOKE lifetime Premium by email (undo path — grant must be reversible)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_revoke_lifetime_premium(p_email TEXT)
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
  v_revoked_count INT := 0;
BEGIN
  IF v_caller IS NOT NULL THEN
    SELECT COALESCE(is_admin, false) INTO v_is_admin
      FROM public.profiles_private
     WHERE id = v_caller;
    IF NOT v_is_admin THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Unauthorized: admin access required');
    END IF;
  END IF;

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

  UPDATE public.subscriptions
     SET status = 'cancelled',
         cancel_at_period_end = false,
         updated_at = NOW()
   WHERE user_id = v_target_user
     AND payment_provider = 'admin_grant'
     AND status = 'active';
  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  IF v_revoked_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error',
      'No active lifetime grant found for that email');
  END IF;

  INSERT INTO public.payment_audit_logs (
    user_id, actor_role, action, entity_type, entity_id, provider,
    amount, currency, metadata
  ) VALUES (
    v_target_user, 'admin', 'lifetime_premium_revoked', 'subscription',
    NULL, 'admin_grant', 0, 'INR',
    jsonb_build_object(
      'revoked_by', v_caller,
      'target_email', v_target_email,
      'rows_cancelled', v_revoked_count
    )
  );

  -- is_pro flips to false automatically via sync_profile_pro_flag trigger.

  RETURN jsonb_build_object(
    'success', true,
    'revoked', v_revoked_count,
    'user_id', v_target_user,
    'email', v_target_email
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. EXECUTE hygiene: PUBLIC/anon revoked; authenticated (admin-checked
--    inside the function) and service_role allowed.
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_grant_lifetime_premium(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_lifetime_premium(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_lifetime_premium(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_lifetime_premium(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_revoke_lifetime_premium(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_lifetime_premium(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_lifetime_premium(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_lifetime_premium(TEXT) TO service_role;
