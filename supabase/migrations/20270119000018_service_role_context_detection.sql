-- ═══════════════════════════════════════════════════════════════════════════
-- 20270119000018 — service-role detection: `release_escrow` still refused the cron
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ─── F4 (HIGH): the F3 fix in 20270119000017 read a GUC PostgREST no longer sets ──
-- 20270119000017 restored release_escrow's service-role branch but probed it with
-- the LEGACY per-claim GUC (the singular `request.jwt.claim.<name>` parameter).
-- Current PostgREST sets the PLURAL `request.jwt.claims` JSON and no longer sets
-- the singular per-claim parameters; Supabase's own `auth.role()` reads both for
-- exactly this reason. So that probe evaluated to '' for every service-role call
-- too, the branch never fired, and the runtime probe (real HTTP, real JWTs) still
-- reported `escrow release failed: Unauthorized` — the milestone flipped to
-- 'released', the freelancer was credited 0.00, and the client's aggregate
-- escrow_balance kept holding the funds.
--
-- The same stale probe lives in `auto_release_contract` — the delivered-but-
-- unpaid path — which no probe had exercised until this migration: the same
-- silent failure class, on the other cron.
--
-- A catalog sweep shows these two were the ONLY functions in the schema relying
-- on the legacy singular per-claim parameter (nothing reads `.sub` / `.email`
-- that way; `auth.uid()` carries the plural fallback).
--
-- ─── Why a helper instead of an inline expression ─────────────────────────
-- Two detection idioms already exist in this schema, and only one of them is
-- reliable on its own:
--   * `current_setting('role', true)` — PostgREST's SET LOCAL ROLE, which is
--     what `fund_escrow` and `create_user_profile` already gate on. Subtle
--     inside a SECURITY DEFINER function, where the effective role is the
--     function owner's.
--   * `auth.role()` — reads both the singular parameter and the plural claims
--     JSON, and is unaffected by role switching.
-- The helper accepts either rather than betting on one. Both are unforgeable
-- from a browser: a client JWT can only ever yield 'authenticated'.
--
-- `stale_jwt_claim_check()` makes the class self-detecting, so a future
-- re-creation of this bug raises an hourly alert instead of waiting for the
-- next audit. It strips SQL comments before matching, so prose that merely
-- mentions the legacy parameter (including this migration's own comments and
-- the monitor's alert text) is not mistaken for a broken guard.
--
-- Verification: the functional proof is the runtime probe
-- (`node scripts/e2e/pentest-privileges.mjs`) against the deployed database —
-- the service-role milestone leg must release the escrow AND credit the
-- freelancer, and the client's escrow_balance must equal the sum of the escrows
-- still held (statuses funded/disputed/frozen) at every step.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. One shared, tested answer to "is this a service-role request?"
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_service_role_context()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- True iff this request authenticated with the service-role key.
  --
  -- Two probes on purpose:
  --   * current_setting('role', true) is PostgREST's SET LOCAL ROLE — what
  --     fund_escrow / create_user_profile already gate on.
  --   * auth.role() falls back to the plural claims JSON, the only place
  --     current PostgREST puts the role. Reading the legacy singular
  --     per-claim parameter alone returned '' and silently turned every
  --     service-role-only guard into a refusal (20270119000017 → this).
  -- NULLIF on 'none' because a plain session with no SET ROLE reports 'none'.
  SELECT COALESCE(NULLIF(current_setting('role', true), 'none'), '') = 'service_role'
      OR COALESCE(auth.role(), '') = 'service_role';
$function$;

REVOKE ALL ON FUNCTION public.is_service_role_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_service_role_context() TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. release_escrow — swap the stale probe for the helper.
--    Anchors must match the LIVE body verbatim; a miss aborts this migration
--    rather than silently changing nothing.
-- ───────────────────────────────────────────────────────────────────────────
DO $patch_release$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'release_escrow';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'release_escrow not found — cannot patch';
  END IF;

  IF v_src LIKE '%is_service_role_context%' THEN
    RETURN; -- already patched (idempotent re-run)
  END IF;

  v_new := replace(
    v_src,
    '  IF COALESCE(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role''' || chr(10) ||
    '     AND p_client_id IS DISTINCT FROM auth.uid() THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Unauthorized'';' || chr(10) ||
    '  END IF;',
    '  -- Service-role callers (the hourly milestone-auto-release cron and admin' || chr(10) ||
    '  -- paths) have no auth.uid(). Detection goes through the shared helper' || chr(10) ||
    '  -- because the legacy singular per-claim parameter is no longer set by' || chr(10) ||
    '  -- PostgREST — reading it alone made this branch never fire.' || chr(10) ||
    '  IF NOT public.is_service_role_context()' || chr(10) ||
    '     AND p_client_id IS DISTINCT FROM auth.uid() THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Unauthorized'';' || chr(10) ||
    '  END IF;'
  );

  IF v_new = v_src THEN
    RAISE EXCEPTION 'release_escrow auth anchor did not match';
  END IF;

  EXECUTE v_new;
END
$patch_release$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. auto_release_contract — same stale probe, on the delivered-but-unpaid path.
-- ───────────────────────────────────────────────────────────────────────────
DO $patch_auto$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'auto_release_contract';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'auto_release_contract not found — cannot patch';
  END IF;

  IF v_src LIKE '%is_service_role_context%' THEN
    RETURN; -- already patched (idempotent re-run)
  END IF;

  v_new := replace(
    v_src,
    '  IF COALESCE(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role'' THEN' || chr(10) ||
    '    RETURN jsonb_build_object(''success'', false, ''error'', ''Unauthorized: service role required'');' || chr(10) ||
    '  END IF;',
    '  -- Stale-probe fix: see 20270119000018. The legacy singular per-claim' || chr(10) ||
    '  -- parameter is not set by current PostgREST, so this returned Unauthorized' || chr(10) ||
    '  -- for the cron too, leaving a delivered contract unpaid forever.' || chr(10) ||
    '  IF NOT public.is_service_role_context() THEN' || chr(10) ||
    '    RETURN jsonb_build_object(''success'', false, ''error'', ''Unauthorized: service role required'');' || chr(10) ||
    '  END IF;'
  );

  IF v_new = v_src THEN
    RAISE EXCEPTION 'auto_release_contract auth anchor did not match';
  END IF;

  EXECUTE v_new;
END
$patch_auto$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Detector: any function deciding authority from the legacy claim parameter.
--    Comments are stripped first, so documentation can name the parameter
--    freely without being mistaken for a guard that reads it.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stale_jwt_claim_check()
RETURNS TABLE(function_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- A function whose CODE reads the legacy singular per-claim parameter
  -- without also reading the plural claims JSON. The singular value is NULL/''
  -- on current PostgREST, so such a guard silently either refuses every
  -- legitimate service-role call (release_escrow, auto_release_contract —
  -- 20270119000018) or, with the polarity flipped, lets everyone through.
  -- `auth.uid()`-style code always carries the plural fallback and is
  -- therefore not flagged.
  --
  -- Block comments are removed before line comments so a `--` inside a
  -- /* ... */ block cannot leak trailing prose into the match.
  WITH bodies AS (
    SELECT p.proname::text AS function_name,
           regexp_replace(
             regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'),
             '(^|[^-])--[^\n]*', '\1', 'g'
           ) AS code
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
  )
  SELECT b.function_name
    FROM bodies b
   WHERE b.code LIKE '%request.jwt.claim.%'
     AND b.code NOT LIKE '%request.jwt.claims%'
   ORDER BY 1;
$function$;

REVOKE ALL ON FUNCTION public.stale_jwt_claim_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stale_jwt_claim_check() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. The hourly sweep alerts on it through the existing email path.
-- ───────────────────────────────────────────────────────────────────────────
DO $patch_drift$
DECLARE
  v_src text;
  v_new text;
  v_anchor text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'check_security_drift';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'check_security_drift() not found — cannot patch';
  END IF;

  IF v_src LIKE '%stale_jwt_claim_check%' THEN
    RETURN; -- already sweeping
  END IF;

  v_anchor := '  -- 📨 Real-time admin email via the CRON_SECRET-protected notify function' || chr(10) ||
              '  IF v_new > 0 THEN';

  IF v_src NOT LIKE '%' || v_anchor || '%' THEN
    RAISE EXCEPTION 'check_security_drift anchor did not match — sweep not added';
  END IF;

  v_new := replace(
    v_src,
    v_anchor,
    '  -- 🟠 HIGH: a guard that decides authority from the legacy singular per-claim' || chr(10) ||
    '  --    parameter is broken on current PostgREST — it reads NULL/'''' and' || chr(10) ||
    '  --    therefore either refuses every legitimate service-role call (how' || chr(10) ||
    '  --    release_escrow silently stopped paying milestones) or, polarity' || chr(10) ||
    '  --    flipped, admits all.' || chr(10) ||
    '  FOR v_finding IN' || chr(10) ||
    '    SELECT function_name FROM public.stale_jwt_claim_check()' || chr(10) ||
    '  LOOP' || chr(10) ||
    '    IF NOT EXISTS (' || chr(10) ||
    '      SELECT 1 FROM public.security_alerts' || chr(10) ||
    '      WHERE category = ''stale_jwt_claim_check''' || chr(10) ||
    '        AND detail LIKE ''%'' || v_finding.function_name || ''%''' || chr(10) ||
    '        AND (is_resolved = false OR resolved_at > NOW() - interval ''7 days'')' || chr(10) ||
    '    ) THEN' || chr(10) ||
    '      INSERT INTO public.security_alerts (severity, category, detail)' || chr(10) ||
    '      VALUES (' || chr(10) ||
    '        ''high'',' || chr(10) ||
    '        ''stale_jwt_claim_check'',' || chr(10) ||
    '        format(''Function %s decides authority from the legacy singular per-claim JWT parameter, which current PostgREST no longer sets — the guard reads NULL'', v_finding.function_name)' || chr(10) ||
    '      );' || chr(10) ||
    '      v_new := v_new + 1;' || chr(10) ||
    '    END IF;' || chr(10) ||
    '  END LOOP;' || chr(10) || chr(10) ||
    v_anchor
  );

  IF v_new = v_src THEN
    RAISE EXCEPTION 'check_security_drift patch produced no change';
  END IF;

  EXECUTE v_new;
END
$patch_drift$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Assertions + positive control, inside this migration's own transaction.
-- ───────────────────────────────────────────────────────────────────────────
DO $assert$
DECLARE
  v_count integer;
  v_stripped text;
BEGIN
  -- 6a. Both patched functions: helper in, legacy probe out. Compared against
  --     the comment-stripped body, so prose that mentions the parameter (the
  --     fix's own explanatory comments do) cannot mask a real leftover guard.
  v_stripped := regexp_replace(
    regexp_replace(
      (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'release_escrow'),
      '/\*.*?\*/', '', 'g'),
    '(^|[^-])--[^\n]*', '\1', 'g');

  IF v_stripped NOT LIKE '%is_service_role_context%' THEN
    RAISE EXCEPTION 'release_escrow does not call the service-role helper';
  END IF;
  IF v_stripped LIKE '%request.jwt.claim.%' THEN
    RAISE EXCEPTION 'release_escrow still decides authority from the legacy per-claim parameter';
  END IF;
  IF v_stripped NOT LIKE '%You do not own this contract%' THEN
    RAISE EXCEPTION 'release_escrow lost its owner check';
  END IF;

  v_stripped := regexp_replace(
    regexp_replace(
      (SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'auto_release_contract'),
      '/\*.*?\*/', '', 'g'),
    '(^|[^-])--[^\n]*', '\1', 'g');

  IF v_stripped NOT LIKE '%is_service_role_context%' THEN
    RAISE EXCEPTION 'auto_release_contract does not call the service-role helper';
  END IF;
  IF v_stripped LIKE '%request.jwt.claim.%' THEN
    RAISE EXCEPTION 'auto_release_contract still decides authority from the legacy per-claim parameter';
  END IF;
  IF v_stripped NOT LIKE '%Unauthorized: service role required%' THEN
    RAISE EXCEPTION 'auto_release_contract lost its service-role refusal';
  END IF;

  -- 6b. The helper itself must be NULL-safe and probe BOTH idioms, otherwise it
  --     just re-introduces one of the two failure modes.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'is_service_role_context'
       AND p.prosrc LIKE '%current_setting(''role''%'
       AND p.prosrc LIKE '%auth.role()%'
       AND p.prosrc LIKE '%none%'
       AND p.prosrc LIKE '%service_role%'
  ) THEN
    RAISE EXCEPTION 'is_service_role_context() does not probe both idioms NULL-safely';
  END IF;

  -- 6c. The new helpers are server-only; anon must not reach them.
  IF has_function_privilege('anon', 'public.stale_jwt_claim_check()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_service_role_context()', 'EXECUTE') THEN
    RAISE EXCEPTION 'a service-role helper is reachable by anon';
  END IF;
  IF has_function_privilege('authenticated', 'public.stale_jwt_claim_check()', 'EXECUTE') THEN
    RAISE EXCEPTION 'the drift detector is reachable by an app role';
  END IF;

  -- 6d. The monitor actually sweeps the new detector.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'check_security_drift'
       AND p.prosrc LIKE '%stale_jwt_claim_check%'
  ) THEN
    RAISE EXCEPTION 'check_security_drift is not sweeping stale_jwt_claim_check';
  END IF;

  -- 6e. POSITIVE CONTROL — the detector must flag a planted violator, both as
  --     bare code and behind a comment. A detector that silently matches
  --     nothing would let this whole class back in.
  CREATE FUNCTION public._pentest_probe_stale_jwt_fn()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $probe$
    -- This comment mentions the legacy per-claim parameter and must be ignored.
    SELECT COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  $probe$;

  SELECT count(*) INTO v_count
    FROM public.stale_jwt_claim_check()
   WHERE function_name = '_pentest_probe_stale_jwt_fn';
  IF v_count <> 1 THEN
    DROP FUNCTION public._pentest_probe_stale_jwt_fn();
    RAISE EXCEPTION 'positive control failed: stale_jwt_claim_check() did not flag a planted legacy-parameter guard';
  END IF;

  DROP FUNCTION public._pentest_probe_stale_jwt_fn();

  -- 6f. Negative control — a function that only mentions the parameter in prose
  --     must NOT be flagged (comments are stripped).
  CREATE FUNCTION public._pentest_probe_clean_fn()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $probe2$
    -- Reads the legacy request.jwt.claim.role parameter historically, but the
    -- real guard below is the plural-aware one.
    SELECT COALESCE(auth.role(), '') = 'service_role';
  $probe2$;

  SELECT count(*) INTO v_count
    FROM public.stale_jwt_claim_check()
   WHERE function_name = '_pentest_probe_clean_fn';
  DROP FUNCTION public._pentest_probe_clean_fn();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'negative control failed: prose mentioning the legacy parameter was flagged as a broken guard';
  END IF;

  -- 6g. Baseline: the live schema must now be clean.
  SELECT count(*) INTO v_count FROM public.stale_jwt_claim_check();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'stale legacy-parameter guards still present after the fix (count=%)', v_count;
  END IF;

  -- 6h. And the sweep must find nothing new.
  --
  --     `check_security_drift()` RETURNS integer (a scalar), so
  --     `SELECT count(*) ... FROM check_security_drift()` counts the one row
  --     carrying that integer and is ALWAYS 1 — an assertion that looks like a
  --     check and can never fail. Call it directly. (This exact mistake shipped
  --     into this migration's first draft and reported "1 new alert" on a clean
  --     schema; the self-diagnosing message below is what disproved it.)
  SELECT public.check_security_drift() INTO v_count;
  IF v_count <> 0 THEN
    SELECT string_agg(category || ' — ' || left(detail, 140), ' | ')
      INTO v_stripped
      FROM public.security_alerts WHERE created_at >= now() - interval '1 minute';
    RAISE EXCEPTION 'check_security_drift() reported % new alert(s) after the fix: %',
      v_count, coalesce(v_stripped, '(details unavailable)');
  END IF;
END
$assert$;
