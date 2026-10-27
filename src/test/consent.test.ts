import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  clearConsent,
  hasConsent,
  hasConsentDecision,
  onOpenConsentPreferences,
  openConsentPreferences,
  readConsent,
  subscribeConsent,
  writeConsent,
} from '../lib/consent';

// The consent model is the contract every "we respect your choice" claim rests
// on, so each behaviour is pinned here: what is stored, what an old record
// means, and what happens when storage is unavailable.

describe('consent model', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts with no decision at all', () => {
    expect(readConsent()).toBeNull();
    expect(hasConsentDecision()).toBe(false);
    // Necessary storage works before anyone has answered — signing in must
    // never wait on (or be gated by) cookie consent.
    expect(hasConsent('necessary')).toBe(true);
    expect(hasConsent('analytics')).toBe(false);
  });

  it('stores an accept-all decision with the current schema', () => {
    const record = writeConsent(true);
    expect(record).not.toBeNull();
    expect(record).toMatchObject({ necessary: true, analytics: true, version: CONSENT_VERSION });
    expect(typeof record?.updatedAt).toBe('string');
    expect(Number.isNaN(Date.parse(record!.updatedAt))).toBe(false);

    const stored = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!);
    expect(stored.analytics).toBe(true);
    expect(stored.necessary).toBe(true);

    expect(hasConsent('analytics')).toBe(true);
    expect(hasConsentDecision()).toBe(true);
  });

  it('stores a reject-optional decision without turning anything else off', () => {
    writeConsent(false);
    expect(hasConsent('analytics')).toBe(false);
    // The answer itself still persists, otherwise the visitor is asked forever.
    expect(hasConsentDecision()).toBe(true);
    expect(hasConsent('necessary')).toBe(true);
  });

  it('treats a record from an older notice as no decision', () => {
    // The v1 notice offered categories nothing implemented, so a v1 answer is
    // not consent to the v2 notice — the visitor must be asked again.
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ necessary: true, functional: true, analytics: true, marketing: true, version: 1 })
    );
    expect(readConsent()).toBeNull();
    expect(hasConsent('analytics')).toBe(false);
  });

  it('ignores corrupt or hostile stored values', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, '{not json');
    expect(readConsent()).toBeNull();

    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: 'yes' }));
    expect(readConsent()).toBeNull();

    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ necessary: false, analytics: true, version: 2, updatedAt: 'x' }));
    expect(readConsent()).toBeNull();
  });

  it('clears a decision so the notice returns', () => {
    writeConsent(true);
    clearConsent();
    expect(readConsent()).toBeNull();
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
  });

  it('notifies subscribers on save and on clear', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConsent(listener);

    writeConsent(true);
    expect(listener).toHaveBeenCalledTimes(1);

    clearConsent();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    writeConsent(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('lets any page ask for the preferences panel', () => {
    const handler = vi.fn();
    const unsubscribe = onOpenConsentPreferences(handler);

    openConsentPreferences();
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    openConsentPreferences();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns null and leaves the notice up when storage is blocked', () => {
    // A visitor in private mode with storage disabled must not be shown a
    // dismissed notice whose answer was never saved.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(writeConsent(true)).toBeNull();
    expect(readConsent()).toBeNull();
    setItem.mockRestore();
  });
});
