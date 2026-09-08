-- ═══════════════════════════════════════════════════════════════════════════
-- KYC provider config — admin-managed API token storage (singleton row)
-- Migration 20270111000000
--
-- Lets the founder/admin configure the KYC provider token from the admin
-- panel (no Supabase dashboard/CLI needed) while keeping the token entirely
-- server-side:
--   • kyc_provider_config: singleton table, RLS ENABLED with NO policies →
--     anon/authenticated have ZERO access (deny-all); only service-role
--     (edge functions) bypasses RLS. Token never leaves the backend.
--   • admin_set_kyc_provider_config / admin_clear_kyc_provider_config:
--     SECURITY DEFINER RPCs — caller must be service context OR a verified
--     admin (profiles_private.is_admin, same check as admin-data).
--   • admin_get_kyc_provider_status: returns configured/provider/updated_at
--     ONLY — never the token value itself.
--   • Every set/clear is audited in payment_audit_logs (no token value).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.kyc_provider_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'surepass',
  api_token TEXT,
  configured_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kyc_provider_config ENABLE ROW LEVEL SECURITY;

-- Deny-all for browsers (no policies = no access). Service role bypasses RLS.
REVOKE ALL ON public.kyc_provider_config FROM anon, authenticated;

-- ── Helper: caller must be service context or verified admin ───────────────
CREATE OR REPLACE FUNCTION public.kyc_config_assert_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN TRUE; -- service context (SQL editor / edge function w/ service key)
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles_private
     WHERE id = v_caller AND COALESCE(is_admin, false) = true
  );
END;
$$;

-- ── Set / rotate the provider token ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_kyc_provider_config(
  p_token TEXT,
  p_provider TEXT DEFAULT 'surepass'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF NOT public.kyc_config_assert_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admin access required');
  END IF;

  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token is required');
  END IF;
  IF p_provider NOT IN ('surepass') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported provider');
  END IF;

  INSERT INTO public.kyc_provider_config (id, provider, api_token, configured_by, updated_at)
  VALUES (1, p_provider, btrim(p_token), v_caller, NOW())
  ON CONFLICT (id) DO UPDATE
    SET provider = EXCLUDED.provider,
        api_token = EXCLUDED.api_token,
        configured_by = EXCLUDED.configured_by,
        updated_at = NOW();

  -- Immutable audit entry (never logs the token itself).
  INSERT INTO public.payment_audit_logs (
    user_id, actor_role, action, entity_type, entity_id, provider, amount, currency, metadata
  ) VALUES (
    v_caller, 'admin', 'kyc_provider_token_set', 'kyc_provider_config', '1',
    p_provider, 0, 'INR',
    jsonb_build_object('token_length', length(btrim(p_token)))
  );

  RETURN jsonb_build_object('success', true, 'provider', p_provider, 'configured', true);
END;
$$;

-- ── Clear the token (disables the automated engine — fail-safe review) ──────
CREATE OR REPLACE FUNCTION public.admin_clear_kyc_provider_config()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF NOT public.kyc_config_assert_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admin access required');
  END IF;

  UPDATE public.kyc_provider_config
     SET api_token = NULL, updated_at = NOW()
   WHERE id = 1;

  INSERT INTO public.payment_audit_logs (
    user_id, actor_role, action, entity_type, entity_id, provider, amount, currency, metadata
  ) VALUES (
    v_caller, 'admin', 'kyc_provider_token_cleared', 'kyc_provider_config', '1',
    'surepass', 0, 'INR', '{}'::jsonb
  );

  RETURN jsonb_build_object('success', true, 'configured', false);
END;
$$;

-- ── Status (never returns the token) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_kyc_provider_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.kyc_provider_config%ROWTYPE;
BEGIN
  IF NOT public.kyc_config_assert_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admin access required');
  END IF;

  SELECT * INTO v_row FROM public.kyc_provider_config WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'configured', false, 'provider', 'surepass');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'configured', v_row.api_token IS NOT NULL AND length(btrim(coalesce(v_row.api_token, ''))) > 0,
    'provider', v_row.provider,
    'updated_at', v_row.updated_at
  );
END;
$$;

-- EXECUTE hygiene
REVOKE ALL ON FUNCTION public.kyc_config_assert_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kyc_config_assert_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_kyc_provider_config(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_kyc_provider_config(TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_clear_kyc_provider_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_kyc_provider_config() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_kyc_provider_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kyc_provider_status() TO authenticated, service_role;
