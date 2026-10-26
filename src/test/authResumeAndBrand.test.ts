import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locks the "returning user resumes, never re-authenticates" behaviour.
 *
 * The defect this prevents, reported live after launch: someone who had
 * already signed up clicked Login, was shown the provider buttons again with
 * an "Already logged in" banner, went through GitHub a second time, watched a
 * "Processing…" page, and only then reached the dashboard they already had a
 * session for. Nothing failed — every step was individually correct — so no
 * test caught the flow as a whole.
 *
 * The invariant, one line: a persisted session must always outrank the
 * sign-in form, and a session with onboarding complete must never sit on a
 * confirmation screen.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..');

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

const LOGIN = readSource('src/components/LoginModal.tsx');
const LAYOUT = readSource('src/layouts/MainLayout.tsx');
const CALLBACK = readSource('src/pages/AuthCallbackPage.tsx');
const ACTION = readSource('src/lib/authAction.ts');

describe('a signed-in visitor is never asked to sign in again', () => {
  it('the login modal resumes an existing session instead of showing providers', () => {
    // The modal must resolve the real destination and leave — not render a
    // second OAuth round trip for a session that already exists.
    expect(LOGIN).toContain("import { getPostAuthPath } from '../lib/authAction'");
    expect(LOGIN).toMatch(/navigate\(getPostAuthPath\(user\)/);
    // Server-validated check, so a deleted account cannot "resume".
    expect(LOGIN).toContain('supabase.auth.getUser()');
    expect(LOGIN).toContain('isStaleSessionError');
    // The old banner that kept the provider buttons in front of a signed-in
    // user is gone.
    expect(LOGIN).not.toContain('Already logged in');
  });

  it('login/signup entry points route through to the dashboard when authenticated', () => {
    expect(LAYOUT).toContain("import { getPostAuthPath } from '../lib/authAction'");
    expect(LAYOUT).toMatch(/const resumeDestination = isAuthenticated && user \? getPostAuthPath\(user\) : null/);
    // Both the URL-driven (?modal=login|signup) and click-driven paths respect it.
    expect(LAYOUT).toMatch(/modal === 'login' \|\| modal === 'signup'\) && resumeDestination/);
    expect(LAYOUT.match(/navigate\(resumeDestination, \{ replace: true \}\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('the OAuth callback does not park a returning user on a success screen', () => {
    // The delay/status flash is gated on onboarding actually being pending.
    expect(CALLBACK).toContain('if (profile?.onboardingCompleted === false) {');
    // and it sits AFTER that gate, right before the redirect.
    const gate = CALLBACK.indexOf('profile?.onboardingCompleted === false) {');
    const redirect = CALLBACK.indexOf('redirectAfterAuth(profile);');
    expect(gate).toBeGreaterThan(-1);
    expect(redirect).toBeGreaterThan(gate);
    // No unconditional "success → sleep → redirect" remains.
    expect(CALLBACK).not.toMatch(/setStatus\('success'\);\s*\n\s*\n\s*\/\/ ⚡/);
  });

  it('the destination rules still send finished users to their role dashboard', () => {
    expect(ACTION).toContain("return '/client';");
    expect(ACTION).toContain("return '/dashboard';");
    expect(ACTION).toContain("return '/onboarding';");
  });
});

describe('the final brand email is the one users can actually reach', () => {
  const BRAND_EMAIL = 'growlanzo.own@gmail.com';

  it('the footer, legal pages and report form all show it', () => {
    for (const rel of [
      'src/components/SiteFooter.tsx',
      'src/pages/TermsPage.tsx',
      'src/pages/PrivacyPage.tsx',
      'src/pages/CookiesPage.tsx',
      'src/pages/ReportFeedbackPage.tsx',
    ]) {
      expect(readSource(rel), rel).toContain(BRAND_EMAIL);
    }
  });

  it('the mail sender default matches it', () => {
    expect(readSource('supabase/functions/_shared/brevo.ts')).toContain(BRAND_EMAIL);
  });

  it('the superseded address is gone from the shipped surfaces', () => {
    for (const rel of [
      'src/components/SiteFooter.tsx',
      'src/pages/TermsPage.tsx',
      'supabase/functions/_shared/brevo.ts',
      'public/manifest.json',
    ]) {
      expect(readSource(rel), rel).not.toContain('growlancer.own@gmail.com');
    }
  });
});
