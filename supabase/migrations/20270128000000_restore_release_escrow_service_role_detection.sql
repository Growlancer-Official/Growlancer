-- ═══════════════════════════════════════════════════════════════════════════════
-- Restore service-role detection in release_escrow (regression introduced by
-- 20270124000000). Money-path — fail-closed.
--
-- The chain, measured 2026-10-16 (Backend Deploy run 38864451720):
--   1. 20270119000018 (§17) replaced the stale SINGULAR GUC probe
--      `current_setting('request.jwt.claim.role', …)` with
--      public.is_service_role_context(), because current PostgREST only sets the
--      PLURAL `request.jwt.claims` JSON — the singular parameter reads '' and a
--      guard built on it silently refuses every service-role caller.
--   2. 20270124000000 (applied 2026-10-16; sorts AFTER that fix) re-CREATE'd
--      release_escrow from a body written BEFORE it, putting the legacy probe
--      back:
--        v_is_service_role := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
--      Consequence: the automated service-role release path could not move money.
--      Live pentest, 3 failures:
--        [milestone] service-role auto-release … escrow_released=false credited=0.00
--                    msg="All milestones auto-released but escrow release failed: Unauthorized"
--        [milestone] escrow left in a consistent state by the auto-release: escrow=funded
--        [team]      service-role milestone path releases member B's escrow: Unauthorized
--      No money was lost or double-spent — funds stayed held and escrow stayed
--      `funded` — but the automated path could not pay a freelancer.
--   3. This migration re-states release_escrow exactly as 20270124000000 left it
--      (its fee-base and `_release_escrow_internal` delegation are kept) with the
--      §17 probe restored.
--
-- Fail-closed: the assertions below refuse to apply if the stale probe is ever
-- reintroduced, and the same class is swept hourly by public.check_security_drift()
-- through public.stale_jwt_claim_check() (which reported exactly {release_escrow}
-- right before this fix).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.release_escrow(
  p_contract_id UUID,
  p_client_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_contract RECORD;
  v_is_service_role BOOLEAN;
BEGIN
  -- Service-role (cron / webhook / admin) bypass: the JWT role claim is set by
  -- Supabase Auth only — browsers cannot spoof it. Everything else must match.
  -- The shared helper probes BOTH idioms (see 20270119000018); reading the
  -- singular per-claim parameter alone refuses every service-role caller.
  v_is_service_role := public.is_service_role_context();

  IF NOT v_is_service_role AND p_client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  IF NOT v_is_service_role AND v_contract.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Unauthorized: You do not own this contract';
  END IF;

  -- Delegate the actual money movement to the internal helper (no auth checks
  -- inside — it relies on THIS gate + row locks it takes itself).
  RETURN public._release_escrow_internal(p_contract_id);
END $$;

REVOKE ALL ON FUNCTION public.release_escrow(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_escrow(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_escrow(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_escrow(UUID, UUID) TO service_role;

-- ─── 1. Fail-closed assertions ─────────────────────────────────────────────
DO $assert$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  v_oid := 'public.release_escrow(uuid,uuid)'::regprocedure::oid;
  v_def := pg_get_functiondef(v_oid);

  IF v_def NOT LIKE '%is_service_role_context%' THEN
    RAISE EXCEPTION 'assertion failed: release_escrow must probe service-role context through is_service_role_context()';
  END IF;

  IF v_def LIKE '%request.jwt.claim.role%' THEN
    RAISE EXCEPTION 'assertion failed: release_escrow reintroduced the stale singular request.jwt.claim.role probe — that is exactly what broke service-role auto-release after 20270124000000';
  END IF;

  -- The money-moving target must exist, so a passing gate cannot fall over at
  -- runtime instead of here, at deploy time.
  IF to_regprocedure('public._release_escrow_internal(uuid)') IS NULL THEN
    RAISE EXCEPTION 'assertion failed: _release_escrow_internal(uuid) missing — release_escrow would delegate into nothing';
  END IF;

  -- Grants unchanged: anon must never reach this gate.
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon can execute release_escrow()';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: authenticated lost EXECUTE on release_escrow()';
  END IF;
  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: service_role lost EXECUTE on release_escrow()';
  END IF;

  -- The repo's own detector must be clean for this function now.
  IF EXISTS (
    SELECT 1 FROM public.stale_jwt_claim_check() WHERE function_name = 'release_escrow'
  ) THEN
    RAISE EXCEPTION 'assertion failed: stale_jwt_claim_check() still flags release_escrow';
  END IF;
END $assert$;

-- ─── 2. Controls — BOTH sides of the gate, against the real function ───────
DO $control$
DECLARE
  v_default text;
  v_service text;
  v_sentinel CONSTANT text := 'CONTROL SENTINEL (must not escape)';
BEGIN
  -- Negative control: a plain session (no service-role claims — exactly what a
  -- browser gets) must be refused at the gate, before any contract lookup.
  BEGIN
    PERFORM public.release_escrow('00000000-0000-0000-0000-000000000000'::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid);
    RAISE EXCEPTION '%', v_sentinel;
  EXCEPTION WHEN OTHERS THEN
    v_default := SQLERRM;
    IF v_default = v_sentinel THEN RAISE; END IF;
    IF v_default <> 'Unauthorized' THEN
      RAISE EXCEPTION 'CONTROL FAILED: a non-service caller must be refused with Unauthorized, got: %', v_default;
    END IF;
  END;

  -- Positive control: with service-role claims (the PLURAL JSON PostgREST
  -- actually sets) the gate must ADMIT the caller. The call then has to fail at
  -- contract lookup — "Contract not found" — which proves the refusal is no
  -- longer the authz branch. This is the assertion 20270124000000 would have
  -- failed, since its body could only ever reach the first branch.
  PERFORM set_config('request.jwt.claims',
                     '{"role":"service_role","sub":"00000000-0000-0000-0000-000000000000"}',
                     true);
  BEGIN
    PERFORM public.release_escrow('00000000-0000-0000-0000-000000000000'::uuid,
                                  '00000000-0000-0000-0000-000000000000'::uuid);
    RAISE EXCEPTION '%', v_sentinel;
  EXCEPTION WHEN OTHERS THEN
    v_service := SQLERRM;
    IF v_service = v_sentinel THEN RAISE; END IF;
    IF v_service <> 'Contract not found' THEN
      RAISE EXCEPTION 'CONTROL FAILED: a service-role caller must pass the gate (expected Contract not found), got: %', v_service;
    END IF;
  END;

  PERFORM set_config('request.jwt.claims', '', true);
END $control$;
