-- ═══════════════════════════════════════════════════════════════════
-- verify_reauth_status — server-side reauth verification
--
-- The client stores a reauth timestamp in localStorage after a successful
-- password/OTP verification. Before performing a sensitive action, the
-- client sends this timestamp to this RPC. The RPC verifies:
--   (a) The timestamp belongs to the calling user (auth.uid() = p_user_id)
--   (b) The timestamp is within the 10-minute reauth window
--   (c) The timestamp is not in the future
--
-- This prevents an attacker from bypassing reauth by manually setting
-- the localStorage value — the server independently verifies the claim.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.verify_reauth_status(
  p_user_id uuid,
  p_reauth_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid;
  reauth_window_ms constant bigint := 10 * 60 * 1000; -- 10 minutes
BEGIN
  -- 1. Caller must be authenticated
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RETURN false;
  END IF;

  -- 2. Caller must match the user_id (prevent one user from verifying another's reauth)
  IF caller_id != p_user_id THEN
    RETURN false;
  END IF;

  -- 3. Timestamp must not be in the future (clock skew tolerance: 30 seconds)
  IF p_reauth_at > (now() + interval '30 seconds') THEN
    RETURN false;
  END IF;

  -- 4. Timestamp must be within the 10-minute window
  IF p_reauth_at < (now() - (reauth_window_ms || ' milliseconds')::interval) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- Only authenticated users can call this (they verify their OWN reauth status)
GRANT EXECUTE ON FUNCTION public.verify_reauth_status(uuid, timestamptz) TO authenticated;
