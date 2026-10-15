-- ============================================================================
-- Harden the public `profiles` SELECT boundary.
--
-- MEASURED BEFORE CHANGING ANYTHING (live schema, not assumption):
--
--   * `public.profiles` has NO table-wide SELECT grant to `anon`. anon holds
--     COLUMN-level SELECT on exactly 11 allowlisted columns, created by
--     20261215000000_close_anon_pii_and_admin_users.sql
--     (`REVOKE ALL ON public.profiles FROM anon;` then a column-level GRANT).
--     → a new sensitive column added to `profiles` is NOT auto-exposed to anon.
--
--   * `profiles` no longer HAS email/phone/is_admin/bio columns (20261221000000
--     dropped/moved them). A view selecting `bio` FROM public.profiles fails
--     with 42703 — the proposed `public_profiles` view cannot be created as
--     written.
--
--   * Public browsing reads profiles ONLY through PostgREST FK EMBEDS:
--       services?select=...,freelancer:profiles!services_freelancer_id_fkey(...)
--       reviews?select=...,reviewer:profiles!reviewer_id(...)
--       freelancer_profiles?select=...,profile:profiles!freelancer_profiles_user_id_fkey(...)
--     PostgREST cannot embed a VIEW (there is no FK to resolve), so routing
--     public browsing through a `public_profiles` view would break the homepage
--     service rail, the catalog, service detail, freelancer search, the public
--     profile page and every public review — instead of protecting them.
--
-- So the requested INTENT is delivered with a mechanism that holds:
--
--   1. The SELECT policy is scoped explicitly `TO anon, authenticated`. It was
--      created with no TO clause (roles = {PUBLIC}), so it handed a permissive
--      read policy to ANY role that ever gains table privileges — and this
--      database already uses `authenticator`, `dashboard_user` and
--      `supabase_privileged_role` on other tables.
--
--   2. The anon column allowlist is re-asserted from the repo, so the repo —
--      not a single historical migration — is the source of truth for it.
--
--   3. The allowlist becomes SELF-DETECTING. `anon_readable_profile_columns()`
--      flags (a) a table-level anon grant, which WOULD expose every current and
--      future column, and (b) any anon-readable column outside the allowlist.
--      The hourly `check_security_drift()` sweep alerts on it through the
--      existing path, so the fragility the task worried about is caught by the
--      monitor instead of relying on the next reviewer to remember.
--
-- Note: the allowlist is asserted EXACTLY, so deliberately making a new profile
-- column public is a reviewed change (edit this list), never an accident.
-- ============================================================================

-- ── 1. Scope the public SELECT policy to the two roles that browse ──────────
DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by anon and authenticated" ON public.profiles;
CREATE POLICY "Public profiles are viewable by anon and authenticated"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── 2. Re-assert the anon column allowlist (idempotent) ────────────────────
-- Public browsing needs these and only these. `deleted_at` is included because
-- public queries filter on it (filtering a column requires SELECT on it).
REVOKE ALL ON public.profiles FROM anon;
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
  country
) ON public.profiles TO anon;

-- ── 3. Detector: what can anon read that it should not? ────────────────────
-- Server-only (revoked from PUBLIC/anon/authenticated below): it reports on the
-- privilege boundary, so it must not itself be part of the surface.
CREATE OR REPLACE FUNCTION public.anon_readable_profile_columns()
RETURNS TABLE(column_name text, reason text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
  WITH allowlist(column_name) AS (
    VALUES ('id'), ('role'), ('name'), ('avatar'), ('is_pro'),
           ('created_at'), ('updated_at'), ('rating'),
           ('total_reviews'), ('deleted_at'), ('country')
  )
  -- Branch 1: a TABLE-level grant is the real fragility — it exposes every
  -- column that will ever be added, with no review.
  SELECT '*',
         'anon holds table-level SELECT on public.profiles — every current AND future column is readable'
   WHERE has_table_privilege('anon', 'public.profiles', 'SELECT')
  UNION ALL
  -- Branch 2: a specific column outside the allowlist.
  SELECT c.column_name,
         'anon can SELECT public.profiles.' || c.column_name || ' but it is not part of the public allowlist'
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'profiles'
     AND has_column_privilege('anon', 'public.profiles', c.column_name, 'SELECT')
     AND c.column_name NOT IN (SELECT a.column_name FROM allowlist a);
$function$;

REVOKE ALL ON FUNCTION public.anon_readable_profile_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anon_readable_profile_columns() TO service_role;

-- ── 4. The hourly sweep alerts on it through the existing email path ────────
-- Patched by anchored replacement, like 20270119000016/18/19: an anchor
-- mismatch raises (a silent no-op would look like a guarded deploy).
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

  IF v_src LIKE '%anon_readable_profile_columns%' THEN
    RETURN; -- already sweeping
  END IF;

  v_anchor := '  -- 📨 Real-time admin email via the CRON_SECRET-protected notify function' || chr(10) ||
              '  IF v_new > 0 THEN';

  IF v_src NOT LIKE '%' || v_anchor || '%' THEN
    RAISE EXCEPTION 'check_security_drift anchor did not match — sweep not added';
  END IF;

  v_new := replace(v_src, v_anchor, $repl$
  -- 🔴 CRITICAL/HIGH: anon can read more of public.profiles than the public
  --    allowlist — either a table-level SELECT grant (which exposes every
  --    current AND future column, the exact fragility this guards against) or a
  --    column that was never meant for public browsing.
  FOR v_finding IN
    SELECT column_name, reason FROM public.anon_readable_profile_columns()
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE category = 'anon_readable_profile_column'
        AND detail LIKE '%' || v_finding.column_name || '%'
        AND (is_resolved = false OR resolved_at > NOW() - interval '7 days')
    ) THEN
      INSERT INTO public.security_alerts (severity, category, detail)
      VALUES (
        CASE WHEN v_finding.column_name = '*' THEN 'critical' ELSE 'high' END,
        'anon_readable_profile_column',
        format('anon can read public.profiles.%s (%s)', v_finding.column_name, v_finding.reason)
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

-- ── 5. Assertions + positive/negative controls (this migration's own txn) ───
DO $assert$
DECLARE
  v_count integer;
  v_detail text;
BEGIN
  -- 5a. The public SELECT policy is scoped to exactly anon + authenticated.
  --     Scoped by ROLE SET, not by name alone: a policy named correctly but
  --     left at roles={PUBLIC} is the defect this migration exists to remove.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'profiles'
       AND p.polcmd = 'r'
       AND p.polname = 'Public profiles are viewable by anon and authenticated'
       AND pg_get_expr(p.polqual, p.polrelid) = 'true'
       AND (SELECT count(*) FROM unnest(p.polroles) r) = 2
       AND (SELECT count(*)
              FROM unnest(p.polroles) r
              JOIN pg_roles g ON g.oid = r
             WHERE g.rolname IN ('anon', 'authenticated')) = 2
  ) THEN
    RAISE EXCEPTION 'the public profiles SELECT policy is missing or not scoped to anon+authenticated';
  END IF;

  -- 5b. Public browsing must still work — anon keeps the columns it reads.
  IF NOT (has_column_privilege('anon', 'public.profiles', 'id', 'SELECT')
      AND has_column_privilege('anon', 'public.profiles', 'role', 'SELECT')
      AND has_column_privilege('anon', 'public.profiles', 'name', 'SELECT')
      AND has_column_privilege('anon', 'public.profiles', 'avatar', 'SELECT')
      AND has_column_privilege('anon', 'public.profiles', 'is_pro', 'SELECT')
      AND has_column_privilege('anon', 'public.profiles', 'rating', 'SELECT')
      AND has_column_privilege('anon', 'public.profiles', 'created_at', 'SELECT')
      AND has_column_privilege('anon', 'public.profiles', 'updated_at', 'SELECT')
      AND has_column_privilege('anon', 'public.profiles', 'total_reviews', 'SELECT')
      AND has_column_privilege('anon', 'public.profiles', 'deleted_at', 'SELECT')
      AND has_column_privilege('anon', 'public.profiles', 'country', 'SELECT')) THEN
    RAISE EXCEPTION 'anon lost a profiles column that public browsing depends on';
  END IF;

  -- 5c. No table-level grant, and no non-allowlisted column readable.
  IF has_table_privilege('anon', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'anon holds table-level SELECT on profiles — every future column would be exposed';
  END IF;
  IF has_column_privilege('anon', 'public.profiles', 'kyc_verified_at', 'SELECT')
     OR has_column_privilege('anon', 'public.profiles', 'name_changed_at', 'SELECT')
     OR has_column_privilege('anon', 'public.profiles', 'verification_status', 'SELECT') THEN
    RAISE EXCEPTION 'anon can read a profile column that is not part of the public allowlist';
  END IF;

  -- 5d. The detector is server-only.
  IF has_function_privilege('anon', 'public.anon_readable_profile_columns()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.anon_readable_profile_columns()', 'EXECUTE') THEN
    RAISE EXCEPTION 'the profile-column detector is reachable by an app role';
  END IF;

  -- 5e. The monitor actually sweeps it (the invocation, not prose about it).
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'check_security_drift'
       AND p.prosrc LIKE '%FROM public.anon_readable_profile_columns()%'
  ) THEN
    RAISE EXCEPTION 'check_security_drift is not sweeping anon_readable_profile_columns()';
  END IF;

  -- 5f. Baseline — the live boundary must already be clean.
  SELECT count(*) INTO v_count FROM public.anon_readable_profile_columns();
  IF v_count <> 0 THEN
    SELECT string_agg(column_name || ' — ' || reason, ' | ')
      INTO v_detail FROM public.anon_readable_profile_columns();
    RAISE EXCEPTION 'anon profile-column detector is not clean on the live schema: %', coalesce(v_detail, '(unavailable)');
  END IF;

  -- 5g. POSITIVE CONTROL 1 — a column outside the allowlist must be flagged.
  GRANT SELECT (name_changed_at) ON public.profiles TO anon;
  SELECT count(*) INTO v_count
    FROM public.anon_readable_profile_columns() WHERE column_name = 'name_changed_at';
  REVOKE SELECT (name_changed_at) ON public.profiles FROM anon;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'positive control failed: a non-allowlisted anon-readable column was not flagged';
  END IF;

  -- 5h. POSITIVE CONTROL 2 — a table-level grant is the everything-exposed case
  --     (the exact fragility the task describes) and must be flagged as such.
  GRANT SELECT ON public.profiles TO anon;
  SELECT count(*) INTO v_count
    FROM public.anon_readable_profile_columns() WHERE column_name = '*';
  IF v_count <> 1 THEN
    REVOKE ALL ON public.profiles FROM anon;
    RAISE EXCEPTION 'positive control failed: a table-level anon grant was not flagged';
  END IF;

  -- 5i. NEGATIVE CONTROL — an allowlisted column is readable and must NOT be
  --     flagged, so the detector is not just flagging every granted column.
  SELECT count(*) INTO v_count
    FROM public.anon_readable_profile_columns() WHERE column_name = 'avatar';
  IF v_count <> 0 THEN
    REVOKE ALL ON public.profiles FROM anon;
    RAISE EXCEPTION 'negative control failed: an allowlisted column was flagged';
  END IF;

  -- 5j. Restore the exact allowlist and prove the boundary is clean again.
  REVOKE ALL ON public.profiles FROM anon;
  GRANT SELECT (
    id, role, name, avatar, is_pro, created_at, updated_at,
    rating, total_reviews, deleted_at, country
  ) ON public.profiles TO anon;

  SELECT count(*) INTO v_count FROM public.anon_readable_profile_columns();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'detector not clean after restoring the allowlist (count=%)', v_count;
  END IF;

  -- 5k. The hourly sweep finds nothing new.
  --     `check_security_drift()` RETURNS integer (a scalar), so
  --     `SELECT count(*) FROM check_security_drift()` is ALWAYS 1 — call it.
  SELECT public.check_security_drift() INTO v_count;
  IF v_count <> 0 THEN
    SELECT string_agg(category || ' — ' || left(detail, 140), ' | ')
      INTO v_detail
      FROM public.security_alerts
     WHERE created_at >= now() - interval '1 minute';
    RAISE EXCEPTION 'check_security_drift() reported % new alert(s) after the fix: %',
      v_count, coalesce(v_detail, '(details unavailable)');
  END IF;
END
$assert$;
