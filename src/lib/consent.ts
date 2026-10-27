// ────────────────────────────────────────────────────────────────────────────
// Consent — the single source of truth for what the visitor allowed.
//
// ⚠️ THE RULE THIS FILE EXISTS TO ENFORCE: the banner may only offer a
// category that something in this codebase actually reads. Categories were
// removed, not renamed, when it turned out nothing implemented them:
//
//   • "marketing"  — there is no advertising, retargeting or profiling code in
//                    the product, so offering a switch for it (and telling the
//                    visitor it controls "personalized advertisements") was a
//                    false statement, not a preference.
//   • "functional" — the only preference it claimed to cover was the theme,
//                    and Growlanzo is light-only now (see ThemeContext). The
//                    language preference is stored regardless of consent
//                    because it is part of rendering the page correctly, not
//                    an optional tracker.
//
// What remains is real and each one has a consumer:
//
//   necessary  — Supabase's auth session, the 24h activity marker, the
//                provider/return breadcrumbs, and this consent record itself.
//                All strictly required to sign in and stay signed in.
//   analytics  — Vercel Analytics + Speed Insights (aggregate page views and
//                real-user performance). Cookieless, off by default, and
//                loaded ONLY after this flag is true (ConsentGatedAnalytics).
//
// Stored in localStorage rather than a cookie: nothing here needs to travel to
// the server on every request, and localStorage is not sent to third parties.
// ────────────────────────────────────────────────────────────────────────────

export type ConsentCategory = 'necessary' | 'analytics';

export interface ConsentPreferences {
  /** Always true — signing in is impossible without it. Not a choice. */
  necessary: true;
  /** Aggregate, cookieless page-view + performance measurement. */
  analytics: boolean;
  /** Schema version of the consent notice the visitor agreed to. */
  version: number;
  /** ISO timestamp of the decision (user-facing, in the policy + settings). */
  updatedAt: string;
}

/**
 * Bump when the notice changes materially. A stored record from an older
 * version is treated as absent, so the visitor is asked again under the new
 * wording instead of being held to a decision they never actually made.
 * v1 offered four categories including one nothing implemented — its answers
 * do not carry over.
 */
export const CONSENT_VERSION = 2;

export const CONSENT_STORAGE_KEY = 'growlancer_consent';

/** Fired on the window when the visitor asks to reopen the preferences panel. */
export const CONSENT_OPEN_EVENT = 'growlancer:open-cookie-preferences';

/** Fired on the window when a choice is saved or cleared (same tab). */
export const CONSENT_CHANGED_EVENT = 'growlancer:consent-changed';

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    // Access itself throws when storage is blocked (Safari private mode).
    return false;
  }
}

function isPreferences(value: unknown): value is ConsentPreferences {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ConsentPreferences>;
  return (
    candidate.necessary === true &&
    typeof candidate.analytics === 'boolean' &&
    candidate.version === CONSENT_VERSION &&
    typeof candidate.updatedAt === 'string'
  );
}

/** The stored decision, or null when there is none (or it is out of date). */
export function readConsent(): ConsentPreferences | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPreferences(parsed) ? parsed : null;
  } catch {
    // Corrupt JSON (hand-edited, half-written) — treat as no decision yet.
    return null;
  }
}

/**
 * Persist a decision. Returns the stored record, or null when storage is
 * unavailable — callers must NOT dismiss the banner on null, otherwise the
 * visitor would be asked again on the next page and never be able to answer.
 */
export function writeConsent(analytics: boolean): ConsentPreferences | null {
  if (!storageAvailable()) return null;
  const record: ConsentPreferences = {
    necessary: true,
    analytics: analytics === true,
    version: CONSENT_VERSION,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    return null;
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
  } catch {
    // CustomEvent unavailable — subscribers still get the next mount's read.
  }
  return record;
}

/** Withdraw/remove the stored decision (banner reappears on next load). */
export function clearConsent(): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // Nothing else to do — the caller still re-renders from state.
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

/**
 * True when the visitor has allowed `category`. `necessary` is always true by
 * definition; storing it as a toggle would imply signing in is optional.
 */
export function hasConsent(category: ConsentCategory): boolean {
  if (category === 'necessary') return true;
  return readConsent()?.analytics === true;
}

/** True once the visitor has answered at all (regardless of the answer). */
export function hasConsentDecision(): boolean {
  return readConsent() !== null;
}

/**
 * Notify on any consent change — from this tab (custom event), from another
 * tab (storage event), or from a save/clear. Returns an unsubscribe function.
 */
export function subscribeConsent(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    // `key === null` means another tab called clear() on all of localStorage.
    if (event.key === CONSENT_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CONSENT_CHANGED_EVENT, listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CONSENT_CHANGED_EVENT, listener);
  };
}

/**
 * Reopen the preferences panel from anywhere (footer, Cookie Policy page).
 * The banner mounts the listener, so this is a no-op only when the consent
 * component is not on the page — every route renders it.
 */
export function openConsentPreferences(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
  } catch {
    // ignore
  }
}

/** Subscribe to "reopen preferences" requests. Returns an unsubscribe fn. */
export function onOpenConsentPreferences(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CONSENT_OPEN_EVENT, handler);
  return () => window.removeEventListener(CONSENT_OPEN_EVENT, handler);
}
