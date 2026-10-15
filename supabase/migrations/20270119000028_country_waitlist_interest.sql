-- ═══════════════════════════════════════════════════════════════════════════════
-- Country waitlist interest — "all countries A→Z, Coming Soon + waitlist"
--
-- The onboarding country dropdown lists every country but only India is live.
-- This migration gives the non-India rows a real, server-backed waitlist:
--
--   1. close a PUBLIC WRITE HOLE on public.waitlist
--   2. fix the admin SELECT policy (it read profiles.role, but the admin flag
--      lives on profiles_private.is_admin since 20261221000000)
--   3. fix a live typing defect in join_waitlist (uuid id read into bigint)
--   4. widen the signup_source CHECK to the values the app actually sends
--   5. country_waitlist_counts()            → public, aggregate only, no PII
--   6. join_country_waitlist(text)          → signed-in capture, identity from JWT
--   7. admin_country_waitlist_insights()    → admin-only "who, and from where"
--
-- Security notes (see CLAUDE.md Security Principles):
--   §1  no amount is involved; every value is derived server-side.
--   §2  waitlist rows are written ONLY through SECURITY DEFINER functions.
--   §4  the admin function re-checks profiles_private.is_admin server-side; a
--       client-side route guard is never trusted.
--   §6  the capture RPC never accepts an email/user_id from the request body —
--       identity comes from auth.uid().
--   §8  the public aggregate RPC returns counts only (no email/name/id).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Close the public write hole on public.waitlist ────────────────────────
-- The policy was `FOR INSERT TO authenticated, anon WITH CHECK (true)`, and its
-- comment claimed it was needed for the SECURITY DEFINER RPC. It is not:
-- SECURITY DEFINER already bypasses RLS. All it gave the world was a direct
-- PostgREST write path into the waitlist with no dedupe and no validation —
-- every other writer (join_waitlist, join_country_waitlist) is SECURITY DEFINER.
DROP POLICY IF EXISTS "Allow insert for join_waitlist RPC" ON public.waitlist;
DROP POLICY IF EXISTS "Users can join waitlist" ON public.waitlist;

-- ─── 2. Admin SELECT policy → the real admin flag ─────────────────────────────
DROP POLICY IF EXISTS "Admins can view waitlist" ON public.waitlist;
CREATE POLICY "Admins can view waitlist"
  ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (
    COALESCE(
      (SELECT pp.is_admin FROM public.profiles_private pp WHERE pp.id = auth.uid()),
      false
    )
    OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
  );

-- ─── 3. join_waitlist: uuid id must not be read into a bigint ─────────────────
-- `waitlist.id` is UUID (20260807000000) but this function declared
-- `v_existing_id bigint`. The zero-row case never casts, so a FIRST submission
-- worked — but any email already in the table hit the SELECT and failed with a
-- datatype error instead of returning already_exists. That is the path a repeat
-- visitor takes, and it is now on the onboarding dropdown too.
-- The body below is otherwise the shipped one (20260926000000), including the
-- caller-owns-p_user_id guard injected by 20270119000012.
CREATE OR REPLACE FUNCTION public.join_waitlist(
  p_email text,
  p_country text,
  p_signup_source text DEFAULT 'oauth',
  p_user_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_existing_id uuid;
  v_result jsonb;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF; -- authz-guard: caller-owns-p_user_id

  -- `country` is NOT NULL. Callers that omit it used to get a raw constraint
  -- violation (23502); answer with something the UI can show instead.
  IF p_country IS NULL OR btrim(p_country) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Country is required');
  END IF;

  SELECT w.id INTO v_existing_id
  FROM public.waitlist w
  WHERE lower(w.email) = lower(btrim(p_email))
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.waitlist w
    SET
      country = COALESCE(p_country, w.country),
      signup_source = COALESCE(p_signup_source, w.signup_source),
      user_id = COALESCE(p_user_id, w.user_id),
      name = COALESCE(p_name, w.name),
      updated_at = now()
    WHERE w.id = v_existing_id
    RETURNING jsonb_build_object(
      'success', true,
      'waitlist_id', w.id,
      'already_exists', true
    ) INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Update failed'));
  END IF;

  INSERT INTO public.waitlist (email, name, country, signup_source, user_id)
  VALUES (lower(btrim(p_email)), p_name, p_country, p_signup_source, p_user_id)
  RETURNING jsonb_build_object(
    'success', true,
    'waitlist_id', id,
    'already_exists', false
  ) INTO v_result;

  RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Insert failed'));
END;
$fn$;

-- Grants unchanged: pre-signup capture still runs before a session exists.
REVOKE ALL ON FUNCTION public.join_waitlist(text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_waitlist(text, text, text, uuid, text) TO anon, authenticated, service_role;

-- ─── 4. signup_source CHECK — it rejects every value the app sends ───────────
-- 20260807000000 created `signup_source` with
--   CHECK (signup_source IN ('direct_signup','google_oauth','linkedin_oauth'))
-- and no later migration widened it. But the writers send 'oauth' (AuthCallbackPage
-- country gate) and 'homepage' (newsletter-subscribe edge function), and the
-- onboarding dropdown adds 'onboarding_dropdown' — all three violated the CHECK,
-- so the homepage and OAuth waitlist captures failed at write time. The failure
-- was invisible because the generated TS types just say `signup_source?: string`
-- (a CHECK constraint is not part of the column type) and the edge-function call
-- is wrapped in a non-fatal try/catch.
--
-- Drop every CHECK on this column by looking it up in the catalog (rather than
-- guessing the auto-generated name) and then add one explicit, named constraint.
DO $widen$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'public'
       AND rel.relname = 'waitlist'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%signup_source%'
  LOOP
    EXECUTE format('ALTER TABLE public.waitlist DROP CONSTRAINT %I', v_conname);
  END LOOP;
END $widen$;

ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_signup_source_check
  CHECK (signup_source IN (
    'direct_signup',
    'google_oauth',
    'linkedin_oauth',
    'oauth',
    'homepage',
    'waitlist_page',
    'onboarding_dropdown'
  ));

-- ─── 5. country_waitlist_counts() — public aggregate, no PII ──────────────────
-- Powers the "N people waiting" line in the dropdown and the founder's at-a-glance
-- demand map. Returns ONLY a per-country count and the newest join timestamp —
-- never an email, name or id. Safe to expose to logged-out visitors.
CREATE OR REPLACE FUNCTION public.country_waitlist_counts()
RETURNS TABLE (country text, interested integer, last_joined timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT w.country,
         count(*)::integer AS interested,
         max(w.created_at) AS last_joined
    FROM public.waitlist w
   WHERE w.country IS NOT NULL
     AND btrim(w.country) <> ''
   GROUP BY w.country
   ORDER BY count(*) DESC, w.country ASC;
$fn$;

REVOKE ALL ON FUNCTION public.country_waitlist_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.country_waitlist_counts() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.country_waitlist_counts() IS
  'Per-country waitlist interest counts. Aggregate only (no email/name/id) so it can be read by logged-out visitors.';

-- ─── 6. join_country_waitlist(text) — signed-in capture ───────────────────────
-- Called from the onboarding dropdown for a country that is not live yet.
-- Identity is NEVER taken from the request body: the caller id comes from the
-- verified JWT and the email/name are read from that account's own rows (§6).
CREATE OR REPLACE FUNCTION public.join_country_waitlist(p_country text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_email text;
  v_name text;
  v_country text;
  v_existing_id uuid;
BEGIN
  -- (a) caller verification — identity from the JWT, never the body
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_country IS NULL OR btrim(p_country) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Country is required');
  END IF;

  -- (b) resolve the canonical country row (accepts a name or an alpha-2 code)
  SELECT c.name INTO v_country
    FROM public.countries c
   WHERE lower(c.name) = lower(btrim(p_country))
      OR upper(c.code) = upper(btrim(p_country))
   LIMIT 1;

  IF v_country IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown country');
  END IF;

  -- India is live — there is nothing to wait for.
  IF v_country = 'India' THEN
    RETURN jsonb_build_object('success', true, 'available', true, 'country', v_country);
  END IF;

  -- (c) identity from the database, keyed on the verified caller
  SELECT pp.email INTO v_email
    FROM public.profiles_private pp
   WHERE pp.id = v_caller;

  SELECT p.name INTO v_name
    FROM public.profiles p
   WHERE p.id = v_caller;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No email on file for this account');
  END IF;

  -- (d) idempotent — the email is the natural key, so a repeat tap is a no-op
  SELECT w.id INTO v_existing_id
    FROM public.waitlist w
   WHERE lower(w.email) = lower(v_email)
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.waitlist w
       SET country = v_country,
           name = COALESCE(v_name, w.name),
           signup_source = 'onboarding_dropdown',
           user_id = v_caller,
           updated_at = now()
     WHERE w.id = v_existing_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_exists', true,
      'country', v_country
    );
  END IF;

  INSERT INTO public.waitlist (email, name, country, signup_source, user_id)
  VALUES (lower(v_email), v_name, v_country, 'onboarding_dropdown', v_caller);

  RETURN jsonb_build_object(
    'success', true,
    'already_exists', false,
    'country', v_country
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.join_country_waitlist(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_country_waitlist(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.join_country_waitlist(text) IS
  'Signed-in waitlist capture from the onboarding country dropdown. Identity (email/name) is read from auth.uid() rows, never from the request body.';

-- ─── 7. admin_country_waitlist_insights() — who, and from where ───────────────
-- Admin-only. Aggregates interest per country AND lists the recent joiners
-- (name / email / country / when) so the founder can see exactly who is waiting
-- and where they are. The admin check runs server-side (§4).
CREATE OR REPLACE FUNCTION public.admin_country_waitlist_insights()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
  v_by_country jsonb;
  v_recent jsonb;
  v_total integer;
BEGIN
  IF v_caller IS NOT NULL THEN
    SELECT COALESCE(pp.is_admin, false) INTO v_is_admin
      FROM public.profiles_private pp
     WHERE pp.id = v_caller;

    IF NOT COALESCE(v_is_admin, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: admin access required');
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.interested DESC, t.country ASC), '[]'::jsonb)
    INTO v_by_country
    FROM (
      SELECT w.country AS country,
             count(*)::integer AS interested,
             max(w.created_at) AS last_joined
        FROM public.waitlist w
       WHERE w.country IS NOT NULL
         AND btrim(w.country) <> ''
       GROUP BY w.country
    ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO v_recent
    FROM (
      SELECT w.name AS name,
             w.email AS email,
             w.country AS country,
             w.signup_source AS signup_source,
             w.created_at AS joined_at
        FROM public.waitlist w
       ORDER BY w.created_at DESC NULLS LAST
       LIMIT 200
    ) r;

  SELECT count(*)::integer INTO v_total FROM public.waitlist w;

  RETURN jsonb_build_object(
    'success', true,
    'total', v_total,
    'country_count', jsonb_array_length(v_by_country),
    'by_country', v_by_country,
    'recent', v_recent
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_country_waitlist_insights() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_country_waitlist_insights() TO authenticated, service_role;

-- ─── 8. Fail-closed assertions ────────────────────────────────────────────────
DO $assert$
DECLARE
  v_oid oid;
  v_count integer;
BEGIN
  -- 7a. The public write hole must be gone.
  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'waitlist'
     AND cmd = 'INSERT';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'assertion failed: waitlist still accepts client INSERT policies (%)', v_count;
  END IF;

  -- 7b. join_waitlist must read the uuid id into a uuid variable. Reading
  --     pg_proc.prosrc is the point: the defect was a TYPE, which no catalog
  --     query for the signature would have shown.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'join_waitlist'
       AND p.prosrc LIKE '%v_existing_id bigint%'
  ) THEN
    RAISE EXCEPTION 'assertion failed: join_waitlist still declares v_existing_id bigint against a uuid column';
  END IF;

  -- 7c. Grant matrix — resolved by OID so a wrong arg list cannot make the
  --     check silently pass (a fail-closed assertion that is wrong about its
  --     own schema is not fail-closed, it is just wrong).
  v_oid := to_regprocedure('public.country_waitlist_counts()');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'assertion failed: country_waitlist_counts() missing';
  END IF;
  IF NOT has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon lost EXECUTE on country_waitlist_counts()';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: authenticated lost EXECUTE on country_waitlist_counts()';
  END IF;

  v_oid := to_regprocedure('public.join_country_waitlist(text)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'assertion failed: join_country_waitlist(text) missing';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon can execute join_country_waitlist()';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: authenticated lost EXECUTE on join_country_waitlist()';
  END IF;

  v_oid := to_regprocedure('public.admin_country_waitlist_insights()');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'assertion failed: admin_country_waitlist_insights() missing';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon can execute admin_country_waitlist_insights()';
  END IF;

  -- 7d. The widened CHECK must accept every value the app sends. This is the
  --     assertion that would have caught the shipped defect: a write-time
  --     rejection is invisible to a type-level check.
  SELECT count(*) INTO v_count
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
   WHERE n.nspname = 'public'
     AND rel.relname = 'waitlist'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%signup_source%'
     AND pg_get_constraintdef(con.oid) ILIKE '%onboarding_dropdown%'
     AND pg_get_constraintdef(con.oid) ILIKE '%homepage%'
     AND pg_get_constraintdef(con.oid) ILIKE '%oauth%';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'assertion failed: signup_source CHECK does not accept the values the app sends';
  END IF;

  -- 7e. join_waitlist keeps its pre-signup anon path (asserted in
  --     20270119000012 — this migration rewrites the body, so re-assert it).
  v_oid := to_regprocedure('public.join_waitlist(text,text,text,uuid,text)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'assertion failed: join_waitlist(text,text,text,uuid,text) missing after rewrite';
  END IF;
  IF NOT has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon lost EXECUTE on join_waitlist() after rewrite';
  END IF;
END $assert$;

-- ─── 9. Positive control — the INSERT-hole check must be able to fail ─────────
-- A guard that cannot fail is not a guard. Plant the exact policy, prove 7a
-- would have caught it, then remove it.
DO $control$
DECLARE
  v_count integer;
BEGIN
  CREATE POLICY "__assert_insert_hole_probe"
    ON public.waitlist
    FOR INSERT
    TO anon
    WITH CHECK (true);

  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'waitlist'
     AND cmd = 'INSERT';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: the waitlist INSERT-policy check did not see a planted policy';
  END IF;

  DROP POLICY "__assert_insert_hole_probe" ON public.waitlist;

  SELECT count(*) INTO v_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'waitlist'
     AND cmd = 'INSERT';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'POSITIVE CONTROL FAILED: the planted policy survived the drop';
  END IF;
END $control$;

-- ─── 10. Realtime — the dropdown counts update live ───────────────────────────
DO $realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'waitlist'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
  END IF;
END $realtime$;
