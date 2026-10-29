import { describe, expect, it } from 'vitest';
import fs, { readFileSync, existsSync } from 'node:fs';
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

/**
 * Every column added to profiles AFTER the allowlist existed must be granted —
 * and the failure is not theoretical: 20270210000000 added four light-KYC
 * columns without a grant, and the live privilege pentest immediately failed
 * "own profile name still writable" 0/5 (PATCH … RETURNING * expands to every
 * column). 20270211000000 fixes it. This block makes the next occurrence
 * impossible to merge: it walks every later migration.
 */
describe('later profile columns are granted to authenticated', () => {
  const BOUNDARY = '20270119000025_tighten_authenticated_profile_columns.sql';
  const KYC_GRANTS = read('supabase/migrations/20270211000000_light_kyc_profile_grants.sql');

  /** Every `ADD COLUMN` inside an `ALTER TABLE … profiles` statement, in files after the boundary. */
  const addedColumns = (): string[] => {
    const dir = path.join(root, 'supabase/migrations');
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql') && f > BOUNDARY);
    const names = new Set<string>();
    for (const file of files) {
      const sql = read(`supabase/migrations/${file}`);
      for (const block of sql.matchAll(/ALTER TABLE\s+([\s\S]*?);/gi)) {
        const statement = block[1] || '';
        if (!/^\s*(public\.)?profiles\b/i.test(statement)) continue;
        for (const m of statement.matchAll(/ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)/gi)) {
          names.add(m[1]);
        }
      }
    }
    return [...names].sort();
  };

  /** The reviewed allowlist = the boundary's 14 columns + the KYC follow-up's 4. */
  const allowlist = (): string[] => {
    const boundaryCols = grantLists()[0] || [];
    const followUp = Array.from(
      KYC_GRANTS.matchAll(/GRANT SELECT \(\s*([\s\S]*?)\s*\)\s*ON public\.profiles TO authenticated/gi),
    )
      .flatMap((m) => (m[1] || '').split(/[,\s]+/).filter(Boolean));
    return [...new Set([...boundaryCols, ...followUp])].sort();
  };

  it('the follow-up grants exactly the light-KYC columns to authenticated', () => {
    const granted = Array.from(
      KYC_GRANTS.matchAll(/GRANT SELECT \(\s*([\s\S]*?)\s*\)\s*ON public\.profiles TO authenticated/gi),
    )
      .flatMap((m) => (m[1] || '').split(/[,\s]+/).filter(Boolean))
      .sort();
    expect(granted).toEqual(
      ['kyc_last_checked_at', 'kyc_method', 'kyc_name', 'phone_verified_at'].sort(),
    );
  });

  it('covers every column any later migration adds to profiles', () => {
    const added = addedColumns();
    // Control: the scan does see the four columns 20270210000000 added.
    expect(added).toEqual(expect.arrayContaining(['kyc_name', 'phone_verified_at']));
    const allowed = allowlist();
    for (const col of added) {
      expect(allowed, `${col} was added to profiles without an authenticated SELECT grant`).toContain(col);
    }
  });

  it("the detector's allowlist matches the grants (no drift alert on deploy)", () => {
    const m = /WITH allowlist\(column_name\) AS \(\s*VALUES([\s\S]*?)\n\s*\)/i.exec(KYC_GRANTS);
    expect(m, 'the follow-up must restate the detector allowlist').not.toBeNull();
    const detector = Array.from(m![1].matchAll(/'([a-z_]+)'/g)).map((x) => x[1]).sort();
    expect(detector).toEqual(allowlist());
  });

  it('is fail-closed: proves the boundary is clean and anon reads nothing new', () => {
    expect(KYC_GRANTS).toMatch(/authenticated profile-column boundary is not clean/);
    expect(KYC_GRANTS).toMatch(/anon must not read the light-KYC columns/);
    expect(KYC_GRANTS).toMatch(/only % of the 4 light-KYC columns are readable by authenticated/);
  });
});
