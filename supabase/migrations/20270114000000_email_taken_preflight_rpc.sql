-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-flight duplicate-email check for the signup form.
--
-- GoTrue runs with anti-enumeration enabled: signing up with an ALREADY-
-- REGISTERED email returns a fake success-shaped user object and silently
-- sends nothing. The real user is left waiting for a confirmation email
-- that never arrives. This RPC lets the signup form catch the duplicate
-- BEFORE calling auth.signup() and show the friendly
-- "This email is already used professionally on Growlancer" message.
--
-- Security notes:
--   • SECURITY DEFINER + locked search_path (auth.users is not readable by
--     end users via RLS/GRANTs) — the function exposes ONLY a boolean.
--   • STABLE (no writes), single indexed lookup on auth.users' unique
--     lower(email) index — cheap and safe to expose to anon.
--   • Executes only for anon (signup form) + authenticated users.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_email_taken(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.email IS NOT NULL
      AND lower(u.email) = lower(nullif(trim(p_email), ''))
  );
$$;

-- Function is boolean-only; restrict default PUBLIC grant to exactly the
-- roles that need it (signup form runs as anon).
REVOKE ALL ON FUNCTION public.is_email_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_taken(text) TO anon, authenticated;
