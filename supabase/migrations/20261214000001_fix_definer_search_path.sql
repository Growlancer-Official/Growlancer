-- ────────────────────────────────────────────────────────────────────────────
-- FIX: SECURITY DEFINER functions without SET search_path (search-path hijack)
--
-- For every SECURITY DEFINER function in the public schema that does NOT
-- already declare a search_path (proconfig), set one that includes exactly
-- the schemas its body references (public + pg_catalog always, plus
-- net/storage/cron/extensions/auth if used). Unqualified references can then
-- never be hijacked by an attacker-controlled schema earlier in the path.
--
-- Idempotent — safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r record;
  v_schemas text;
  v_extra text := '';
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           p.prosrc AS body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proconfig IS NULL              -- no SET search_path declared yet
      AND pg_function_is_visible(p.oid)
  LOOP
    v_extra := '';
    -- Detect schema-qualified references in the function body so we keep
    -- those callable after narrowing the path.
    IF r.body ILIKE '%net.%' THEN v_extra := v_extra || ', net'; END IF;
    IF r.body ILIKE '%storage.%' THEN v_extra := v_extra || ', storage'; END IF;
    IF r.body ILIKE '%cron.%' THEN v_extra := v_extra || ', cron'; END IF;
    IF r.body ILIKE '%extensions.%' THEN v_extra := v_extra || ', extensions'; END IF;
    IF r.body ILIKE '%auth.%' THEN v_extra := v_extra || ', auth'; END IF;
    IF r.body ILIKE '%graphql_public.%' THEN v_extra := v_extra || ', graphql_public'; END IF;

    v_schemas := 'public, pg_catalog' || v_extra;

    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = %s',
      r.schema_name, r.proname, r.args, quote_literal(v_schemas)
    );
  END LOOP;
END $$;

-- Verify: count functions that STILL lack search_path (should be 0)
-- SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prosecdef AND p.proconfig IS NULL;
