import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * The `authenticated` profiles boundary — locked at the source level.
 *
 * 20270119000024 scoped the SELECT policy and made ANON's allowlist
 * self-detecting, but left `authenticated` on a TABLE-level SELECT grant, so
 * every column ever added to profiles would be readable by any signed-in
 * account. 20270119000025 replaces that with an explicit 14-column allowlist.
 *
 * Two things must stay true, and they pull against each other:
 *   * the grant must stay a reviewed allowlist (no table-level grant back), and
 *   * it must keep ALL current columns, because six authenticated call sites
 *     embed `profiles!fk(*)` and PostgREST expands `*` to every column — miss
 *     one and contracts/workspace/proposals/disputes break at runtime.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const MIGRATION = 'supabase/migrations/20270119000025_tighten_authenticated_profile_columns.sql';
const migration = read(MIGRATION);

/** Multi-column `GRANT SELECT ( ... ) ON public.profiles TO authenticated`. */
const grantLists = (): string[][] =>
  Array.from(
    migration.matchAll(/GRANT SELECT \(\s*([\s\S]*?)\s*\)\s*ON public\.profiles TO authenticated/gi),
  )
    .map((m) => m[1].split(/[,\s]+/).filter(Boolean).sort())
    .filter((cols) => cols.length > 1);

/** The detector's own allowlist (the CTE that decides what is "allowed"). */
const detectorAllowlist = (): string[] => {
  const m = /WITH allowlist\(column_name\) AS \(\s*VALUES([\s\S]*?)\n\s*\)/i.exec(migration);
  expect(m, 'the detector must declare its allowlist explicitly').not.toBeNull();
  return Array.from(m![1].matchAll(/'([a-z_]+)'/g))
    .map((x) => x[1])
    .sort();
};

describe('authenticated profiles column boundary', () => {
  it('the migration exists and is fail-closed', () => {
    expect(existsSync(path.join(root, MIGRATION))).toBe(true);
    expect(migration).toMatch(/raise exception/i);
  });

  it('drops the table-level grant and keeps writes out of scope', () => {
    expect(migration).toMatch(/REVOKE SELECT ON public\.profiles FROM authenticated;/);
    // writes are governed by RLS + triggers; revoking them would break profile edits
    expect(migration).not.toMatch(/REVOKE[^;]*\b(INSERT|UPDATE|DELETE|TRUNCATE)\b[^;]*FROM authenticated/i);
  });

  it('grants all 14 current columns (wildcard embeds need every one)', () => {
    const grants = grantLists();
    expect(grants.length).toBeGreaterThanOrEqual(1);
    for (const g of grants) expect(g).toEqual(grants[0]);
    expect(grants[0]).toHaveLength(14);
    for (const col of [
      'id', 'role', 'name', 'avatar', 'is_pro', 'created_at', 'updated_at',
      'rating', 'total_reviews', 'deleted_at', 'country',
      'verification_status', 'kyc_verified_at', 'name_changed_at',
    ]) {
      expect(grants[0]).toContain(col);
    }
  });

  it("the detector's allowlist matches the GRANT exactly (they cannot drift)", () => {
    expect(detectorAllowlist()).toEqual(grantLists()[0]);
  });

  it('is server-only and wired into the hourly sweep without losing the anon sweep', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.authenticated_readable_profile_columns\(\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.authenticated_readable_profile_columns\(\) TO service_role;/,
    );
    expect(migration).toMatch(/FROM public\.authenticated_readable_profile_columns\(\)/);
    // anchoring must fail loudly rather than silently skipping the sweep
    expect(migration).toContain('check_security_drift anchor did not match');
    // and the sweep added by 20270119000024 must be asserted as still present
    expect(migration).toMatch(/FROM public\.anon_readable_profile_columns\(\)/);
  });

  it('controls both detector branches plus a negative control', () => {
    // branch 1: table-level grant
    expect(migration).toMatch(/GRANT SELECT ON public\.profiles TO authenticated;/);
    // branch 2: a genuinely non-allowlisted column, via a transactional probe
    expect(migration).toMatch(/ALTER TABLE public\.profiles ADD COLUMN _pentest_probe_col/);
    expect(migration).toMatch(/ALTER TABLE public\.profiles DROP COLUMN _pentest_probe_col/);
    // negative: an allowlisted column must not be flagged
    expect(migration).toMatch(/negative control failed: an allowlisted column was flagged/);
  });
});
