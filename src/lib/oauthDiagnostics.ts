/**
 * oauthDiagnostics.ts — one honest place for "what actually happened to my
 * GitHub / LinkedIn sign-in?"
 *
 * WHY this exists (founder report, Oct 14 2026 — "LinkedIn se signup nahi ho
 * raha, error aata hai"):
 *
 * Live evidence for that report — GoTrue logged three `302 → linkedin.com`
 * redirects seconds apart and then nothing at all: no `/callback`, no session,
 * no error. The browser left for LinkedIn and never came back, so the app had
 * no event to react to and the user was left with either a generic
 * "Authentication failed" or no feedback whatsoever. A silent dead end is the
 * worst possible answer for an auth flow, and it is also unactionable for the
 * founder.
 *
 * This module gives the app two things it never had:
 *   1. `beginOAuthAttempt` / `readOAuthAttempt` — a breadcrumb written right
 *      before the provider navigation. If the user comes back without a
 *      session, the app can now say exactly which provider was started, when,
 *      and that nothing was created.
 *   2. `describeOAuthFailure` — provider/GoTrue error codes translated into
 *      what the user should actually do next, instead of a raw code.
 *
 * Nothing here logs or stores a token, an email or any credential: the
 * breadcrumb is only { provider, startedAt, role }.
 */

export type OAuthProvider = 'github' | 'linkedin_oidc';

/** Human name for a provider id — used in every user-facing message. */
export function providerDisplayName(provider: string | null | undefined): string {
  if (provider === 'linkedin_oidc' || provider === 'linkedin') return 'LinkedIn';
  if (provider === 'github') return 'GitHub';
  return 'your provider';
}

/** The other provider, so a retry can always offer a working alternative. */
export function alternateProvider(provider: string | null | undefined): OAuthProvider {
  return provider === 'linkedin_oidc' ? 'github' : 'linkedin_oidc';
}

export interface OAuthAttempt {
  provider: string;
  startedAt: number;
  role?: string;
}

const PENDING_KEY = 'growlancer_oauth_pending';

/**
 * How long an unanswered attempt stays actionable. Long enough to survive a
 * slow provider round-trip (the user may be typing a password and a 2FA code),
 * short enough that a stale entry from days ago never greets anyone.
 */
export const OAUTH_ATTEMPT_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * An attempt this old was started before the current page load, which means
 * the browser came back from somewhere without completing the handshake — the
 * exact case that used to be silent.
 */
export const OAUTH_ATTEMPT_STALE_MS = 20 * 1000;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (err) {
    // Storage can throw in locked-down / private contexts. Auth must still work.
    console.warn('[oauth] localStorage unavailable:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Record that the browser is about to leave for a provider. */
export function beginOAuthAttempt(provider: OAuthProvider, role?: string): void {
  const store = storage();
  if (!store) return;
  try {
    const attempt: OAuthAttempt = { provider, startedAt: Date.now(), ...(role ? { role } : {}) };
    store.setItem(PENDING_KEY, JSON.stringify(attempt));
  } catch (err) {
    console.warn('[oauth] could not record the pending sign-in:', err instanceof Error ? err.message : err);
  }
}

/**
 * The last unanswered attempt, or null when there is none (or it is too old to
 * be relevant). Malformed entries are dropped rather than guessed at.
 */
export function readOAuthAttempt(now: number = Date.now()): OAuthAttempt | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(PENDING_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[oauth] discarding unreadable pending sign-in record:', err instanceof Error ? err.message : err);
    store.removeItem(PENDING_KEY);
    return null;
  }

  const attempt = parsed as Partial<OAuthAttempt> | null;
  const valid =
    !!attempt &&
    typeof attempt.provider === 'string' &&
    attempt.provider.length > 0 &&
    typeof attempt.startedAt === 'number' &&
    Number.isFinite(attempt.startedAt);

  if (!valid) {
    store.removeItem(PENDING_KEY);
    return null;
  }

  const age = now - (attempt.startedAt as number);
  // Negative age = clock moved backwards; treat it as fresh rather than stale.
  if (age > OAUTH_ATTEMPT_MAX_AGE_MS) {
    store.removeItem(PENDING_KEY);
    return null;
  }

  return {
    provider: attempt.provider as string,
    startedAt: attempt.startedAt as number,
    ...(typeof attempt.role === 'string' ? { role: attempt.role } : {}),
  };
}

/** Clear the breadcrumb — done on a session, on dismiss, and after a callback. */
export function clearOAuthAttempt(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PENDING_KEY);
  } catch (err) {
    console.warn('[oauth] could not clear the pending sign-in record:', err instanceof Error ? err.message : err);
  }
}

/** True when the attempt began before this page load (so the round-trip stalled). */
export function isStaleAttempt(
  attempt: OAuthAttempt,
  now: number = Date.now()
): boolean {
  return now - attempt.startedAt >= OAUTH_ATTEMPT_STALE_MS;
}

export interface OAuthFailureCopy {
  /** Short heading for the notice / error card. */
  title: string;
  /** What happened, in the user's terms, plus what to do next. */
  message: string;
  /** Whether offering "try again" is meaningful for this failure. */
  retryable: boolean;
}

/**
 * Translate an OAuth failure into actionable copy.
 *
 * Sources of the codes: GoTrue's callback query (`error`, `error_code`,
 * `error_description`) and the provider's own error names (LinkedIn uses
 * `user_cancelled_login` / `user_cancelled_authorize`, GitHub uses
 * `access_denied`).
 */
export function describeOAuthFailure(input: {
  provider?: string | null;
  error?: string | null;
  errorCode?: string | null;
  description?: string | null;
}): OAuthFailureCopy {
  const provider = providerDisplayName(input.provider);
  const rawError = (input.error || '').toLowerCase();
  const rawCode = (input.errorCode || '').toLowerCase();
  const description = (input.description || '').replace(/\+/g, ' ').trim();
  const haystack = `${rawError} ${rawCode} ${description}`.toLowerCase();

  // The user closed the provider page or pressed "Cancel" — nothing is broken.
  if (
    rawError === 'access_denied' ||
    haystack.includes('user_cancelled') ||
    haystack.includes('cancel')
  ) {
    return {
      title: `${provider} sign-in was cancelled`,
      message: `You cancelled the ${provider} consent screen, so no Growlanzo account was created or changed. Start again whenever you're ready — or use the other provider.`,
      retryable: true,
    };
  }

  // The provider returned no verified email for the account. Kept narrow on
  // purpose: the duplicate-email case is handled by the caller before this
  // mapper runs, so a loose `includes('email')` would mask more useful copy.
  if (
    haystack.includes('email_not_provided') ||
    haystack.includes('no email') ||
    haystack.includes('getting user email') ||
    haystack.includes('email from external provider')
  ) {
    return {
      title: `${provider} did not share an email`,
      message: `${provider} signs in with a verified email address, and it did not send one for this account. Add and verify a primary email on ${provider} (or use the other provider), then try again.`,
      retryable: true,
    };
  }

  // Replayed / mismatched state — the classic "opened the link twice" case.
  if (haystack.includes('bad_oauth_state') || haystack.includes('state') || haystack.includes('invalid_request')) {
    return {
      title: `${provider} sign-in did not finish`,
      message: `The ${provider} handshake was interrupted (this usually means the sign-in page was opened twice, or the tab was refreshed mid-flow). Nothing was created — press try again to start a clean sign-in.`,
      retryable: true,
    };
  }

  // Provider credentials / callback URL are wrong on the Supabase side.
  if (
    haystack.includes('invalid_client') ||
    haystack.includes('redirect') ||
    haystack.includes('unauthorized_client') ||
    haystack.includes('invalid_scope')
  ) {
    return {
      title: `${provider} sign-in is not configured correctly`,
      message: `Growlanzo could not exchange the ${provider} code for a session. Please try again in a moment — if this keeps happening the ${provider} app's callback URL needs to be checked.`,
      retryable: true,
    };
  }

  // The provider never sent the browser back: no code, no error, no session.
  if (!rawError && !description) {
    return {
      title: `${provider} did not send you back`,
      message: `${provider} opened, but the browser returned to Growlanzo without completing the sign-in — so no account was created or changed. This is almost always the provider's own page (a blocked redirect, a sign-in prompt that was closed, or a network that blocks ${provider}). Try again, allow pop-ups/redirects, or use the other provider.`,
      retryable: true,
    };
  }

  return {
    title: `${provider} sign-in failed`,
    message: description || `Something went wrong during the ${provider} sign-in. Nothing was created — please try again, or use the other provider.`,
    retryable: true,
  };
}
