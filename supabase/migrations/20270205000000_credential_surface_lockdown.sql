-- ═══════════════════════════════════════════════════════════════════════════
-- 20270205000000 — Lock the deferred credential surface
--
-- FINDING (release audit, Phase 8 "alternate invocation methods"):
--   20260806000000_credential_verification_portal.sql created
--     credential_verification_tokens, credential_version_history,
--     credential_audit_logs, verification_rate_limits
--   and 20270203100000_reviews_write_path_hardening.sql created
--     reviews_duplicate_archive
--   WITHOUT `ENABLE ROW LEVEL SECURITY` and without revoking the default
--   anon/authenticated table privileges. Nothing else in the migration set
--   enables RLS on them (verified: no ALTER TABLE ... ROW LEVEL SECURITY and
--   no CREATE POLICY references any of the five). PostgREST therefore exposed
--   them directly: QR tokens, admin e-mail/IP audit rows, rate-limit
--   identifiers and archived reviews were readable by any caller holding the
--   public anon key.
--
--   The public verification RPC was an even wider door:
--     verify_credential_by_token(text) is SECURITY DEFINER, granted to anon,
--     and returned `to_jsonb(skill_certifications)` + `to_jsonb(token)` +
--     the COMPLETE `internship_applications` row (applicant PII) to anyone
--     presenting a token. Certificates are deferred from this release and the
--     gated page answers 410, so the RPC was the only live path — and it
--     bypassed the deferral entirely.
--
-- WHY REVOKING IS SAFE:
--   • Every credential RPC is called from src/lib/credentialVerification.ts,
--     which is only reachable from the feature-flagged (OFF) certificates page.
--     No edge function calls these RPCs; admin-data uses table operations with
--     its service-role client.
--   • service_role bypasses RLS and keeps its grants, so admin tooling and any
--     future re-enable can still read/write through a server-side path.
--   • 20270119000012 already made generate_credential_token,
--     insert_credential_audit_log and insert_credential_version admin-only.
--     This migration closes the remaining table-level and public-RPC exposure.
--
-- RE-ENABLING THE MODULE LATER requires a new, PII-minimal public verification
-- function (a token must not return the internship application row) and
-- explicit admin-only policies — not a silent grant restore.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. RLS on every table the credential module created ─────────────────────
ALTER TABLE public.credential_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_version_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_rate_limits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews_duplicate_archive     ENABLE ROW LEVEL SECURITY;

-- ── 2. No client role may touch them directly ──────────────────────────────
-- RLS with zero policies already denies everything, but the table privileges
-- are removed too so a future `CREATE POLICY ... TO authenticated` cannot
-- silently re-open the table without an explicit grant.
REVOKE ALL ON public.credential_verification_tokens FROM anon, authenticated;
REVOKE ALL ON public.credential_version_history    FROM anon, authenticated;
REVOKE ALL ON public.credential_audit_logs         FROM anon, authenticated;
REVOKE ALL ON public.verification_rate_limits      FROM anon, authenticated;
REVOKE ALL ON public.reviews_duplicate_archive     FROM anon, authenticated;

-- Server-side paths keep working (service_role bypasses RLS).
GRANT ALL ON public.credential_verification_tokens TO service_role;
GRANT ALL ON public.credential_version_history    TO service_role;
GRANT ALL ON public.credential_audit_logs         TO service_role;
GRANT ALL ON public.verification_rate_limits      TO service_role;
GRANT ALL ON public.reviews_duplicate_archive     TO service_role;

COMMENT ON TABLE public.credential_audit_logs IS
  'Admin-only credential audit trail. RLS enabled with no client policies; reachable only through the service role.';
COMMENT ON TABLE public.credential_verification_tokens IS
  'QR tokens for the deferred credential module. RLS enabled with no client policies; service role only.';
COMMENT ON TABLE public.reviews_duplicate_archive IS
  'Internal archive of duplicate reviews moved aside by 20270203100000. Service role only.';

-- ── 3. Close the unauthenticated PII path ─────────────────────────────────
-- The early-access public route returns 410 without reading a row. This RPC
-- was the alternate path and returned the full internship application row.
REVOKE EXECUTE ON FUNCTION public.verify_credential_by_token(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.verify_credential_by_token(text) TO service_role;

COMMENT ON FUNCTION public.verify_credential_by_token(text) IS
  'Service-role only while the certificate module is deferred (early access). Do not re-grant to anon before removing the intern-application payload.';
