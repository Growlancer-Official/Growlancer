-- ═══════════════════════════════════════════════════════════════════════
-- MR-29 (EDGE-02): Server-side OTP login attempt limiter
-- ═══════════════════════════════════════════════════════════════════════
-- The OTP login page (src/pages/auth/OtpLoginPage.tsx) previously enforced
-- its "5 attempts" limit ONLY in client React state. That limit resets on
-- page refresh and is entirely bypassable by calling
-- supabase.auth.verifyOtp() directly, so it provided no real protection
-- against OTP brute-forcing.
--
-- The existing `rate_limits` table (20260610130000_rate_limits.sql) is RLS
-- default-deny for anon ("Only the edge functions (service_role) need
-- access; anon users should not query this table directly"), so the browser
-- cannot write to it under RLS. This SECURITY DEFINER RPC gives the anon /
-- authenticated client an atomic, narrowly-scoped way to consume a slot in
-- the limiter WITHOUT exposing the table itself.
--
-- Check semantics: atomically (a) count this identifier's recorded OTP
-- attempts inside the rolling window, then (b) if under budget, record this
-- attempt and return TRUE; otherwise return FALSE. Both steps run in a
-- single function invocation so concurrent guesses cannot race past the cap.
--
-- Window/budget default: 5 attempts / 15 minutes per email — matching the
-- OTP_ATTEMPT_LIMIT=5 client hint the page already displays.
--
-- The client treats an RPC error as fail-open (see OtpLoginPage.tsx), so on
-- a database where this migration has NOT yet been applied the app keeps
-- working and GoTrue's own built-in OTP throttling still applies. This
-- migration is therefore additive and safe to apply independently.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_otp_login_rate_limit(
  p_identifier TEXT,
  p_max INTEGER DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, pg_catalog'
AS $$
DECLARE
  v_attempts INTEGER;
  v_identifier TEXT;
BEGIN
  -- Defensive: an empty/blank identifier cannot be limited — allow.
  IF p_identifier IS NULL OR length(trim(p_identifier)) = 0 THEN
    RETURN true;
  END IF;

  v_identifier := lower(trim(p_identifier));

  -- Count attempts already recorded for this identifier within the rolling
  -- 15-minute window. Lock the matching rows so a concurrent call for the
  -- same identifier serialises with this check.
  SELECT COALESCE(SUM(count), 0)
    INTO v_attempts
    FROM public.rate_limits
   WHERE identifier = v_identifier
     AND route = 'otp-verify'
     AND window_start >= NOW() - INTERVAL '15 minutes'
     FOR UPDATE;

  IF v_attempts >= GREATEST(p_max, 1) THEN
    RETURN false;  -- budget exhausted → rate limited
  END IF;

  -- Record this attempt (count = 1 per row; the index on
  -- (identifier, route, window_start) keeps the lookup fast and the
  -- existing cleanup_expired_rate_limits() prunes rows older than 24h).
  INSERT INTO public.rate_limits (identifier, route, count, window_start)
  VALUES (v_identifier, 'otp-verify', 1, NOW());

  RETURN true;
END;
$$;

-- The browser (anon) must be able to invoke the limiter, but NOT read or
-- write the rate_limits table directly. Only this function is exposed.
GRANT EXECUTE ON FUNCTION public.check_otp_login_rate_limit(TEXT, INTEGER) TO anon, authenticated;

COMMENT ON FUNCTION public.check_otp_login_rate_limit(TEXT, INTEGER) IS
  'MR-29 (EDGE-02): atomic server-side OTP login attempt limiter. Returns true when the attempt is allowed (and records it), false when the per-email window budget (default 5 / 15 min) is exhausted.';
