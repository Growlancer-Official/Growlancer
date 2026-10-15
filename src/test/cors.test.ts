import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCorsHeaders } from '../../supabase/functions/_shared/cors';

/**
 * Regression tests for the edge-function CORS allowlist.
 *
 * The allowlist is security-relevant: it decides which browser origins may read
 * an edge-function response. It must (a) never reflect an unknown origin, and
 * (b) still cover the origins that legitimately call it — production domains,
 * this project's Vercel previews, and any loopback dev/E2E port (the missing
 * loopback ports were a real bug: browser calls to edge functions failed from
 * E2E runs and preview deployments).
 */
describe('getCorsHeaders allowlist', () => {
  const reflect = (origin: string | null) => getCorsHeaders(origin)['Access-Control-Allow-Origin'];

  describe('allowed origins are reflected', () => {
    it.each([
      'https://growlancer.com',
      'https://www.growlancer.com',
      'https://growlancer.vercel.app',
      'https://growlancer-mrkhan154212s-projects.vercel.app',
      // Vercel preview deployment of this project (project-hash-team)
      'https://growlancer-abc123def-mrkhan154212s-projects.vercel.app',
      // Vercel branch alias of this project (project-git-branch-team)
      'https://growlancer-git-main-mrkhan154212s-projects.vercel.app',
      // Loopback dev / E2E on ANY port — not just the default 5173
      'http://localhost:5173',
      'http://localhost:4174',
      'http://127.0.0.1:4175',
    ])('%s', (origin) => {
      expect(reflect(origin)).toBe(origin);
    });
  });

  describe('unknown origins are rejected (no reflection)', () => {
    it.each([
      'https://evil.com',
      // Lookalike: a third-party Vercel project that merely names itself
      // growlancer-*. The team-slug suffix is required for exactly this case.
      'https://growlancer-evil.vercel.app',
      'https://growlancer-abc123-other-team.vercel.app',
      // Suffix / prefix tricks must not slip past the anchored pattern
      'https://growlancer-abc123-mrkhan154212s-projects.vercel.app.evil.com',
      'https://evil.com/https://growlancer-abc123-mrkhan154212s-projects.vercel.app',
      'http://localhost.evil.com:5173',
      'http://127.0.0.1.evil.com:5173',
      // Non-loopback host that merely looks local
      'http://localhost.evil.com',
      'https://growlancer.com.evil.com',
    ])('%s', (origin) => {
      expect(reflect(origin)).toBeUndefined();
    });

    it('missing Origin header (server-to-server / cron / webhooks) returns no CORS headers', () => {
      expect(getCorsHeaders(null)).toEqual({});
    });

    it('empty-string Origin returns no CORS headers', () => {
      expect(getCorsHeaders('')).toEqual({});
    });
  });

  it('never grants credential-readable cross-origin access', () => {
    // Auth is JWT/Bearer based; cookies must never become readable via CORS.
    for (const origin of ['https://growlancer.com', 'http://localhost:4174']) {
      expect(getCorsHeaders(origin)['Access-Control-Allow-Credentials']).toBeUndefined();
    }
  });

  it('honours the methods override for allowed origins only', () => {
    expect(getCorsHeaders('https://growlancer.com', 'POST, OPTIONS')['Access-Control-Allow-Methods']).toBe(
      'POST, OPTIONS'
    );
    expect(getCorsHeaders('https://evil.com', 'POST, OPTIONS')).toEqual({});
  });
});

/**
 * The allowlist is only a single source of truth if nothing else re-implements
 * it. 16 edge functions used to carry a private copy that still permitted only
 * `localhost:5173` + production — every browser call from a Vercel preview or
 * another dev port was blocked, and two more answered with a `*` wildcard.
 * This test fails if any function starts hand-rolling CORS again.
 */
describe('edge functions all use the shared CORS helper', () => {
  const functionsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../supabase/functions',
  );

  const functionSources = fs
    .readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
    .map((entry) => path.join(functionsDir, entry.name, 'index.ts'))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ name: path.relative(functionsDir, file), source: fs.readFileSync(file, 'utf8') }));

  it('finds the edge functions (guards against a broken path)', () => {
    expect(functionSources.length).toBeGreaterThan(20);
  });

  it('no function sets Access-Control-Allow-Origin on its own', () => {
    const offenders = functionSources
      .filter(({ source }) => source.includes('Access-Control-Allow-Origin'))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('no function keeps a private origin allowlist', () => {
    const offenders = functionSources
      .filter(({ source }) => source.includes('ALLOWED_ORIGINS'))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });

  it('no function answers with a wildcard Access-Control-Allow-Origin', () => {
    const offenders = functionSources
      .filter(({ source }) => /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*/.test(source))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});
