-- ============================================================================
-- Tighten the `authenticated` SELECT grant on public.profiles too.
--
-- Why: 20270119000024 scoped the SELECT policy and made ANON's column allowlist
-- self-detecting, but left `authenticated` holding a TABLE-level SELECT grant.
-- A table-level grant means every column that will EVER be added to profiles is
-- readable by any signed-in account the moment it exists — the same
-- "whatever columns happen to be on the table" fragility, one role over.
-- There is no PII on profiles today (email/phone live in profiles_private), so
-- the current impact is nil; this closes the future one.
--
-- Why all FOURTEEN columns and not fewer: six authenticated call sites embed
-- profiles with a wildcard, and PostgREST expands `*` to every column, so a
-- missing SELECT on any single one breaks those pages (contracts, workspace,
-- proposals, disputes):
--     WorkspacePage.tsx        client:profiles!contracts_client_id_fkey(*)
--     ContractsPage.tsx        profiles!contracts_client_id_fkey(*)
--     dataService.ts           profiles!proposals_freelancer_id_fkey(*)
--     disputeService.ts        client/freelancer:profiles!contracts_*_id_fkey(*)
--
-- Consequence to remember: from now on, a migration that ADDs a profile column
-- must also GRANT SELECT on it (to authenticated, and to anon only if it is
-- genuinely public) — otherwise those wildcard embeds fail loudly. That is the
-- intended fail-closed behaviour, not an oversight. The detector below flags the
-- opposite direction (a grant widening without the allowlist being updated).
-- ============================================================================

-- ── 1. Replace the table-level grant with an explicit column allowlist ──────
-- SELECT only: INSERT/UPDATE/DELETE/… are deliberately untouched (RLS policies
-- plus the triggers govern writes, and revoking them would break profile edits).
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id,
  role,
  name,
  avatar,
  is_pro,
  created_at,
  updated_at,
  rating,
  total_reviews,
  deleted_at,
  country,
  verification_status,
  kyc_verified_at,
  name_changed_at
) ON public.profiles TO authenticated;

-- ── 2. Detector for the authenticated boundary ─────────────────────────────
-- Same shape as anon_readable_profile_columns() (20270119000024): branch 1 is a
-- table-level grant (everything, forever), branch 2 is a readable column that
-- is not in the allowlist — which is exactly what you get if someone grants a
-- newly added column without updating this list.
CREATE OR REPLACE FUNCTION public.authenticated_readable_profile_columns()
RETURNS TABLE(column_name text, reason text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
  WITH allowlist(column_name) AS (
    VALUES ('id'), ('role'), ('name'), ('avatar'), ('is_pro'),
           ('created_at'), ('updated_at'), ('rating'), ('total_reviews'),
           ('deleted_at'), ('country'), ('verification_status'),
           ('kyc_verified_at'), ('name_changed_at')
  )
  SELECT '*',
         'authenticated holds table-level SELECT on public.profiles — every current AND future column is readable by any signed-in account'
   WHERE has_table_privilege('authenticated', 'public.profiles', 'SELECT')
  UNION ALL
  SELECT c.column_name,
         'authenticated can SELECT public.profiles.' || c.column_name || ' but it is not part of the reviewed allowlist'
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'profiles'
     AND has_column_privilege('authenticated', 'public.profiles', c.column_name, 'SELECT')
     AND c.column_name NOT IN (SELECT a.column_name FROM allowlist a);
$function$;

REVOKE ALL ON FUNCTION public.authenticated_readable_profile_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authenticated_readable_profile_columns() TO service_role;

-- ── 3. The hourly sweep alerts on it through the existing email path ────────
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

  IF v_src LIKE '%authenticated_readable_profile_columns%' THEN
    RETURN; -- already sweeping
  END IF;

  v_anchor := '  -- 📨 Real-time admin email via the CRON_SECRET-protected notify function' || chr(10) ||
              '  IF v_new > 0 THEN';

  IF v_src NOT LIKE '%' || v_anchor || '%' THEN
    RAISE EXCEPTION 'check_security_drift anchor did not match — sweep not added';
  END IF;

  v_new := replace(v_src, v_anchor, $repl$
  -- 🔴 CRITICAL/HIGH: the signed-in role can read more of public.profiles than
  --    the reviewed allowlist — a table-level grant exposes every future column,
  --    and a newly granted column bypassed review.
  FOR v_finding IN
    SELECT column_name, reason FROM public.authenticated_readable_profile_columns()
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'authenticated_readable_profile_column'
        AND detail LIKE '%' || v_finding.column_name || '%'
        AND (is_resolved = false OR resolved_at > NOW() - interval '7 days')
    ) THEN
      INSERT INTO public.security_alerts (severity, category, detail)
      VALUES (
        CASE WHEN v_finding.column_name = '*' THEN 'critical' ELSE 'high' END,
        'authenticated_readable_profile_column',
        format('authenticated can read public.profiles.%s (%s)', v_finding.column_name, v_finding.reason)
      );
      v_new := v_new + 1;
    END IF;
  END LOOP;

$repl$ || v_anchor);

  IF v_new = v_src THEN
    RAISE EXCEPTION 'check_security_drift patch produced no change';
  END IF;

  EXECUTE v_new;
END
$patch_drift$;

-- ── 4. Assertions + controls (this migration's own transaction) ────────────
DO $assert$
DECLARE
  v_count integer;
  v_detail text;
BEGIN
  -- 4a. No table-level SELECT for authenticated, and every current column is
  --     still readable — the second half is what keeps `profiles(*)` embeds
  --     working on the contracts / workspace / proposals / disputes pages.
  IF has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated still holds table-level SELECT on profiles';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'profiles'
       AND NOT has_column_privilege('authenticated', 'public.profiles', c.column_name, 'SELECT')
  ) THEN
    SELECT string_agg(c.column_name, ', ') INTO v_detail
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'profiles'
       AND NOT has_column_privilege('authenticated', 'public.profiles', c.column_name, 'SELECT');
    RAISE EXCEPTION 'authenticated lost SELECT on profiles column(s): % — wildcard embeds would break', v_detail;
  END IF;

  -- 4b. The detector is server-only.
  IF has_function_privilege('anon', 'public.authenticated_readable_profile_columns()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.authenticated_readable_profile_columns()', 'EXECUTE') THEN
    RAISE EXCEPTION 'the authenticated-column detector is reachable by an app role';
  END IF;

  -- 4c. The monitor sweeps it, and the anon sweep from 20270119000024 survived.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'check_security_drift'
       AND p.prosrc LIKE '%FROM public.authenticated_readable_profile_columns()%'
  ) THEN
    RAISE EXCEPTION 'check_security_drift is not sweeping authenticated_readable_profile_columns()';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'check_security_drift'
       AND p.prosrc LIKE '%FROM public.anon_readable_profile_columns()%'
  ) THEN
    RAISE EXCEPTION 'the anon sweep was lost while patching the monitor';
  END IF;

  -- 4d. Baseline — both boundaries clean.
  SELECT count(*) INTO v_count FROM public.authenticated_readable_profile_columns();
  IF v_count <> 0 THEN
    SELECT string_agg(column_name || ' — ' || reason, ' | ')
      INTO v_detail FROM public.authenticated_readable_profile_columns();
    RAISE EXCEPTION 'authenticated profile-column detector is not clean: %', coalesce(v_detail, '(unavailable)');
  END IF;
  SELECT count(*) INTO v_count FROM public.anon_readable_profile_columns();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'the anon profile-column detector regressed (count=%)', v_count;
  END IF;

  -- 4e. POSITIVE CONTROL 1 — a table-level grant must be flagged.
  GRANT SELECT ON public.profiles TO authenticated;
  SELECT count(*) INTO v_count
    FROM public.authenticated_readable_profile_columns() WHERE column_name = '*';
  REVOKE SELECT ON public.profiles FROM authenticated;
  GRANT SELECT (
    id, role, name, avatar, is_pro, created_at, updated_at, rating,
    total_reviews, deleted_at, country, verification_status,
    kyc_verified_at, name_changed_at
  ) ON public.profiles TO authenticated;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'positive control failed: a table-level authenticated grant was not flagged';
  END IF;

  -- 4f. NEGATIVE CONTROL — an allowlisted column must not be flagged (the
  --     detector must not simply flag every readable column).
  SELECT count(*) INTO v_count
    FROM public.authenticated_readable_profile_columns() WHERE column_name = 'name';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'negative control failed: an allowlisted column was flagged';
  END IF;

  -- 4g. The hourly sweep finds nothing new.
  --     `check_security_drift()` RETURNS integer (a scalar) — call it directly;
  --     `SELECT count(*) FROM check_security_drift()` would always be 1.
  SELECT public.check_security_drift() INTO v_count;
  IF v_count <> 0 THEN
    SELECT string_agg(category || ' — ' || left(detail, 140), ' | ')
      INTO v_detail FROM public.security_alerts
     WHERE created_at >= now() - interval '1 minute';
    RAISE EXCEPTION 'check_security_drift() reported % new alert(s) after the fix: %',
      v_count, coalesce(v_detail, '(details unavailable)');
  END IF;
END
$assert$;

-- ── 5. POSITIVE CONTROL 2 for the column branch (probe column, last) ────────
-- Branch 2 can only fire for a column outside the allowlist, and every current
-- column is allowlisted — so it is exercised with a real, transactional probe
-- column. Done LAST so the ACCESS EXCLUSIVE lock window is only this statement
-- plus the drop (both metadata-only, no table rewrite).
DO $probe_col$
DECLARE
  v_count integer;
BEGIN
  ALTER TABLE public.profiles ADD COLUMN _pentest_probe_col text;
  GRANT SELECT (_pentest_probe_col) ON public.profiles TO authenticated;

  SELECT count(*) INTO v_count
    FROM public.authenticated_readable_profile_columns()
   WHERE column_name = '_pentest_probe_col';

  ALTER TABLE public.profiles DROP COLUMN _pentest_probe_col;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'positive control failed: a newly granted non-allowlisted column was not flagged';
  END IF;

  -- and the boundary is clean again after the probe
  SELECT count(*) INTO v_count FROM public.authenticated_readable_profile_columns();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'detector not clean after the probe-column control (count=%)', v_count;
  END IF;
END
$probe_col$;
