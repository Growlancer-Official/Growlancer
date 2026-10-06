import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * The public `profiles` boundary — locked at the source level.
 *
 * The task asked for a `public_profiles` VIEW because the SELECT policy read as
 * "USING (true) with no TO clause, so anon can read the whole table". Measured
 * on the live schema, that premise does not hold:
 *
 *   * anon has NO table-wide SELECT on public.profiles — only column-level
 *     SELECT on 11 allowlisted columns (20261215000000). A new sensitive column
 *     is therefore already invisible to anon.
 *   * `profiles` has no `bio` column (42703), so the proposed view could not
 *     even be created.
 *   * public browsing reads profiles ONLY via PostgREST FK embeds, and a view
 *     cannot be an embed target — the view would have broken the homepage
 *     service rail, catalog, search, public profile page and public reviews.
 *
 * So 20270119000024 delivers the intent with a mechanism that holds. These
 * assertions keep the three things that matter true:
 *   1. the policy is scoped to exactly anon + authenticated (not PUBLIC),
 *   2. anon's allowlist is exact and cannot silently widen,
 *   3. the allowlist is self-detecting (detector + hourly sweep wired in).
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const MIGRATION = 'supabase/migrations/20270119000024_harden_public_profiles_select.sql';
const migration = read(MIGRATION);

/** Column names inside a SQL fragment, order-insensitive. */
const names = (sql: string): string[] =>
  Array.from(sql.matchAll(/'([a-z_]+)'/g))
    .map((m) => m[1])
    .sort();

/**
 * The bare-identifier column list of a `GRANT SELECT ( ... ) ON x TO anon`.
 * Filtered to multi-column grants so the one-column positive control
 * (`GRANT SELECT (name_changed_at) ...`) is not mistaken for the allowlist.
 */
const grantLists = (): string[][] =>
  Array.from(migration.matchAll(/GRANT SELECT \(\s*([\s\S]*?)\s*\)\s*ON public\.profiles TO anon/gi))
    .map((m) => m[1].split(/[,\s]+/).filter(Boolean).sort())
    .filter((cols) => cols.length > 1);

/**
 * The detector's own allowlist (the CTE that decides what is "allowed").
 * The CTE is closed by a line that is just `)`, with a comment line before the
 * SELECT — so match on the closing paren, not on an adjacent SELECT.
 */
const detectorAllowlist = (): string[] => {
  const m = /WITH allowlist\(column_name\) AS \(\s*VALUES([\s\S]*?)\n\s*\)/i.exec(migration);
  expect(m, 'the detector must declare its allowlist explicitly').not.toBeNull();
  return names(m![1]);
};

describe('public profiles SELECT boundary', () => {
  it('the migration exists and every assertion is present', () => {
    expect(existsSync(path.join(root, MIGRATION))).toBe(true);
    expect(migration).toMatch(/raise exception/i);
  });

  it('scopes the SELECT policy to exactly anon + authenticated', () => {
    // the old policy (created with no TO clause → roles={PUBLIC}) must be dropped
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Authenticated users can view public profiles" ON public.profiles;',
    );
    expect(migration).toMatch(/CREATE POLICY "Public profiles are viewable by anon and authenticated"[\s\S]*?FOR SELECT[\s\S]*?TO anon, authenticated[\s\S]*?USING \(true\)/);
  });

  it('does NOT create a public_profiles view (it cannot be FK-embedded)', () => {
    // Guard against re-introducing the rejected design by hand.
    expect(migration).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+public\.public_profiles/i);
    // ...and the file must say why, so the next reader does not re-propose it.
    expect(migration).toContain('42703');
    expect(migration).toMatch(/cannot embed a VIEW|FK EMBEDS/i);
  });

  it('grants anon an exact column allowlist and nothing else', () => {
    const grants = grantLists();
    expect(grants.length).toBeGreaterThanOrEqual(1);
    // every grant statement in the file must be the same set (no divergence)
    for (const g of grants) expect(g).toEqual(grants[0]);
    // none of the non-public columns may ever appear in an anon grant
    for (const forbidden of ['kyc_verified_at', 'name_changed_at', 'verification_status']) {
      expect(grants[0]).not.toContain(forbidden);
    }
    // the columns public browsing actually reads must be present
    for (const needed of ['id', 'name', 'avatar', 'is_pro', 'rating', 'role']) {
      expect(grants[0]).toContain(needed);
    }
  });

  it("the detector's allowlist matches the GRANT exactly (they cannot drift)", () => {
    // If these diverge, the detector either false-positives on a column the
    // deployment deliberately made public, or misses one it did not.
    const grants = grantLists();
    expect(detectorAllowlist()).toEqual(grants[0]);
  });

  it('the detector is server-only and the hourly sweep actually calls it', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.anon_readable_profile_columns\(\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.anon_readable_profile_columns\(\) TO service_role;/,
    );
    // wired into the monitor by anchored replacement, not by a silent no-op
    expect(migration).toMatch(/FROM public\.anon_readable_profile_columns\(\)/);
    expect(migration).toContain('check_security_drift anchor did not match');
    expect(migration).toContain('check_security_drift patch produced no change');
  });

  it('carries a positive control for BOTH detector branches and a negative one', () => {
    // positive: a non-allowlisted column, and the table-level (everything) case
    expect(migration).toMatch(/GRANT SELECT \(name_changed_at\) ON public\.profiles TO anon;/);
    expect(migration).toMatch(/GRANT SELECT ON public\.profiles TO anon;/);
    // negative: an allowlisted column must not be flagged
    expect(migration).toMatch(/negative control failed: an allowlisted column was flagged/);
  });
});

describe('allowlist drift detection (negative control for the guard itself)', () => {
  // The comparison above is only meaningful if it can fail. Recreate it against
  // a deliberately diverged pair and require a mismatch.
  const diverged = (grant: string[], allowlist: string[]) =>
    JSON.stringify([...grant].sort()) === JSON.stringify([...allowlist].sort());

  it('flags a detector allowlist that has silently gained a column', () => {
    const grant = ['avatar', 'id', 'name'];
    const allowlist = ['avatar', 'id', 'name', 'name_changed_at'];
    expect(diverged(grant, allowlist)).toBe(false);
  });

  it('accepts an identical pair regardless of order', () => {
    expect(diverged(['name', 'avatar'], ['avatar', 'name'])).toBe(true);
  });
});
