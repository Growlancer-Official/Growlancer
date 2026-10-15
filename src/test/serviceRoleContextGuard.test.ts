import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locks the service-role detection fix from
 * supabase/migrations/20270119000018_service_role_context_detection.sql.
 *
 * Why this exists: `release_escrow` and `auto_release_contract` gated the cron
 * path on the LEGACY singular per-claim JWT parameter
 * (`request.jwt.claim.role`), which current PostgREST no longer sets. The guard
 * therefore read NULL/'' and refused every service-role call — so the hourly
 * milestone job flipped a milestone to 'released', credited the freelancer
 * 0.00, and left the client's aggregate escrow_balance holding the funds. It is
 * a silent money-path failure: nothing errors, the money simply never moves.
 *
 * The failure is also easy to reintroduce, because both spellings look
 * plausible and the broken one reads as "stricter". These assertions read the
 * migration text directly, so the fix and its test cannot drift apart.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20270119000018_service_role_context_detection.sql',
);
const SQL = fs.readFileSync(MIGRATION, 'utf8');

/** Counts non-overlapping occurrences of a literal substring. */
function count(haystack: string, needle: string): number {
  expect(needle.length, 'needle must not be empty (a zero-length match is vacuous)').toBeGreaterThan(0);
  return haystack.split(needle).length - 1;
}

/** The handler body of a `DO $tag$ ... $tag$;` block, by its tag. */
function doBlock(tag: string): string {
  const open = `DO $${tag}$`;
  const start = SQL.indexOf(open);
  expect(start, `migration lost its ${open} block`).toBeGreaterThan(-1);
  const end = SQL.indexOf(`$${tag}$;`, start + open.length);
  expect(end, `migration lost the end of its $${tag}$ block`).toBeGreaterThan(-1);
  return SQL.slice(start, end);
}

const LEGACY_PROBE_RELEASE =
  "  IF COALESCE(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role''' || chr(10) ||";
const LEGACY_PROBE_AUTO =
  "  IF COALESCE(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role'' THEN' || chr(10) ||";

describe('service-role detection (20270119000018)', () => {
  it('replaces the legacy probe in both functions that had it', () => {
    // The legacy text survives only as the ANCHOR each patch searches for.
    expect(count(SQL, LEGACY_PROBE_RELEASE)).toBe(1);
    expect(count(SQL, LEGACY_PROBE_AUTO)).toBe(1);

    // ...and each anchor is followed by a rewrite that calls the shared helper.
    const release = doBlock('patch_release');
    expect(release).toContain("IF NOT public.is_service_role_context()");
    expect(release).toContain("IF v_new = v_src THEN"); // no silent no-op on anchor miss
    expect(release).toContain("p_client_id IS DISTINCT FROM auth.uid()"); // owner path kept

    const auto = doBlock('patch_auto');
    expect(auto).toContain('IF NOT public.is_service_role_context() THEN');
    expect(auto).toContain('Unauthorized: service role required'); // refusal kept
  });

  it('gives the helper both detection idioms, NULL-safely', () => {
    const helper = SQL.slice(
      SQL.indexOf('FUNCTION public.is_service_role_context()'),
      SQL.indexOf('$function$;', SQL.indexOf('FUNCTION public.is_service_role_context()')),
    );
    // PostgREST's SET LOCAL ROLE...
    expect(helper).toContain("current_setting('role', true)");
    // ...and the plural claims JSON, which is the only place current PostgREST
    // puts the role. Either probe alone has a documented failure mode.
    expect(helper).toContain('auth.role()');
    // A plain session with no SET ROLE reports 'none', not NULL — a special
    // case that would otherwise make a bare session look like a match.
    expect(helper).toContain("'none'");
  });

  it('keeps the detector comment-aware so prose cannot be mistaken for a guard', () => {
    const detector = SQL.slice(
      SQL.indexOf('FUNCTION public.stale_jwt_claim_check()'),
      SQL.indexOf('$function$;', SQL.indexOf('FUNCTION public.stale_jwt_claim_check()')),
    );
    expect(detector).toContain('/\\*.*?\\*/'); // block comments
    expect(detector).toContain('(^|[^-])--[^\\n]*'); // line comments (not mid-token `--`)
    expect(detector).toContain("NOT LIKE '%request.jwt.claims%'"); // plural fallback is fine
    // Comments are stripped BEFORE the LIKE, otherwise the fix's own explanatory
    // comment would make the patched function flag itself.
    const strip = detector.indexOf('regexp_replace');
    expect(strip).toBeGreaterThan(-1);
    expect(detector.indexOf("LIKE '%request.jwt.claim.%'")).toBeGreaterThan(strip);
  });

  it('plugs the detector into the hourly sweep and proves it fires', () => {
    const drift = doBlock('patch_drift');
    expect(drift).toContain('public.stale_jwt_claim_check()');
    expect(drift).toContain('stale_jwt_claim_check'); // the alert category
    expect(drift).toContain("v_new := v_new + 1");

    // A detector that silently matches nothing is worse than none, so the
    // migration must ship BOTH a planted violator and a prose-only control.
    expect(SQL).toContain('_pentest_probe_stale_jwt_fn');
    expect(SQL).toContain("RAISE EXCEPTION 'positive control failed");
    expect(SQL).toContain('_pentest_probe_clean_fn');
    expect(SQL).toContain("RAISE EXCEPTION 'negative control failed");
  });

  it('asserts the sweep result by calling it, not by counting its rows', () => {
    // `check_security_drift()` RETURNS integer (a scalar), so
    // `SELECT count(*) ... FROM check_security_drift()` counts the single row
    // carrying that integer and is ALWAYS 1 — an assertion that looks like a
    // check and can never fail. The first draft of this migration shipped that
    // exact mistake and "failed" on a clean schema.
    expect(SQL).toContain('SELECT public.check_security_drift() INTO v_count;');
    expect(SQL).not.toContain('count(*) INTO v_count FROM public.check_security_drift()');
  });
});
