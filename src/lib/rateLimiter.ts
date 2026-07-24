/**
 * Rate Limiter — Client-side progressive delay for login attempts.
 *
 * Tracks failed login attempts per email address and imposes
 * progressive delays to prevent brute-force attacks.
 *
 * The delay resets after 15 minutes of inactivity or on successful login.
 */

interface RateLimitEntry {
  attempts: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

// In-memory store (resets on page refresh — server-side rate limiting
// via the admin-data edge function handles persistent protection)
const store = new Map<string, RateLimitEntry>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the number of milliseconds the caller should wait before
 * attempting another login for `email`.  Returns 0 if no delay is needed.
 */
export function getLoginDelay(email: string): number {
  const entry = store.get(normalizeKey(email));
  if (!entry) return 0;

  const now = Date.now();
  if (now - entry.firstAttemptAt > WINDOW_MS) {
    store.delete(normalizeKey(email));
    return 0;
  }

  const { attempts } = entry;

  // Progressive delay tiers
  if (attempts <= 3) return 0;          // first 3 → no delay
  if (attempts <= 5) return 1_000;      // 4-5     → 1 second
  if (attempts <= 8) return 3_000;      // 6-8     → 3 seconds
  if (attempts <= 10) return 5_000;     // 9-10    → 5 seconds
  return 10_000;                         // 11+     → 10 seconds
}

/**
 * Records a failed login attempt for the given email.
 */
export function recordLoginAttempt(email: string): void {
  const key = normalizeKey(email);
  const now = Date.now();
  const existing = store.get(key);

  if (!existing) {
    store.set(key, { attempts: 1, firstAttemptAt: now, lastAttemptAt: now });
    return;
  }

  // Reset if the window has expired
  if (now - existing.firstAttemptAt > WINDOW_MS) {
    store.set(key, { attempts: 1, firstAttemptAt: now, lastAttemptAt: now });
    return;
  }

  existing.attempts += 1;
  existing.lastAttemptAt = now;
}

/**
 * Resets the attempt counter for a given email (call on successful login).
 */
export function resetLoginAttempts(email: string): void {
  store.delete(normalizeKey(email));
}

/**
 * Returns how many attempts remain before the maximum is reached.
 */
export function getRemainingAttempts(email: string): number {
  const key = normalizeKey(email);
  const entry = store.get(key);
  if (!entry) return MAX_ATTEMPTS;

  const now = Date.now();
  if (now - entry.firstAttemptAt > WINDOW_MS) {
    store.delete(key);
    return MAX_ATTEMPTS;
  }

  return Math.max(0, MAX_ATTEMPTS - entry.attempts);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeKey(email: string): string {
  return email.trim().toLowerCase();
}
