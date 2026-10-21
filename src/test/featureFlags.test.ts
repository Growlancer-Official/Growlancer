import { describe, it, expect } from 'vitest';
import { isDeferredRoute, isFeatureEnabled } from '../lib/featureFlags';

/**
 * The SPA side of the early-access switch.
 *
 * Two things can go wrong here, and both are silent:
 *   1. A deferred module defaults to ON, so the release advertises what the API
 *      refuses (410) — the user sees a dead end.
 *   2. `isDeferredRoute` is too greedy and removes a LIVE route from the
 *      sidebar — e.g. `/client/contracts` swallowed by a `/client/contests`
 *      prefix rule. That would hide the core marketplace from clients.
 *
 * The negative cases below are therefore as important as the positive ones.
 */

describe('client feature switches', () => {
  it('defaults every deferred module to OFF', () => {
    expect(isFeatureEnabled('internships')).toBe(false);
    expect(isFeatureEnabled('certificates')).toBe(false);
    expect(isFeatureEnabled('contests')).toBe(false);
  });

  it('treats every deferred URL as deferred by default', () => {
    const deferred = [
      '/internships',
      '/careers',
      '/admin/internships',
      '/certificate',
      '/certificate/GRW-1234',
      '/verify-certificate',
      '/verify-certificate/GRW-1234',
      '/dashboard/certifications',
      '/dashboard/certifications/test-abc',
      '/admin/certificates',
      '/contests',
      '/contests/abc123',
      '/dashboard/contests',
      '/client/contests',
      '/client/contests/create',
    ];
    for (const path of deferred) {
      expect(isDeferredRoute(path), `${path} must be deferred`).toBe(true);
    }
  });

  it('never swallows a live marketplace route', () => {
    const live = [
      '/',
      '/pricing',
      '/freelancers',
      '/services',
      '/services/abc123',
      '/projects/abc123',
      '/help-center',
      '/terms',
      '/dashboard',
      '/dashboard/contracts',
      '/dashboard/wallet',
      '/dashboard/referrals',
      '/dashboard/profile',
      '/client',
      '/client/contracts',
      '/client/contracts/abc123',
      '/client/workspace/abc123',
      '/client/projects',
      '/client/proposals',
      '/client/referrals',
    ];
    for (const path of live) {
      expect(isDeferredRoute(path), `${path} must stay visible`).toBe(false);
    }
  });

  it('ignores query strings and hashes, and tolerates missing paths', () => {
    expect(isDeferredRoute('/contests?tab=open')).toBe(true);
    expect(isDeferredRoute('/client/contracts?tab=messages#thread')).toBe(false);
    expect(isDeferredRoute('/internships#roles')).toBe(true);
    expect(isDeferredRoute(null)).toBe(false);
    expect(isDeferredRoute(undefined)).toBe(false);
    expect(isDeferredRoute('')).toBe(false);
  });
});
