-- =============================================================================
-- MR-23 / RLS-004 — Pin search_path on every SECURITY DEFINER still lacking it
-- =============================================================================
-- FINDING (docs/AUDIT_FINDINGS_DATABASE.md — RLS-004, §9):
--   ~24 `SECURITY DEFINER` functions in `public` were declared WITHOUT an explicit
--   `SET search_path`. A SECURITY DEFINER executes with the privileges of its OWNER
--   (usually `postgres`), while the effective `search_path` is taken from the
--   CALLER'S session. An attacker who can set the session `search_path` (e.g. via
--   `SET search_path = attacker_schema, public`) can place a shadow object
--   (table/function/operator) in `attacker_schema` and have a privileged definer
--   resolve it — a classic search_path hijack / privilege-escalation vector.
--
--   Prior migrations (`20261214000001_fix_definer_search_path.sql`,
--   `20270117010000_security_advisor_fixes.sql`) patch this at RUNTIME by
--   rewriting `proconfig` on the live DB. This migration fixes the SOURCE OF TRUTH
--   so a fresh environment comes up hardened without depending on the runtime pin
--   (and so the drift monitor `check_security_drift()`'s `definer_no_search_path`
--   check stays clean).
--
-- APPROACH (single idempotent migration; smallest safe change):
--   1. Enumerate ONLY definers whose `proconfig` currently has NO `search_path`
--      entry. Functions that already carry a `search_path` (including the
--      deliberately-locked `SET search_path = ''` functions such as
--      `release_escrow`, `_book_escrow_release`, `admin_reverse_escrow`) are
--      SKIPPED — we never widen or overwrite an existing hardened clause.
--   2. Apply `ALTER FUNCTION … SET search_path = public, pg_catalog` (+ `, auth`
--      when the function body references `auth.`), matching the exact schema-list
--      convention already used by `20261214000001_fix_definer_search_path.sql`
--      and `20270116000000_fix_contest_policy_oid_and_drift_monitor.sql`.
--
-- SAFETY / NON-WEAKENING:
--   * Only ADDS a deterministic `search_path`; never removes or broadens one.
--   * Uses the SAME clause the runtime pin already applies, so live behaviour is
--     unchanged — this only makes the hardening durable in source control.
--   * `pg_catalog` is always implicitly searched by Postgres; listing it is
--     conventional and harmless. `auth` is added only when the body needs it.
--   * Idempotent: on re-run, every targeted function already has a `search_path`
--     and is skipped (no-op).
--
-- IDEMPOTENT: yes (selection predicate is self-clearing). Historical migrations
--   are NOT edited.
-- =============================================================================

DO $$
DECLARE
  r          RECORD;
  v_schemas  TEXT;
  v_count    INTEGER := 0;
BEGIN
  FOR r IN
    SELECT
      n.nspname                                   AS schema_name,
      p.proname                                    AS func_name,
      pg_get_function_identity_arguments(p.oid)    AS func_args,
      pg_get_functiondef(p.oid)                    AS func_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = TRUE                      -- SECURITY DEFINER
      AND NOT EXISTS (
        SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
         WHERE cfg LIKE 'search_path=%'
      )
    ORDER BY n.nspname, p.proname
  LOOP
    -- Mirror the runtime-pin convention: base list, plus `auth` when referenced.
    v_schemas := 'public, pg_catalog';
    IF r.func_def LIKE '%auth.%' THEN
      v_schemas := v_schemas || ', auth';
    END IF;

    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = %s',
      r.schema_name, r.func_name, r.func_args, v_schemas
    );

    v_count := v_count + 1;
    RAISE NOTICE 'MR-23: pinned search_path = % on %.%(%)',
      v_schemas, r.schema_name, r.func_name, r.func_args;
  END LOOP;

  RAISE NOTICE 'MR-23: hardened % SECURITY DEFINER function(s).', v_count;
END $$;

-- =============================================================================
-- LIVE-DB VERIFICATION REQUIRED
-- =============================================================================
-- 1) No public SECURITY DEFINER may remain without a search_path:
--
--    SELECT n.nspname, p.proname,
--           pg_get_function_identity_arguments(p.oid) AS args,
--           array_to_string(p.proconfig, ' | ')       AS proconfig
--      FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.prosecdef = TRUE
--       AND NOT EXISTS (
--         SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
--          WHERE c LIKE 'search_path=%'
--       )
--     ORDER BY p.proname;
--    -- EXPECT: 0 rows.
--
-- 2) Confirm NO residual comma-quoted single-token search_path (MONEY-004 class):
--
--    SELECT n.nspname, p.proname, c AS proconfig_entry
--      FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--      CROSS JOIN LATERAL unnest(p.proconfig) AS c
--     WHERE c LIKE 'search_path=%' AND c LIKE '%,%' AND c LIKE '%''%';
--    -- EXPECT: 0 rows.
--
-- 3) Drift monitor is clean:
--
--    SELECT public.check_security_drift();
--    -- EXPECT: no `definer_no_search_path` entries.
-- =============================================================================
