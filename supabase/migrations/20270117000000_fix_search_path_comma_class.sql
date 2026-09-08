-- ═══════════════════════════════════════════════════════════════════════════
-- 20270117000000_fix_search_path_comma_class.sql
--
-- Repairs the whole "quoted-comma search_path" defect family discovered
-- during live E2E (2026-09-06).
--
-- ROOT CAUSE (same class as 20261227000000 cron sweep + 20270116000000
-- contest trigger fix): these functions were created with a SET clause
-- written as a single quoted string containing commas, e.g.
--     SET search_path TO 'public, pg_catalog, auth'
-- Postgres parses the value as ONE schema token, which never matches any
-- schema — the effective search_path becomes empty, so every unqualified
-- table reference fails with `42P01 relation "..." does not exist`.
--
-- Observed live failures: cancel_withdrawal (42P01 on wallets) — blocking
-- withdrawal cancellation for every freelancer. release_milestone and
-- process_withdrawal_complete share the defect (payout finalization paths).
--
-- FIX: rebuild each affected function from its live pg_get_functiondef with
-- the SET line rewritten in correct list form
-- (SET search_path = public, pg_catalog, auth). Zero body drift.
-- Idempotent: re-running reaches the same healthy state.
-- ═══════════════════════════════════════════════════════════════════════════

DO $outer$
DECLARE
  fn RECORD;
  src TEXT;
  fixed TEXT;
  affected INT := 0;
  remaining INT;
  rounds INT := 0;
BEGIN
  -- Multiple rounds: CREATE of a repaired function can itself fail while
  -- OTHER broken functions still exist (Postgres compiles CREATE OR REPLACE
  -- bodies at DDL time; a nested call to a still-broken helper aborts the
  -- statement). Each pass heals more functions, so this converges.
  LOOP
    rounds := rounds + 1;
    BEGIN
      FOR fn IN
        SELECT p.oid, p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proconfig IS NOT NULL
          AND cardinality(p.proconfig) > 0
          AND p.proconfig[1] LIKE '%"%'   -- quoted single token (pg_dump form)
          AND position(',' in p.proconfig[1]) > 0  -- containing a comma = the defect
      LOOP
        src := pg_get_functiondef(fn.oid);

        -- The live defect is exactly one line like:
        --   SET search_path TO 'public, pg_catalog, auth'
        -- Replace ONLY the quoted value (single-quoted, contains a comma).
        -- Single-quotes in the regex are built via chr(39) so the pattern
        -- survives every editor/CLI quoting layer unchanged (probe-proven).
        fixed := 'SET search_path = public, pg_catalog, auth';
        src := regexp_replace(
          src,
          'SET search_path TO ' || chr(39) || '[^' || chr(39) || ']*' || chr(39),
          fixed
        );

        BEGIN
          EXECUTE src;
          affected := affected + 1;
        EXCEPTION WHEN OTHERS THEN
          -- This one function could not be (re)created in this round (e.g. a
          -- nested dependency is still broken). Keep going — a later round
          -- retries it once its dependencies are healthy.
          NULL;
        END;
      END LOOP;
    END;

    -- Broken = the SET value is ONE single-quoted token containing a comma
    -- (parse-fails to a bogus schema). The clean repaired form is an UNQUOTED
    -- list, so count only rows where the token is still quote-wrapped.
    SELECT count(*) INTO remaining
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proconfig IS NOT NULL
      AND cardinality(p.proconfig) > 0
      AND p.proconfig[1] LIKE '%"%'   -- double-quote = pg_dump quoting of a single token
      AND position(',' in p.proconfig[1]) > 0;

    EXIT WHEN remaining = 0 OR rounds >= 20;
  END LOOP;

  IF remaining > 0 THEN
    -- The double-appended form (e.g. "public, pg_catalog, auth, pg_catalog,
    -- auth") is HARMLESS: it is a valid schema list that resolves correctly —
    -- only cosmetically redundant from repeated convergence rounds. Every
    -- broken comma-token is gone if no quoted single-token remains.
    RAISE EXCEPTION 'search_path repair incomplete: % functions still broken', remaining;
  END IF;
  RAISE NOTICE 'search_path repair complete: % replacements over % rounds, 0 remaining', affected, rounds;
END;
$outer$;
