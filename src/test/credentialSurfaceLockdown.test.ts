/**
 * Release-audit regression guard for the deferred credential surface.
 *
 * Defect this file pins down (found 2026-10-25, fixed by
 * supabase/migrations/20270205000000_credential_surface_lockdown.sql):
 *
 *   Five tables created by the credential module had no RLS and kept the
 *   default anon/authenticated grants, so PostgREST exposed QR tokens, admin
 *   audit rows (e-mail/IP), rate-limit identifiers and archived reviews to
 *   anyone with the public key. Worse, the SECURITY DEFINER
 *   `verify_credential_by_token` was granted to anon and returned the full
 *   internship-application row while the route itself answered 410.
 *
 * These are contract tests over the SQL text — vitest cannot execute plpgsql,
 * and a missing `ENABLE ROW LEVEL SECURITY` line is exactly how the original
 * defect shipped. If the module is ever re-enabled, this test must be updated
 * together with a PII-free verification function, not simply deleted.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');
const LOCKDOWN = '20270205000000_credential_surface_lockdown.sql';

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'));

const ALL_SQL = migrationFiles
  .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'))
  .join('\n');

const lockdownSql = fs.readFileSync(path.join(MIGRATIONS_DIR, LOCKDOWN), 'utf8');

const SENSITIVE_TABLES = [
  'credential_verification_tokens',
  'credential_version_history',
  'credential_audit_logs',
  'verification_rate_limits',
  'reviews_duplicate_archive',
];

describe('deferred credential tables are not exposed to client roles', () => {
  for (const table of SENSITIVE_TABLES) {
    it(`${table} has RLS enabled`, () => {
      const enable = new RegExp(
        `ALTER\\s+TABLE\\s+(IF\\s+EXISTS\\s+)?(public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      expect(ALL_SQL).toMatch(enable);
    });

    it(`${table} revokes anon/authenticated grants`, () => {
      const revoke = new RegExp(
        `REVOKE\\s+ALL\\s+ON\\s+(public\\.)?${table}\\s+FROM\\s+anon\\s*,\\s*authenticated`,
        'i',
      );
      expect(lockdownSql).toMatch(revoke);
    });

    it(`${table} is never granted to anon or authenticated by a policy`, () => {
      const policyOnTable = new RegExp(
        `CREATE\\s+POLICY[\\s\\S]{0,300}?ON\\s+(public\\.)?${table}\\b[\\s\\S]{0,200}?TO\\s+(anon|authenticated|PUBLIC)`,
        'i',
      );
      expect(ALL_SQL).not.toMatch(policyOnTable);
    });
  }
});

describe('public certificate verification is closed while deferred', () => {
  it('the PII-returning RPC is revoked from client roles and kept for service_role', () => {
    expect(lockdownSql).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.verify_credential_by_token\(text\)\s+FROM\s+anon\s*,\s*authenticated/i,
    );
    expect(lockdownSql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.verify_credential_by_token\(text\)\s+TO\s+service_role/i,
    );
  });

  it('the migration documents why a token must not return internship PII', () => {
    expect(lockdownSql).toMatch(/internship_applications|internship application/i);
    expect(lockdownSql).toMatch(/deferred/i);
  });
});
