// ═══════════════════════════════════════════════════════════════
// Reauthentication utilities — verify identity before sensitive
// actions (change email, change password, delete account,
// withdrawals, etc.)
//
// Flow: sensitive action → ask for password OR send OTP → verify →
// grant a short-lived 10-minute window → run the requested action.
//
// Separate from the React component so ReauthDialog.tsx complies
// with react-refresh/only-export-components.
// ═══════════════════════════════════════════════════════════════

export const REAUTH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const REAUTH_KEY = 'growlancer_reauth_verified_at';
export const OTP_ATTEMPT_LIMIT = 5;
export const OTP_RESEND_COOLDOWN_S = 30;

/** True if a reauthentication is still valid (within the 10-minute window). */
export function isReauthValid(): boolean {
  try {
    const stored = Number(localStorage.getItem(REAUTH_KEY) || 0);
    return stored > 0 && Date.now() - stored < REAUTH_WINDOW_MS;
  } catch {
    return false;
  }
}

/** Mark identity as verified (used after a successful reauth). */
export function markReauthVerified(): void {
  try {
    localStorage.setItem(REAUTH_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** Clear the reauth window (e.g. after sign-out). */
export function clearReauth(): void {
  try {
    localStorage.removeItem(REAUTH_KEY);
  } catch {
    // ignore
  }
}

/** Time (ms) remaining in the current reauth window, or 0. */
export function getReauthRemainingMs(): number {
  try {
    const stored = Number(localStorage.getItem(REAUTH_KEY) || 0);
    if (!stored) return 0;
    const remaining = stored + REAUTH_WINDOW_MS - Date.now();
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}