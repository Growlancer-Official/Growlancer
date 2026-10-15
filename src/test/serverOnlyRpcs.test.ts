import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locks the client/server boundary established by migration
 * 20270119000012_authorization_hardening.sql.
 *
 * That migration revoked EXECUTE from `anon` + `authenticated` on the
 * server-only RPCs (wallet writers, payment/webhook internals, maintenance
 * jobs, PII readers). A browser call to any of them now fails with a 403, so
 * the failure mode of a regression is a silently-broken feature: supabase-js
 * resolves `{ data: null, error }` instead of throwing, and most callers only
 * log that. This test fails the moment app code starts naming one of those RPCs
 * again — and it reads the list straight out of the migration, so the two can
 * not drift apart.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20270119000012_authorization_hardening.sql');

function serverOnlyRpcsFromMigration(): string[] {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  const s1 = sql.indexOf('-- S1: server-only');
  expect(s1, 'migration lost its "-- S1: server-only" marker').toBeGreaterThan(-1);
  // The list itself — not the whole block (which also names the schema inside
  // `where n.nspname = 'public'`).
  const listStart = sql.indexOf('p.proname in (', s1);
  const listEnd = sql.indexOf(')', listStart);
  expect(listStart, 'the S1 revoke loop lost its p.proname list').toBeGreaterThan(s1);
  expect(listEnd, 'the S1 revoke list is unterminated').toBeGreaterThan(listStart);
  return [...sql.slice(listStart, listEnd).matchAll(/'([a-z][a-z0-9_]*)'/g)].map((m) => m[1]);
}

const SERVER_ONLY_RPCS = serverOnlyRpcsFromMigration();

function appSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && full !== THIS_FILE) out.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
}

const APP_FILES = appSourceFiles();

/** Every app file that contains the RPC name as a string literal. */
function filesNaming(name: string): string[] {
  const pattern = new RegExp(`['"\`]${name}['"\`]`);
  return APP_FILES.filter((file) => pattern.test(fs.readFileSync(file, 'utf8'))).map((file) =>
    path.relative(ROOT, file).split(path.sep).join('/'),
  );
}

describe('server-only RPCs are unreachable from the app', () => {
  it('reads the server-only list from the migration', () => {
    expect(SERVER_ONLY_RPCS.length).toBe(20);
    expect(SERVER_ONLY_RPCS).toContain('update_wallet_balance');
    expect(SERVER_ONLY_RPCS).toContain('insert_payment_audit_log');
    // Deliberately NOT revoked: it only deletes rows older than every
    // rate-limit window, and ~16 edge functions call it best-effort on hot paths.
    expect(SERVER_ONLY_RPCS).not.toContain('cleanup_expired_rate_limits');
  });

  it('scans the app source', () => {
    expect(APP_FILES.length).toBeGreaterThan(100);
  });

  it('control: the scanner does find a legitimately browser-used RPC', () => {
    expect(filesNaming('get_wallet_balance_v2')).toContain('src/lib/supabase.ts');
  });

  it.each(SERVER_ONLY_RPCS)('no app source names %s', (name) => {
    expect(filesNaming(name)).toEqual([]);
  });

  it('exposes no dbFunctions wrapper for the revoked wallet writers', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/lib/supabase.ts'), 'utf8');
    for (const fn of [
      'updateWalletBalance',
      'holdWalletFunds',
      'releaseWalletFunds',
      'processWithdrawalComplete',
      'generateProjectMatches',
    ]) {
      expect(source, `${fn} was re-added to dbFunctions but can no longer work`).not.toContain(`${fn}:`);
    }
  });

  it('keeps create_user_profile callable before a session exists', () => {
    // Signup creates the profile row with no session (email confirmation is on),
    // so this RPC must stay executable by anon — the in-function guard is the
    // boundary, not the grant.
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const s2 = sql.slice(sql.indexOf('-- S2: guarded functions'), sql.indexOf('-- Leftover test scaffolding'));
    expect(s2).not.toContain("'create_user_profile'");
  });
});
