import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Edge-function site URLs — locked at the source level.
 *
 * Every outbound email (logo, action links, footer), every payment redirect and
 * the AI gateway attribution header must come from ONE place:
 * `supabase/functions/_shared/site.ts`, which reads the `APP_URL` secret.
 *
 * Why this matters: switching to the custom domain (growlancer.vercel.app ->
 * growlancer.com) must be a SECRET change, not a hunt through 12 functions.
 * Before this guard the origin was hardcoded in 12 files, the two crons sent
 * users to `growlancer.com` while everyone else sent them to the Vercel origin,
 * and a missed site silently kept leaking the old domain into customer emails.
 *
 * The scan is a pure function over a path->content map so the negative controls
 * below exercise the exact code the real assertion uses.
 */

declare global {
  // Minimal Deno surface used by the edge-function resolver. The real global
  // only exists inside the Deno runtime; tests inject a stub so the resolver
  // can be imported and exercised under vitest. A global can only be declared
  // with `var`, hence the rule exception.
  // eslint-disable-next-line no-var
  var Deno: { env: { get(key: string): string | undefined } };
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EDGE_FUNCTIONS = 'supabase/functions';
const RESOLVER = `${EDGE_FUNCTIONS}/_shared/site.ts`;

/**
 * Files that may legitimately contain a literal growlancer origin.
 *  - `_shared/cors.ts` is a *multi*-domain allow-list by design: the Vercel
 *    origin, the apex and www all have to be accepted at once while the custom
 *    domain rolls out. That list is not "the site URL" and must not be reduced
 *    to one value.
 *  - The resolver itself holds the documented fallback origin.
 */
const ALLOWED_HARDCODED = new Set([`${EDGE_FUNCTIONS}/_shared/cors.ts`, RESOLVER]);

/** A site URL — deliberately NOT matching an email address (mailto:, admin@…). */
const SITE_URL_RE = /https:\/\/(?:www\.)?growlancer\.(?:com|vercel\.app)/;
const APP_URL_ENV_RE = /Deno\.env\.get\(\s*'APP_URL'\s*\)/;

/** Every .ts file under supabase/functions, keyed by repo-relative path. */
function readEdgeFunctions(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.ts')) files[rel] = readFileSync(path.join(root, rel), 'utf8');
    }
  };
  walk(EDGE_FUNCTIONS);
  return files;
}

const edgeFiles = readEdgeFunctions();

/** Pure scan: which files still hardcode a growlancer site URL. */
function findHardcodedSiteUrls(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([rel]) => !ALLOWED_HARDCODED.has(rel))
    .filter(([, content]) => SITE_URL_RE.test(content))
    .map(([rel]) => rel)
    .sort();
}

/** Pure scan: which files bypass the resolver and read APP_URL themselves. */
function findDirectAppUrlReads(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([rel]) => rel !== RESOLVER)
    .filter(([, content]) => APP_URL_ENV_RE.test(content))
    .map(([rel]) => rel)
    .sort();
}

/** Load the resolver fresh, with a stubbed Deno environment. */
async function loadResolver(env: Record<string, string | undefined>) {
  globalThis.Deno = { env: { get: (key: string) => env[key] } };
  vi.resetModules();
  return import('../../supabase/functions/_shared/site');
}

afterEach(() => {
  vi.restoreAllMocks();
  // The stub only exists for the duration of a test.
  delete (globalThis as Record<string, unknown>).Deno;
});

describe('shared site-URL resolver', () => {
  it('uses the APP_URL secret and strips a trailing slash', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const site = await loadResolver({ APP_URL: 'https://growlancer.com/' });

    expect(site.SITE_URL).toBe('https://growlancer.com');
    expect(warn).not.toHaveBeenCalled();
  });

  it('builds absolute URLs for relative paths', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const site = await loadResolver({ APP_URL: 'https://growlancer.com' });

    expect(site.siteUrl('')).toBe('https://growlancer.com');
    expect(site.siteUrl('/dashboard/subscription')).toBe(
      'https://growlancer.com/dashboard/subscription',
    );
    // A missing leading slash must not produce `https://hostpath`.
    expect(site.siteUrl('payment/success')).toBe('https://growlancer.com/payment/success');
  });

  it('falls back to the exported origin AND warns loudly when APP_URL is unset', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const site = await loadResolver({});

    expect(site.SITE_URL).toBe(site.FALLBACK_SITE_URL);
    expect(site.SITE_URL).toMatch(/^https:\/\//);
    // Never silent: a missing secret must be visible in the function logs.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('APP_URL');
  });
});

describe('site-URL single source of truth (source level)', () => {
  it('only the resolver reads the APP_URL secret', () => {
    expect(findDirectAppUrlReads(edgeFiles)).toEqual([]);
  });

  it('no edge function hardcodes a growlancer site URL outside the allow-list', () => {
    expect(findHardcodedSiteUrls(edgeFiles)).toEqual([]);
  });

  it('every function that used to hardcode the origin now imports the resolver', () => {
    const consumers = [
      '_shared/ai.ts',
      'admin-data/index.ts',
      'email-notifications/index.ts',
      'internship-applications/index.ts',
      'milestone-auto-release/index.ts',
      'newsletter-subscribe/index.ts',
      'paypal/index.ts',
      'proposal-notifications/index.ts',
      'security-alert-notify/index.ts',
      'submit-report/index.ts',
      'subscription-billing-cron/index.ts',
      'withdrawal/index.ts',
    ];

    const missing = consumers.filter((rel) => {
      const content = edgeFiles[`${EDGE_FUNCTIONS}/${rel}`];
      expect(content, `${rel} must exist`).toBeDefined();
      return !/_shared\/site\.ts|\.\/site\.ts/.test(content);
    });

    expect(missing).toEqual([]);
  });
});

describe('the scan itself (negative + positive controls)', () => {
  it('flags a hardcoded site URL', () => {
    const planted = {
      'x/index.ts': `const APP_URL = 'https://growlancer.vercel.app';`,
      'y/index.ts': `<a href="https://www.growlancer.com/contact">Contact</a>`,
    };
    expect(findHardcodedSiteUrls(planted)).toEqual(['x/index.ts', 'y/index.ts']);
  });

  it('does NOT flag the allow-listed files', () => {
    const allowListed = {
      [`${EDGE_FUNCTIONS}/_shared/cors.ts`]: `'https://growlancer.com',`,
      [RESOLVER]: `export const FALLBACK_SITE_URL = 'https://growlancer.vercel.app';`,
    };
    expect(findHardcodedSiteUrls(allowListed)).toEqual([]);
  });

  it('does NOT flag an email address at the same domain', () => {
    // `support@growlancer.com` / `admin@growlancer.com` are mailboxes, not site
    // URLs. An over-broad pattern would flag them and train people to ignore it.
    const emails = {
      'notify/index.ts': `<a href="mailto:support@growlancer.com">support</a>`,
      'admin/index.ts': `const ADMIN_EMAIL = 'admin@growlancer.com';`,
    };
    expect(findHardcodedSiteUrls(emails)).toEqual([]);
  });

  it('flags a direct APP_URL read that bypasses the resolver', () => {
    const planted = {
      [RESOLVER]: `Deno.env.get('APP_URL')`,
      'z/index.ts': `const APP_URL = Deno.env.get('APP_URL') ?? 'x'`,
    };
    expect(findDirectAppUrlReads(planted)).toEqual(['z/index.ts']);
  });
});
