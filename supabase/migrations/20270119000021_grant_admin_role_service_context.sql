-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: grant_admin_role must accept the service-role context
--
-- Found while seeding the E2E admin account through the admin API (2026-09-26):
-- the RPC answered {"success": false, "error": "Unauthorized: admins only"} with
-- HTTP 200, so the seed printed `admin-role=200` while profiles_private.is_admin
-- stayed false. The authenticated admin sweep would then have rendered the admin
-- LOGIN screen for a signed-in non-admin and audited that surface — a green
-- result over pages nobody was allowed to see (the false-green shape the
-- 20270119000018 helper exists to kill).
--
-- Why a service-role branch is the correct fix rather than a one-off bypass
-- migration (which is how the account was flagged before CI started seeding it):
--   * the service key is already fully privileged — it can write the flag
--     directly, so this does not widen anyone's reach;
--   * the guard's purpose is to stop a REGULAR user from self-promoting, and
--     that check (auth.uid() must be an existing admin) stays exactly as strict;
--   * without the branch the only working paths are direct table writes, which
--     the privilege trigger (20270119000013) blocks by design — i.e. the guard
--     was forcing operators onto the unsafe path.
-- is_service_role_context() probes both service-role idioms (20270119000018) so
-- this cannot rot into the legacy-claim failure that 20270119000018 fixed.
--
-- VERIFIED before writing this file (live DB, rolled-back transaction):
--   ctx_before=false | ctx_after_set=true
--   grant={"error": "Unauthorized: admins only", "success": false}   ← before
--   is_admin_now=false
-- The after-state control (grant={"success": true}, is_admin_now=true) is
-- re-run with the same harness once this migration is applied.
--
-- In-migration controls (static, because a functional call would have to write
-- the flag and commit): the function resolves by OID (never by a guessed
-- arglist — 20270119000021's predecessor failed exactly that way), service_role
-- holds EXECUTE on it, and the guard still contains the admin check. The
-- functional controls live where they cannot lie: the seed reads is_admin back
-- through REST and fails the step, and the deploy pentest re-proves that a
-- non-admin caller is still refused.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.grant_admin_role(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service-role callers are the platform itself (admin API / CI seeding); a
  -- regular caller must still be an existing admin.
  IF NOT (
    public.is_service_role_context()
    OR EXISTS (
      SELECT 1 FROM public.profiles_private
      WHERE id = auth.uid() AND is_admin = true
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admins only');
  END IF;

  PERFORM set_config('app.bypass_privilege_check', 'true', true);

  UPDATE public.profiles
  SET role = 'admin', updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.profiles_private (id, is_admin)
  VALUES (p_user_id, true)
  ON CONFLICT (id) DO UPDATE SET is_admin = true, updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Admin role granted');
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- Assertions — fail the deploy if the fix is not actually in place.
-- ────────────────────────────────────────────────────────────────────────────
DO $assert$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  -- Resolve by name + argcount through pg_proc: guessing an argument list has
  -- already produced a fail-closed assertion that was simply wrong (42883).
  SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'grant_admin_role'
     AND p.pronargs = 1;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'grant_admin_role(uuid) not found';
  END IF;

  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute grant_admin_role — CI seeding would fail closed';
  END IF;

  v_def := pg_get_functiondef(v_oid);
  IF v_def NOT LIKE '%is_service_role_context()%' THEN
    RAISE EXCEPTION 'grant_admin_role does not probe the service-role context';
  END IF;
  IF v_def NOT LIKE '%is_admin = true%' THEN
    RAISE EXCEPTION 'grant_admin_role lost its admin-only check — regular callers could self-promote';
  END IF;

  RAISE NOTICE 'grant_admin_role: service-role branch present, admin check intact, EXECUTE held by service_role';
END
$assert$;
