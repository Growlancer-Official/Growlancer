import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locks the auth URL surface to the routes that actually exist.
 *
 * The defect this prevents, measured live: `pages/prerenderUrls.ts` still listed
 * the four password-era auth URLs after sign-in became GitHub/LinkedIn-only, and
 * that list drives Vike's prerender step. So the production build shipped a
 * PRERENDERED 404 page for each one — an old bookmark or a stale verification
 * email landed on a bare `<h1>404</h1>` instead of the app's styled not-found
 * screen. Nothing failed: the URLs are not routed (oauthOnlyAuthSurface.test.ts
 * asserts that on purpose) and the prerender list was never checked against the
 * router, so the two lists could drift forever without a red test.
 *
 * The invariant: every `/auth/*` URL that is prerendered MUST have a matching
 * route in App.tsx, and the removed password-era URLs must appear in neither
 * place. The negative control at the bottom proves the checker can actually fail.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..');

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

const PRERENDER = readSource('pages/prerenderUrls.ts');
const APP = readSource('src/app/App.tsx');
const ROUTES = readSource('src/routes.ts');

/**
 * Removes TS comments. Negative assertions must run against CODE only: the
 * comment in prerenderUrls.ts that DOCUMENTS the removal names the removed URLs,
 * and asserting on the raw text would flag the documentation as the defect
 * (a trap this repo has hit before — see oauthOnlyAuthSurface.test.ts).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const PRERENDER_CODE = stripComments(PRERENDER);
const ROUTES_CODE = stripComments(ROUTES);
const APP_CODE = stripComments(APP);

/** The URLs removed with the email/password flow — sign-in is OAuth-only now. */
const REMOVED_AUTH_URLS = [
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/magic-link',
  '/auth/otp',
] as const;

/** The two auth pages that DO exist (reached from real email links). */
const LIVE_AUTH_URLS = ['/auth/email-confirm', '/auth/verify-email'] as const;

/**
 * The single rule both assertions and the negative control run through:
 * every prerendered `/auth/*` URL must have a route registered in App.tsx
 * (`<Route path="auth/email-confirm" …>` — no leading slash).
 */
export function prerenderedAuthUrlsWithoutRoutes(prerenderSrc: string, appSrc: string): string[] {
  const authUrls = [...stripComments(prerenderSrc).matchAll(/'([^']*\/auth\/[a-z0-9-]+)'/g)].map((m) => m[1]);
  return [...new Set(authUrls)].filter(
    (url) => !appSrc.includes(`path="${url.replace(/^\//, '')}"`),
  );
}

describe('auth URLs: prerendered ⟺ routed', () => {
  it('a prerendered /auth/* URL always has a route (the class that shipped 404s)', () => {
    const orphans = prerenderedAuthUrlsWithoutRoutes(PRERENDER_CODE, APP_CODE);
    expect(
      orphans,
      `these URLs are prerendered but have no route — the build would ship a static 404 page for them: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('the removed password-era URLs are neither prerendered nor routed', () => {
    for (const url of REMOVED_AUTH_URLS) {
      expect(PRERENDER_CODE, `${url} must not be prerendered`).not.toContain(url);
      expect(ROUTES_CODE, `${url} must not have a route constant`).not.toContain(url);
      expect(APP_CODE, `${url} must not be routed`).not.toContain(`path="${url.replace(/^\//, '')}"`);
    }
  });

  it('the two live auth pages stay prerendered and routed', () => {
    for (const url of LIVE_AUTH_URLS) {
      expect(PRERENDER, `${url} must stay prerendered`).toContain(url);
      expect(APP, `${url} must stay routed`).toContain(`path="${url.replace(/^\//, '')}"`);
    }
  });

  it('the password-era route constants are gone from src/routes.ts', () => {
    for (const constant of ['FORGOT_PASSWORD', 'RESET_PASSWORD', 'MAGIC_LINK', 'OTP_LOGIN']) {
      expect(ROUTES_CODE, `${constant} is dead code — nothing referenced it`).not.toContain(constant);
    }
    // The two that are real must remain, so this cannot pass by deleting too much.
    expect(ROUTES_CODE).toContain('EMAIL_CONFIRM');
    expect(ROUTES_CODE).toContain('AUTH_CALLBACK');
  });
});

describe('negative control — the checker can fail', () => {
  it('flags a prerendered auth URL with no route', () => {
    const fakePrerender = `export const PUBLIC_PRERENDER_URLS = ['/', '/auth/ghost-page'] as const;`;
    const fakeApp = `const x = <Route path="auth/email-confirm" element={<P />} />;`;
    expect(prerenderedAuthUrlsWithoutRoutes(fakePrerender, fakeApp)).toEqual(['/auth/ghost-page']);
  });

  it('does not flag a prerendered auth URL that IS routed', () => {
    const fakePrerender = `export const PUBLIC_PRERENDER_URLS = ['/auth/ghost-page'] as const;`;
    const fakeApp = `const x = <Route path="auth/ghost-page" element={<P />} />;`;
    expect(prerenderedAuthUrlsWithoutRoutes(fakePrerender, fakeApp)).toEqual([]);
  });
});
