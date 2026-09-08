-- ═══════════════════════════════════════════════════════════════════════════
-- KYC verification mode switch — development / production
-- Migration 20270112000000
--
-- The founder asked for instant real-time verification WITHOUT an external
-- provider until revenue starts. That conflicts with "no fake KYC" unless it
-- is an EXPLICIT, clearly-labelled development mode (spec section 16):
--   • Development mode CAN be used only as a clearly separated mode that is
--     impossible to activate accidentally in production.
--   • Production must fail safely rather than falsely marking users verified.
--
-- This migration adds `mode` to kyc_provider_config:
--   • 'production' (DEFAULT)  → no fake verification. Without a configured
--     provider token, submissions fail-safe into review. With a token, the
--     real provider runs. 
--   • 'development'           → deterministic automated verification
--     (format + email + duplicate checks) with provider='dev_mode' recorded
--     honestly on every row, so the audit trail can never be confused with a
--     real provider verdict — and those users can later be re-verified for
--     real when a provider is configured.
--
-- The switch is admin-only (same server-side is_admin pattern), audited in
-- payment_audit_logs, and the status RPC surfaces the current mode so the
-- admin panel always shows which mode the platform is in.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path = '';

-- ── Mode column (default = production = fail-safe) ──────────────────────────
ALTER TABLE public.kyc_provider_config
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'production'
  CHECK (mode IN ('production', 'development'));

-- ── Set mode (admin-only, audited) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_kyc_mode(p_mode TEXT)
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

  IF p_mode NOT IN ('production', 'development') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mode must be "production" or "development"');
  END IF;

  INSERT INTO public.kyc_provider_config (id, provider, mode, updated_at)
  VALUES (1, 'surepass', p_mode, NOW())
  ON CONFLICT (id) DO UPDATE
    SET mode = EXCLUDED.mode,
        updated_at = NOW();

  INSERT INTO public.payment_audit_logs (
    user_id, actor_role, action, entity_type, entity_id, provider, amount, currency, metadata
  ) VALUES (
    v_caller, 'admin', 'kyc_mode_set', 'kyc_provider_config', '1',
    'surepass', 0, 'INR',
    jsonb_build_object('mode', p_mode)
  );

  RETURN jsonb_build_object('success', true, 'mode', p_mode);
END;
$$;

-- ── Status now also reports the active mode (never the token) ───────────────
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
    RETURN jsonb_build_object(
      'success', true,
      'configured', false,
      'provider', 'surepass',
      'mode', 'production'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'configured', v_row.api_token IS NOT NULL AND length(btrim(coalesce(v_row.api_token, ''))) > 0,
    'provider', v_row.provider,
    'mode', v_row.mode,
    'updated_at', v_row.updated_at
  );
END;
$$;

-- EXECUTE hygiene
REVOKE ALL ON FUNCTION public.admin_set_kyc_mode(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_kyc_mode(TEXT) TO authenticated, service_role;