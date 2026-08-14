-- =============================================================================
-- 20261216000000_browser_marker_email_check.sql
-- =============================================================================
-- Lets the client validate that the email recorded in the same-browser marker
-- (growlancer_browser_account_v1) STILL has a real account. If the user deleted
-- that account, the client clears the stale marker and stops showing the
-- "Account already exists on this browser" banner for unrelated signups.
--
-- Returns only a boolean — never leaks emails, user IDs, or other data.
-- SECURITY DEFINER so it can read auth.users (which RLS cannot), with a tight
-- search_path. anon + authenticated can call it (boolean-only answer is safe).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.email_account_exists(p_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
BEGIN
  IF v_email = '' OR v_email NOT LIKE '%@%' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.email_account_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_account_exists(text) TO authenticated, anon, service_role;
