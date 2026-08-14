// ────────────────────────────────────────────────────────────────────────────
// Browser fingerprint + same-browser account detection
//
// Prevents referral-abuse: one browser = one account. When a user signs up or
// signs in, a lightweight fingerprint + the account email are stored in
// localStorage. If they try to create ANOTHER account on the SAME browser, the
// signup form shows a red warning in real-time.
//
// Privacy-friendly: no canvas/audio fingerprinting, no network calls — only
// stable, non-identifying signals (UA, language, timezone, screen, platform).
// ────────────────────────────────────────────────────────────────────────────

const BROWSER_ACCOUNT_KEY = 'growlancer_browser_account_v1';

interface BrowserAccountRecord {
  /** Stable hash of the browser signals (same machine/browser profile) */
  fingerprint: string;
  /** Email of the account created / signed-in on this browser */
  email: string;
  /** When the account was first recorded */
  recordedAt: number;
  /** Role chosen at signup (freelancer / client) */
  role?: string;
}

/** Simple deterministic string hash (FNV-1a 32-bit) — no crypto needed. */
function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Computes a stable, privacy-friendly browser fingerprint from non-identifying
 * signals. Same browser profile → same fingerprint.
 */
export function getBrowserFingerprint(): string {
  const signals: string[] = [];

  try {
    const nav = window.navigator;
    signals.push(nav.userAgent || '');
    signals.push(nav.language || '');
    signals.push(Array.isArray(nav.languages) ? nav.languages.join(',') : '');
    signals.push(String(nav.platform || ''));
    signals.push(String(nav.hardwareConcurrency || ''));
    // deviceMemory is not in the TS lib types — access via a safe cast (Chrome/Edge only, best-effort)
    const deviceMemory = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
    signals.push(String(deviceMemory || ''));
    signals.push(nav.maxTouchPoints ? 'touch' : 'no-touch');
    signals.push(String(screen?.width || ''), String(screen?.height || ''));
    signals.push(String(screen?.colorDepth || ''));
    signals.push(String(new Date().getTimezoneOffset()));
  } catch {
    // Fall back to the minimal set — private browsing / locked-down browsers
    signals.push('unknown');
  }

  return hashString(signals.join('|'));
}

/** Reads the account recorded for this browser (if any). */
export function getBrowserAccount(): BrowserAccountRecord | null {
  try {
    const raw = localStorage.getItem(BROWSER_ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BrowserAccountRecord;
    if (!parsed?.fingerprint || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Records that an account was created / signed-in on this browser.
 * Idempotent — keeps the FIRST email unless force=true.
 */
export function recordBrowserAccount(
  email: string,
  role?: string,
  force = false
): void {
  try {
    const fingerprint = getBrowserFingerprint();
    const existing = getBrowserAccount();
    if (existing && existing.fingerprint === fingerprint && !force) return;

    const record: BrowserAccountRecord = {
      fingerprint,
      email: email.trim().toLowerCase(),
      recordedAt: Date.now(),
      role,
    };
    localStorage.setItem(BROWSER_ACCOUNT_KEY, JSON.stringify(record));
  } catch {
    // localStorage unavailable (private mode / storage disabled) — best-effort
  }
}

/**
 * Clears the recorded browser account marker (e.g. when the recorded account
 * no longer exists — user deleted it — or on logout of a deleted account).
 * Returns true if a marker was actually removed.
 */
export function clearBrowserAccount(): boolean {
  try {
    if (localStorage.getItem(BROWSER_ACCOUNT_KEY)) {
      localStorage.removeItem(BROWSER_ACCOUNT_KEY);
      return true;
    }
  } catch {
    // localStorage unavailable — best-effort
  }
  return false;
}

/**
 * Real-time same-browser check: true when THIS browser already has a Growlancer
 * account recorded (different from the email currently being typed).
 * @param currentEmail The email being typed in the signup form (optional)
 */
export function hasSameBrowserAccount(currentEmail?: string): boolean {
  const account = getBrowserAccount();
  if (!account) return false;

  // No email typed yet (or still incomplete) — don't warn until we can compare
  // against the recorded account. Prevents the banner from appearing the moment
  // the signup modal opens, before the user types anything.
  const typed = (currentEmail ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(typed)) return false;

  // Typing the SAME email they already registered is just them — not a
  // new-account attempt. Only flag DIFFERENT complete emails.
  if (typed === account.email) return false;

  return true;
}

/** Returns the recorded email for display in the warning banner. */
export function getSameBrowserEmail(): string | null {
  return getBrowserAccount()?.email || null;
}
