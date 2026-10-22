/**
 * Guard for the custom-domain switch.
 *
 * scripts/push_redirect_urls.mjs writes the LIVE Supabase Auth `site_url` —
 * if that runs before the new domain really serves the app, every verification
 * / password-reset / OAuth link inside every already-sent email is broken.
 * scripts/domain-switch.mjs exists purely to make that impossible, so these
 * tests pin the properties that stop a regression:
 *
 *   1. domain-switch defaults to CHECK mode and never flips APP_URL before its
 *      pre-flight passes,
 *   2. it verifies real DNS + HTTPS (not just the string "verified"),
 *   3. the redirect pusher derives custom-domain entries from APP_URL instead
 *      of a hard-coded domain literal (which silently missed every other domain
 *      the moment the switch target changed).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');

const switcher = read('scripts/domain-switch.mjs');
const pusher = read('scripts/push_redirect_urls.mjs');
const preflight = read('scripts/founder-preflight.mjs');

describe('domain-switch fails closed', () => {
  it('defaults to --check, so a bare run cannot change anything', () => {
    expect(switcher).toContain("mode = '--check'");
    expect(switcher).toContain("mode !== '--check' && mode !== '--apply'");
  });

  it('refuses to continue when a single pre-flight check fails', () => {
    const checkIdx = switcher.indexOf('const ok = await check()');
    const refuseIdx = switcher.indexOf('NOTHING was changed');
    // the CALL site, not the `function flipEnvFile() {` definition
    const flipIdx = switcher.indexOf('flipEnvFile();');

    expect(checkIdx, 'the pre-flight must run first').toBeGreaterThan(-1);
    expect(refuseIdx, 'a failure must say nothing was changed').toBeGreaterThan(checkIdx);
    expect(refuseIdx).toBeLessThan(flipIdx);
    // and the refusal exits non-zero before APP_URL is touched
    expect(switcher.slice(refuseIdx, flipIdx)).toContain('process.exit(1)');
  });

  it('verifies DNS and a live HTTPS response before applying', () => {
    expect(switcher).toContain('resolve4');
    expect(switcher).toContain('https.get');
    // it must be THIS app on Vercel, not a registrar parking page
    expect(switcher).toContain('apex serves this app');
    expect(switcher).toContain('/vercel/i.test(apex.server)');
    expect(switcher).toContain('apex.body.includes');
    // the old origin must keep serving throughout the switch
    expect(switcher).toContain('old origin still serves');
    expect(switcher).toContain('growlancer.vercel.app');
  });

  it('exits non-zero when the domain does not resolve at all', () => {
    expect(switcher).toContain('the domain does not exist yet (buy it first)');
    // when DNS is missing it names the records to add...
    expect(switcher).toContain('cname.vercel-dns.com');
    expect(switcher).toContain('76.223.54.146');
    // ...but when DNS already resolves and only HTTPS fails (domain not yet
    // attached in Vercel), it must say THAT instead of blaming the DNS.
    expect(switcher).toContain('DNS resolves, but this domain is not serving the app yet');
    expect(switcher).toContain("r.name === 'apex DNS'");
  });
});

describe('redirect pusher derives the domain instead of hard-coding it', () => {
  it('has no literal custom-domain redirect entries left', () => {
    expect(pusher).not.toContain("'https://growlancer.com'");
    expect(pusher).not.toContain("'https://www.growlancer.com'");
  });

  it('builds apex + www entries from APP_URL', () => {
    expect(pusher).toContain('new URL(SITE_URL).host');
    expect(pusher).toContain('UNIQUE_REDIRECT_URLS');
    expect(pusher).toContain('/auth/callback');
    expect(pusher).toContain('/auth/email-confirm');
  });

  it('still refuses a scheme-less APP_URL', () => {
    expect(pusher).toContain('APP_URL is not an absolute URL');
    expect(pusher).toContain('APP_URL must be http(s)');
  });

  it('no longer guesses a fallback site_url', () => {
    expect(pusher).toContain('refusing to guess the site_url');
    expect(pusher).not.toMatch(/if \(!raw\) return 'https:/);
  });
});

describe('preflight checks the new guard', () => {
  it('asserts both the derivation and the fail-closed gate', () => {
    expect(preflight).toContain('derives the custom-domain redirects from APP_URL');
    expect(preflight).toContain('fails closed — no APP_URL flip until DNS + HTTPS verify');
    expect(preflight).toContain('scripts/domain-switch.mjs');
  });
});
