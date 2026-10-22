import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  alternateProvider,
  beginOAuthAttempt,
  clearOAuthAttempt,
  describeOAuthFailure,
  isStaleAttempt,
  OAUTH_ATTEMPT_MAX_AGE_MS,
  OAUTH_ATTEMPT_STALE_MS,
  providerDisplayName,
  readOAuthAttempt,
} from '../lib/oauthDiagnostics';

/**
 * Contract for the OAuth failure path.
 *
 * The defect this locks (founder report, Oct 14 2026 — "LinkedIn se signup nahi
 * ho raha, error aata hai"): live GoTrue logs showed three `302 → linkedin.com`
 * redirects and then nothing — no /callback, no session, no error. The app had
 * no breadcrumb and no copy for that state, so an unfinished sign-in was
 * indistinguishable from a broken product.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

beforeEach(() => {
  window.localStorage.clear();
});

describe('pending sign-in breadcrumb', () => {
  it('records the provider and timestamp before leaving for the provider', () => {
    beginOAuthAttempt('linkedin_oidc', 'client');
    const attempt = readOAuthAttempt();
    expect(attempt?.provider).toBe('linkedin_oidc');
    expect(attempt?.role).toBe('client');
    expect(typeof attempt?.startedAt).toBe('number');
  });

  it('is stale only once the page load clearly happened after the start', () => {
    const now = 1_000_000_000;
    const fresh = { provider: 'github', startedAt: now - 1_000 };
    const stale = { provider: 'github', startedAt: now - OAUTH_ATTEMPT_STALE_MS };

    expect(isStaleAttempt(fresh, now)).toBe(false);
    expect(isStaleAttempt(stale, now)).toBe(true);
  });

  it('expires so an old attempt never greets someone days later', () => {
    const now = 2_000_000_000;
    window.localStorage.setItem(
      'growlancer_oauth_pending',
      JSON.stringify({ provider: 'github', startedAt: now - OAUTH_ATTEMPT_MAX_AGE_MS - 1 })
    );
    expect(readOAuthAttempt(now)).toBeNull();
    // …and it is cleaned up rather than lingering.
    expect(window.localStorage.getItem('growlancer_oauth_pending')).toBeNull();
  });

  it('drops an unreadable record instead of guessing', () => {
    window.localStorage.setItem('growlancer_oauth_pending', '{not json');
    expect(readOAuthAttempt()).toBeNull();
    window.localStorage.setItem('growlancer_oauth_pending', JSON.stringify({ provider: 42 }));
    expect(readOAuthAttempt()).toBeNull();
  });

  it('clearing removes it (success, dismiss and sign-out all clear it)', () => {
    beginOAuthAttempt('github');
    clearOAuthAttempt();
    expect(readOAuthAttempt()).toBeNull();
  });
});

describe('describeOAuthFailure', () => {
  it('treats a cancelled consent screen as cancelled, not as a failure', () => {
    for (const code of ['access_denied', 'user_cancelled_login', 'user_cancelled_authorize']) {
      const copy = describeOAuthFailure({ provider: 'linkedin_oidc', error: code });
      expect(copy.title).toContain('LinkedIn');
      expect(copy.title.toLowerCase()).toContain('cancel');
      expect(copy.message).toMatch(/no Growlanzo account was created/i);
    }
  });

  it('names the provider when it never returned (no code, no error, no session)', () => {
    const copy = describeOAuthFailure({ provider: 'linkedin_oidc' });
    expect(copy.title).toBe('LinkedIn did not send you back');
    expect(copy.message).toMatch(/no account was created or changed/i);
    expect(copy.retryable).toBe(true);
  });

  it('explains a missing provider email instead of blaming the app', () => {
    const copy = describeOAuthFailure({
      provider: 'github',
      error: 'invalid_request',
      errorCode: 'email_not_provided',
      description: 'Error getting user email from external provider',
    });
    expect(copy.title).toContain('did not share an email');
    expect(copy.message).toMatch(/verified email/i);
  });

  it('explains a replayed / invalid state handshake', () => {
    const copy = describeOAuthFailure({
      provider: 'github',
      error: 'invalid_request',
      errorCode: 'bad_oauth_state',
      description: 'OAuth state parameter is invalid',
    });
    expect(copy.message).toMatch(/opened twice|refreshed/i);
    expect(copy.title).not.toMatch(/cancelled/i);
  });

  it('falls back to the provider description when it has one', () => {
    const copy = describeOAuthFailure({
      provider: 'github',
      error: 'server_error',
      description: 'Upstream provider hiccup',
    });
    expect(copy.message).toContain('Upstream provider hiccup');
  });

  it('always names the provider it was given', () => {
    expect(providerDisplayName('linkedin_oidc')).toBe('LinkedIn');
    expect(providerDisplayName('github')).toBe('GitHub');
    expect(alternateProvider('linkedin_oidc')).toBe('github');
    expect(alternateProvider('github')).toBe('linkedin_oidc');
  });
});

describe('the app is wired to report instead of dead-ending', () => {
  it('the sign-in action records the breadcrumb before redirecting', () => {
    const source = read('src/context/AuthContext.tsx');
    expect(source).toContain("from '../lib/oauthDiagnostics'");
    expect(source).toContain('beginOAuthAttempt(provider, role)');
    // and clears it on the way out
    expect(source).toContain('clearOAuthAttempt()');
  });

  it('the callback page maps provider errors and clears the breadcrumb on success', () => {
    const source = read('src/pages/AuthCallbackPage.tsx');
    expect(source).toContain('describeOAuthFailure({');
    expect(source).toContain('clearOAuthAttempt()');
    // The old copy blamed the redirect configuration for every OAuth failure.
    expect(source).not.toMatch(
      /does not complete\. This usually means the redirect URL is not configured/
    );
  });

  it('a global notice renders the unanswered state somewhere the user actually is', () => {
    const app = read('src/app/App.tsx');
    expect(app).toContain("from '../components/OAuthReturnNotice'");
    expect(app).toContain('<OAuthReturnNotice />');

    const notice = read('src/components/OAuthReturnNotice.tsx');
    expect(notice).toContain('readOAuthAttempt()');
    expect(notice).toContain('isStaleAttempt(attempt)');
    // Never layered on top of the callback page's own honest state.
    expect(notice).toContain("location.pathname.startsWith('/auth/')");
  });
});
