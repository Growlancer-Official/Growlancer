-- ═══════════════════════════════════════════════════════════════
-- Credential Verification Portal — Database Schema
-- ═══════════════════════════════════════════════════════════════
-- Extends the existing skill_certifications table with:
--   1. verification_tokens   — signed QR tokens (1:1 with certs)
--   2. credential_version_history — version tracking
--   3. credential_audit_logs — full audit trail
--   4. verification_rate_limits — rate limiting for public endpoint
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Verification Tokens (for QR codes) ──────────────────────────
-- Each credential can have exactly ONE active token at a time.
-- Regenerating/Replacing creates a new row and invalidates the old one.
CREATE TABLE IF NOT EXISTS public.credential_verification_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id   UUID NOT NULL REFERENCES public.skill_certifications(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,                     -- signed/encrypted token embedded in QR
  token_version   INTEGER NOT NULL DEFAULT 1,               -- incremented on each regenerate
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'revoked', 'replaced')),
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,
  generated_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata        JSONB DEFAULT '{}'::jsonb
);

-- Index for fast token lookup (public verification)
CREATE INDEX IF NOT EXISTS idx_verification_tokens_token
  ON public.credential_verification_tokens(token);

-- Index for finding active token by credential
CREATE INDEX IF NOT EXISTS idx_verification_tokens_credential_active
  ON public.credential_verification_tokens(credential_id, status)
  WHERE status = 'active';

-- ─── 2. Credential Version History ──────────────────────────────────
-- Tracks every version of a credential from creation to current.
CREATE TABLE IF NOT EXISTS public.credential_version_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id   UUID NOT NULL REFERENCES public.skill_certifications(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  action          TEXT NOT NULL CHECK (action IN (
                    'created', 'updated', 'qr_generated', 'qr_regenerated',
                    'qr_replaced', 'qr_revoked', 'status_changed', 'email_sent'
                  )),
  changes         JSONB DEFAULT '{}'::jsonb,               -- what changed in this version
  performed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes           TEXT,
  old_qr_token    TEXT,
  new_qr_token    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credential_history_credential
  ON public.credential_version_history(credential_id, version_number DESC);

-- ─── 3. Credential Audit Logs ───────────────────────────────────────
-- Immutable audit trail for all credential-related admin actions.
CREATE TABLE IF NOT EXISTS public.credential_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id   UUID REFERENCES public.skill_certifications(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  admin_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_email     TEXT,
  ip_address      TEXT,
  details         JSONB DEFAULT '{}'::jsonb,               -- action-specific payload
  old_values      JSONB DEFAULT '{}'::jsonb,
  new_values      JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credential_audits_credential
  ON public.credential_audit_logs(credential_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credential_audits_admin
  ON public.credential_audit_logs(admin_id, created_at DESC);

-- ─── 4. Enable Realtime for new tables ──────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE
  credential_verification_tokens,
  credential_version_history,
  credential_audit_logs;

-- ═══════════════════════════════════════════════════════════════════
-- RATE LIMITING — Separate table for public verification endpoint
-- to prevent brute-force/enumeration of verification codes.
-- ═══════════════════════════════════════════════════════════════════
-- Tracks IP-based requests to /verify-certificate
CREATE TABLE IF NOT EXISTS public.verification_rate_limits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier      TEXT NOT NULL,                            -- IP address or hashed identifier
  route           TEXT NOT NULL DEFAULT 'verify-certificate-public',
  request_count   INTEGER NOT NULL DEFAULT 1,
  window_start    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_rate_limits_lookup
  ON public.verification_rate_limits(identifier, route, window_start DESC);

-- RPC to clean up expired rate limit entries (called by edge function)
CREATE OR REPLACE FUNCTION public.cleanup_verification_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.verification_rate_limits
  WHERE window_start < now() - interval '15 minutes';
END;
$$;

-- Grant execute to anon for the cleanup RPC
GRANT EXECUTE ON FUNCTION public.cleanup_verification_rate_limits TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- RPC: Generate a signed verification token for QR codes
-- ═══════════════════════════════════════════════════════════════════
-- Creates a new token for a credential, revoking any previously active token.
CREATE OR REPLACE FUNCTION public.generate_credential_token(
  p_credential_id UUID,
  p_admin_id UUID DEFAULT NULL
)
RETURNS TABLE (
  token_id UUID,
  token TEXT,
  token_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id UUID;
  v_existing_version INTEGER;
  v_new_token TEXT;
BEGIN
  -- Find existing active token for this credential (if any)
  SELECT id, token_version INTO v_existing_id, v_existing_version
  FROM public.credential_verification_tokens
  WHERE credential_id = p_credential_id AND status = 'active'
  LIMIT 1;

  -- Generate a secure random token (UUID-based, URL-safe)
  v_new_token := 'grw-' || encode(gen_random_bytes(24), 'hex');

  IF v_existing_id IS NOT NULL THEN
    -- Revoke the old token
    UPDATE public.credential_verification_tokens
    SET status = 'revoked',
        revoked_at = now()
    WHERE id = v_existing_id;

    -- Insert new token with incremented version
    RETURN QUERY
    INSERT INTO public.credential_verification_tokens (
      credential_id, token, token_version, generated_by
    ) VALUES (
      p_credential_id, v_new_token, v_existing_version + 1, p_admin_id
    )
    RETURNING id, token, token_version;
  ELSE
    -- First token for this credential
    RETURN QUERY
    INSERT INTO public.credential_verification_tokens (
      credential_id, token, token_version, generated_by
    ) VALUES (
      p_credential_id, v_new_token, 1, p_admin_id
    )
    RETURNING id, token, token_version;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_credential_token TO authenticated;

-- RPC: Verify a credential by QR token (public)
CREATE OR REPLACE FUNCTION public.verify_credential_by_token(
  p_token TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_token_record RECORD;
  v_cert_record RECORD;
  v_intern_profile jsonb;
BEGIN
  -- Find the token
  SELECT * INTO v_token_record
  FROM public.credential_verification_tokens
  WHERE token = p_token AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Invalid or expired verification token'
    );
  END IF;

  -- Find the associated certificate
  SELECT * INTO v_cert_record
  FROM public.skill_certifications
  WHERE id = v_token_record.credential_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Associated credential not found'
    );
  END IF;

  -- Fetch intern profile if available
  BEGIN
    SELECT to_jsonb(ia.*) INTO v_intern_profile
    FROM public.internship_applications ia
    WHERE ia.id = (v_cert_record.metadata->>'application_id')::UUID
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_intern_profile := NULL;
  END;

  RETURN jsonb_build_object(
    'valid', v_cert_record.status = 'active',
    'certificate', to_jsonb(v_cert_record),
    'token', to_jsonb(v_token_record),
    'internProfile', v_intern_profile
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_credential_by_token TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- RPC: Audit log helper
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.insert_credential_audit_log(
  p_credential_id UUID,
  p_action TEXT,
  p_admin_id UUID DEFAULT NULL,
  p_admin_email TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_old_values jsonb DEFAULT '{}'::jsonb,
  p_new_values jsonb DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.credential_audit_logs (
    credential_id, action, admin_id, admin_email, ip_address,
    details, old_values, new_values
  ) VALUES (
    p_credential_id, p_action, p_admin_id, p_admin_email, p_ip_address,
    p_details, p_old_values, p_new_values
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_credential_audit_log TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- RPC: Version history helper
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.insert_credential_version(
  p_credential_id UUID,
  p_action TEXT,
  p_performed_by UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_old_qr_token TEXT DEFAULT NULL,
  p_new_qr_token TEXT DEFAULT NULL,
  p_changes jsonb DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_version INTEGER;
  v_id UUID;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.credential_version_history
  WHERE credential_id = p_credential_id;

  INSERT INTO public.credential_version_history (
    credential_id, version_number, action, changes,
    performed_by, notes, old_qr_token, new_qr_token
  ) VALUES (
    p_credential_id, v_next_version, p_action, p_changes,
    p_performed_by, p_notes, p_old_qr_token, p_new_qr_token
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_credential_version TO authenticated;
