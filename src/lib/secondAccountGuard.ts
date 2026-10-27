// ────────────────────────────────────────────────────────────────────────────
// Second-account guard
//
// The case this exists for (reported from live use): someone signs up with
// LinkedIn, later taps "Continue with GitHub" on the login screen, and GitHub
// identifies them with a *different* email address (a work address, a personal
// one, a GitHub noreply address — anything that is not the LinkedIn email).
//
// GoTrue sees no conflict, so it happily creates a SECOND Growlanzo account.
// The person now has two profiles, two dashboards, two wallets, and no idea
// which one their contracts are on. They asked for a sign-in and got a new
// identity.
//
// The provider-mismatch screen cannot catch this: it only fires when GoTrue
// rejects a duplicate email, which by definition does not happen here. The only
// signal available is the one this browser already recorded the last time an
// account was signed in on it (see browserIdentity.ts) — which is exactly the
// evidence needed to say "this is not your account; here is what to do".
//
// It is deliberately a *question*, not a wall: the visitor may genuinely want a
// second account (a client account separate from their freelancer one), so
// there is an explicit "create a new account" path. What must never happen is
// the silent version.
//
// Scope limits, on purpose:
//   • Only the same browser profile is considered — the fingerprint must match.
//     A shared office machine must not accuse the next person of anything.
//   • A missing/unreadable incoming email is not handled here; AuthCallbackPage
//     has a stricter, earlier check for that (GitHub's noreply address).
//   • Matching emails never trip this — same account, signing back in.
// ────────────────────────────────────────────────────────────────────────────

import { getBrowserAccount, getBrowserFingerprint } from './browserIdentity';

export interface SecondAccountCandidate {
  /** The email already recorded for this browser (shown to the visitor). */
  existingEmail: string;
  /** The email the provider just authenticated (different from the above). */
  incomingEmail: string;
  /** Provider the existing account signs in with, when the record carries it. */
  existingProvider?: 'github' | 'linkedin_oidc';
}

/** Lowercase + trim so casing differences never read as different people. */
function normaliseEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/**
 * Returns the earlier account recorded on THIS browser when the identity that
 * just came back from a provider is a different one. Returns null for: no
 * record, a record from another browser, an unreadable email, or the same
 * account signing in again.
 */
export function detectSecondAccount(
  incomingEmail: string | null | undefined
): SecondAccountCandidate | null {
  const incoming = normaliseEmail(incomingEmail);
  if (!incoming) return null;

  const record = getBrowserAccount();
  if (!record) return null;

  // A record written by a different browser profile says nothing about who is
  // sitting at this one.
  try {
    if (record.fingerprint !== getBrowserFingerprint()) return null;
  } catch {
    return null;
  }

  const existing = normaliseEmail(record.email);
  if (!existing || existing === incoming) return null;

  return {
    existingEmail: record.email,
    incomingEmail: (incomingEmail ?? '').trim(),
    existingProvider:
      record.provider === 'github' || record.provider === 'linkedin_oidc'
        ? record.provider
        : undefined,
  };
}

/**
 * True when the visitor explicitly chose "create a new account" for an
 * additional identity. Read once by the callback so a refresh mid-flow cannot
 * be mistaken for a second silent approval.
 *
 * Expires: an approval is consent for the round-trip that is about to happen,
 * not a permanent exemption from the guard. Ten minutes covers even a slow
 * provider login without leaving a standing licence to create extra accounts.
 */
export const SECOND_ACCOUNT_APPROVED_KEY = 'growlancer_second_account_approved';
const APPROVAL_TTL_MS = 10 * 60 * 1000;

export function approveSecondAccount(): void {
  try {
    window.localStorage.setItem(SECOND_ACCOUNT_APPROVED_KEY, String(Date.now()));
  } catch {
    // Storage blocked — the flow still works, the visitor is simply asked again
    // if they repeat it.
  }
}

/** Consumes the approval (one-shot, TTL-bounded) and says whether it existed. */
export function consumeSecondAccountApproval(): boolean {
  try {
    const raw = window.localStorage.getItem(SECOND_ACCOUNT_APPROVED_KEY);
    if (!raw) return false;
    window.localStorage.removeItem(SECOND_ACCOUNT_APPROVED_KEY);
    const approvedAt = Number.parseInt(raw, 10);
    if (!Number.isFinite(approvedAt)) return false;
    return Date.now() - approvedAt <= APPROVAL_TTL_MS;
  } catch {
    return false;
  }
}
