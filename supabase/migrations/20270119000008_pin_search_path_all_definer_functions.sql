-- ═══════════════════════════════════════════════════════════════════════════
-- 20270119000008_pin_search_path_all_definer_functions.sql
--
-- Pins an explicit, canonical search_path on EVERY public SECURITY DEFINER
-- function that still carries a QUOTED search_path token.
--
-- PROBLEM (2026-09-10 hourly external scan: 25 HIGH findings of class
-- definer_no_search_path): 61 public SECURITY DEFINER functions were created
-- with their SET clause wrapped as ONE quoted token —
--     SET search_path TO ''                       (most of the family)
--     SET search_path TO 'public, pg_catalog'     (create_team_role_contract)
-- Postgres stores these as a single string token, so the effective
-- search_path is either EMPTY (no public, no pg_catalog) or a single bogus
-- schema name that never matches. Both are functionally "no search_path":
--   • an empty search_path hides pg_catalog from name resolution (operators,
--     functions like now()/round() resolve only because the live bodies
--     happen to be fully schema-qualified),
--   • and any future edit that adds one unqualified reference silently
--     breaks — or worse, is hijackable by a malicious schema earlier in the
--     path on a system where the empty token is interpreted loosely.
-- External advisors (and the repo's own scripts/security-audit.mjs [3] once
-- the proconfig quoting is considered) flag the whole family.
--
-- WHY THE REPO MONITOR MISSED IT: 20270118000000 deliberately treats
-- `search_path=""` as healthy ("Supabase's recommended hardening for
-- fully-qualified bodies"). The external hourly scan disagrees — it requires
-- a REAL, resolvable search_path. This migration settles the disagreement in
-- favor of the stricter standard.
--
-- FIX: rebuild each affected function from its own pg_get_functiondef() with
-- the SET search_path line rewritten to the canonical UNQUOTED list
--     SET search_path = public, pg_catalog, auth
-- (same shape the healthy 139 functions already carry, e.g. release_milestone,
-- update_transactions_updated_at, verify_credential_by_token). All bodies are
-- already fully schema-qualified (verified live 2026-09-10: release_escrow,
-- admin_fund_escrow, process_pending_refunds, etc.), so this changes ZERO
-- behavior — it only pins name resolution.
--
-- Includes the genuinely-broken comma variant on create_team_role_contract
-- (its 'public, pg_catalog' quoted token parses as ONE bogus schema — the
-- same defect class 20270117000000 fixed elsewhere).
--
-- Idempotent: re-running reaches the same healthy state; clean functions are
-- never touched. Multi-round loop: CREATE OR REPLACE compiles nested calls at
-- DDL time, so a function calling another not-yet-repaired function fails its
-- first pass and is retried next round (converges; same pattern as
-- 20270117000000).
--
-- Verification queries are in the comment block at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════

DO $outer$
DECLARE
  fn RECORD;
  src TEXT;
  fixed TEXT := 'SET search_path = public, pg_catalog, auth';
  affected INT := 0;
  remaining INT;
  rounds INT := 0;
BEGIN
  LOOP
    rounds := rounds + 1;
    BEGIN
      FOR fn IN
        SELECT p.oid, p.proname, p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          -- defect = a search_path entry whose value is a QUOTED token
          -- (pg_dump single-token quoting): covers both `search_path=""` and
          -- `search_path="public, pg_catalog"`.
          AND EXISTS (
            SELECT 1 FROM unnest(p.proconfig) c
            WHERE c LIKE 'search_path=%' AND c LIKE '%"%'
          )
        ORDER BY p.proname
      LOOP
        src := pg_get_functiondef(fn.oid);

        -- Rewrite the exact defect line forms:
        --   SET search_path TO ''                   (pg_get_functiondef renders
        --   SET search_path TO 'public, pg_catalog'  the empty token as TO '')
        -- Replace ONLY the quoted value after SET search_path TO — never the
        -- body. chr(39) keeps the regex single-quote-safe through every
        -- quoting layer (proven pattern from 20270117000000).
        src := regexp_replace(
          src,
          'SET search_path TO ' || chr(39) || '[^' || chr(39) || ']*' || chr(39),
          fixed
        );

        BEGIN
          EXECUTE src;
          affected := affected + 1;
        EXCEPTION WHEN OTHERS THEN
          -- Nested dependency still broken this round; retried next pass.
          NULL;
        END;
      END LOOP;
    END;

    SELECT count(*) INTO remaining
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c
        WHERE c LIKE 'search_path=%' AND c LIKE '%"%'
      );

    EXIT WHEN remaining = 0 OR rounds >= 30;
  END LOOP;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'search_path pinning incomplete: % definer functions still carry a quoted token', remaining;
  END IF;
  RAISE NOTICE 'search_path pinned on % SECURITY DEFINER functions over % rounds, 0 remaining', affected, rounds;
END;
$outer$;
-- ── Verification (run manually via `supabase db query --linked`): ──────────
-- 1. Zero quoted tokens remain:
--    SELECT p.proname FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.prosecdef
--      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c
--                  WHERE c LIKE 'search_path=%' AND c LIKE '%"');
--    → expect 0 rows.
-- 2. Every definer function now carries an unquoted search_path:
--    SELECT count(*) FROM pg_proc p
--    JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.prosecdef
--      AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c
--                      WHERE c LIKE 'search_path=%' AND c NOT LIKE '%"');
--    → expect 0.
-- 3. Sanity: money-path functions still callable (signature-only check):
--    SELECT public.release_escrow IS NOT NULL;
--    SELECT public.admin_fund_escrow IS NOT NULL;
-- ═══════════════════════════════════════════════════════════════════════════;
