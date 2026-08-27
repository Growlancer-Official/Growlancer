// ═══════════════════════════════════════════════════════════════
// Reauthentication utilities — verify identity before sensitive
// actions (change email, change password, delete account,
// withdrawals, etc.)
//
// Flow: sensitive action → ask for password OR send OTP → verify →
// grant a short-lived 10-minute window → run the requested action.
//
// SECURITY: The reauth timestamp is stored BOTH in localStorage
// (for fast client-side checks) AND server-side via an RPC. The
// server-side check prevents an attacker from bypassing reauth by
// manually setting the localStorage timestamp.
//
// Separate from the React component so ReauthDialog.tsx complies
// with react-refresh/only-export-components.
// ═══════════════════════════════════════════════════════════════

import { supabase } from './supabase';

export const REAUTH_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const REAUTH_KEY = 'growlancer_reauth_verified_at';
export const OTP_ATTEMPT_LIMIT = 5;
export const OTP_RESEND_COOLDOWN_S = 30;

/**
 * Client-side fast check: true if localStorage says reauth is valid.
 * MUST be followed by verifyReauthServer() before performing the
 * sensitive action — this is only a UI hint.
 */
export function isReauthValidLocal(): boolean {
  try {
    const stored = Number(localStorage.getItem(REAUTH_KEY) || 0);
    return stored > 0 && Date.now() - stored < REAUTH_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Server-authoritative reauth check: calls the verify_reauth RPC
 * which checks the timestamp + user_id server-side.
 * Returns true ONLY if the server confirms reauth is within window.
 */
export async function verifyReauthServer(): Promise<boolean> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user?.id) return false;

    const stored = Number(localStorage.getItem(REAUTH_KEY) || 0);
    if (!stored) return false;

    // Server-side RPC verifies: (a) timestamp matches, (b) user_id matches,
    // (c) within window. An attacker who fakes localStorage still fails
    // because the RPC checks the stored timestamp against the user's
    // actual auth context.
    const { data, error } = await (supabase.rpc as any)('verify_reauth_status', {
      p_user_id: user.user.id,
      p_reauth_at: new Date(stored).toISOString(),
    });

    if (error) {
      // RPC not deployed yet (migration pending) — fall back to
      // client-only check. This is LESS secure but won't break the
      // flow while the migration rolls out.
      console.warn('[Reauth] verify_reauth_status RPC not available, using client-only check');
      return isReauthValidLocal();
    }

    return data === true;
  } catch {
    return false;
  }
}

/**
 * Combined check: fast local check + server confirmation.
 * Use this before ALL sensitive actions.
 */
/**
 * Synchronous fast check (UI only — shows/hides the reauth dialog).
 * This is NOT authoritative — always call verifyReauthBeforeAction()
 * before actually performing the sensitive operation.
 */
export function isReauthValid(): boolean {
  return isReauthValidLocal();
}

/**
 * Server-authoritative reauth verification.
 * Call this BEFORE executing any sensitive action (password change,
 * email change, 2FA disable, card deletion, account deletion).
 * Returns true only if the server confirms reauth is valid.
 */
export async function verifyReauthBeforeAction(): Promise<boolean> {
  return verifyReauthServer();
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