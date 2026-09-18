import { describe, it, expect } from 'vitest';
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
