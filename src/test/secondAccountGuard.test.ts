import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getBrowserFingerprint } from '../lib/browserIdentity';
import {
  SECOND_ACCOUNT_APPROVED_KEY,
  approveSecondAccount,
  consumeSecondAccountApproval,
  detectSecondAccount,
} from '../lib/secondAccountGuard';

const BROWSER_ACCOUNT_KEY = 'growlancer_browser_account_v1';

function recordAccount(email: string, fingerprint = getBrowserFingerprint(), provider?: string) {
  localStorage.setItem(
    BROWSER_ACCOUNT_KEY,
    JSON.stringify({
      fingerprint,
      email: email.toLowerCase(),
      recordedAt: Date.now(),
      role: 'freelancer',
      ...(provider ? { provider } : {}),
    })
  );
}

describe('detectSecondAccount', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('says nothing when this browser has no recorded account', () => {
    expect(detectSecondAccount('someone@example.com')).toBeNull();
  });

  it('says nothing when the same account signs back in', () => {
    recordAccount('owner@example.com', getBrowserFingerprint(), 'linkedin_oidc');
    expect(detectSecondAccount('owner@example.com')).toBeNull();
    // Casing from a provider must never read as a different person.
    expect(detectSecondAccount('  Owner@Example.COM ')).toBeNull();
  });

  it('flags a different identity on the same browser and names the existing one', () => {
    recordAccount('owner@example.com', getBrowserFingerprint(), 'linkedin_oidc');
    const candidate = detectSecondAccount('other@example.com');
    expect(candidate).toEqual({
      existingEmail: 'owner@example.com',
      incomingEmail: 'other@example.com',
      existingProvider: 'linkedin_oidc',
    });
  });

  it('omits the provider when the record predates it', () => {
    recordAccount('owner@example.com');
    expect(detectSecondAccount('other@example.com')?.existingProvider).toBeUndefined();
  });

  it('ignores a record written by a different browser profile', () => {
    // A shared machine must not accuse the next person of anything.
    recordAccount('owner@example.com', 'deadbeef');
    expect(detectSecondAccount('other@example.com')).toBeNull();
  });

  it('ignores an unusable incoming email', () => {
    recordAccount('owner@example.com');
    expect(detectSecondAccount('')).toBeNull();
    expect(detectSecondAccount(null)).toBeNull();
    expect(detectSecondAccount(undefined)).toBeNull();
  });

  it('ignores an unreadable record instead of throwing', () => {
    localStorage.setItem(BROWSER_ACCOUNT_KEY, '{oops');
    expect(detectSecondAccount('other@example.com')).toBeNull();
  });
});

describe('second-account approval', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('is one-shot', () => {
    approveSecondAccount();
    expect(consumeSecondAccountApproval()).toBe(true);
    // The decision was for that round trip only.
    expect(consumeSecondAccountApproval()).toBe(false);
  });

  it('is absent until given', () => {
    expect(consumeSecondAccountApproval()).toBe(false);
  });

  it('expires, so an old approval cannot licence a later silent account', () => {
    localStorage.setItem(SECOND_ACCOUNT_APPROVED_KEY, String(Date.now() - 11 * 60 * 1000));
    expect(consumeSecondAccountApproval()).toBe(false);
    expect(localStorage.getItem(SECOND_ACCOUNT_APPROVED_KEY)).toBeNull();
  });

  it('rejects a malformed approval', () => {
    localStorage.setItem(SECOND_ACCOUNT_APPROVED_KEY, 'yes');
    expect(consumeSecondAccountApproval()).toBe(false);
    expect(localStorage.getItem(SECOND_ACCOUNT_APPROVED_KEY)).toBeNull();
  });
});
