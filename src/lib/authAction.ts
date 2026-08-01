/**
 * ═══════════════════════════════════════════════════════════════════
 * Shared post-auth routing helpers.
 *
 * Every authentication entry point (AuthCallbackPage, EmailConfirmPage,
 * VerifyEmailPage, and the AuthContext homepage-fallback bounce) converges
 * on the SAME destination rules so the flow is consistent:
 *
 *   verified + no profile        → role selection  (/onboarding?mode=oauth)
 *   verified + onboarding pending → role-specific onboarding
 *   verified + onboarding done    → role-specific dashboard
 * ═══════════════════════════════════════════════════════════════════
 */
import type { AuthUser } from '../types/auth';

export interface PostAuthProfile {
  role?: string | null;
  onboardingCompleted?: boolean;
}

/**
 * Resolve the correct destination for an authenticated (and verified) user.
 *
 * @param profile    The user's profile row (null = brand new user, no role yet).
 * @param oauthMode  When true (OAuth signup via GitHub/LinkedIn), users with
 *                   incomplete onboarding are sent to the role-selection mini
 *                   form (/onboarding?mode=oauth) instead of the role-specific
 *                   full onboarding. OAuth providers auto-confirm the email, so
 *                   these users never see the email-verification flow and need
 *                   an explicit role choice first. GitHub and LinkedIn behave
 *                   identically here.
 */
export function getPostAuthPath(
  profile: PostAuthProfile | null,
  oauthMode: boolean = false
): string {
  if (!profile) {
    // No profile / no role selected → role selection screen
    return '/onboarding?mode=oauth';
  }
  if (profile.onboardingCompleted === false) {
    // OAuth users pick their role on the mini form (consistency for GitHub/LinkedIn);
    // email users go to their role-specific full onboarding (role already chosen at signup).
    if (oauthMode) return '/onboarding?mode=oauth';
    return profile.role === 'client' ? '/onboarding/client' : '/onboarding/freelancer';
  }
  switch (profile.role) {
    case 'client':
      return '/client';
    case 'admin':
      return '/admin';
    default:
      return '/dashboard';
  }
}

/**
 * Full-page redirect (window.location.replace — NOT SPA navigate).
 * A full reload lets AuthContext initialize cleanly from the persisted
 * session, avoiding the ProtectedRoute bounce-back race where navigate()
 * sees user=null and sends the user back to /?modal=login.
 * replace() (not href=) prevents the browser Back button from returning
 * to the auth page and re-running token processing.
 */
export function redirectAfterAuth(
  profile: PostAuthProfile | null,
  oauthMode: boolean = false
): void {
  window.location.replace(getPostAuthPath(profile, oauthMode));
}

/**
 * True if the given URL carries Supabase auth action params:
 * - search: PKCE `code`, OTP `token_hash`, or OAuth `error`/`error_description`
 * - hash (implicit flow): `access_token` / `refresh_token` / `error` (the
 *   confirmation email link redirects to #access_token=... — no code verifier
 *   needed, works across devices/browsers)
 */
export function urlHasAuthActionParams(
  search: string = window.location.search,
  hash: string = window.location.hash
): boolean {
  const params = new URLSearchParams(search);
  if (
    params.has('code') ||
    params.has('token_hash') ||
    params.has('error') ||
    params.has('error_description')
  ) {
    return true;
  }
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
  return (
    hashParams.has('access_token') ||
    hashParams.has('refresh_token') ||
    hashParams.has('error') ||
    hashParams.has('error_description')
  );
}

/** Pages that may legitimately carry auth params — never bounce away from them. */
const AUTH_ACTION_PATHS = [
  '/auth/callback',
  '/auth/email-confirm',
  '/auth/verify-email',
  '/auth/reset-password',
];

/**
 * 🛡️ Homepage-fallback rescue.
 *
 * If Supabase's email/OAuth redirect target (`/auth/callback`) is NOT in the
 * project's allowed Redirect URLs, Supabase falls back to the Site URL (the
 * homepage) and appends the PKCE `code` (or `token_hash`) there. The user
 * then appears "stuck on the homepage" with a session that never continues.
 *
 * This check detects that situation and bounces to /auth/callback preserving
 * the params so AuthCallbackPage can exchange the token and route correctly.
 */
export function shouldRedirectToAuthCallback(
  pathname: string = window.location.pathname,
  search: string = window.location.search,
  hash: string = window.location.hash
): boolean {
  if (AUTH_ACTION_PATHS.some((p) => pathname.startsWith(p))) return false;
  return urlHasAuthActionParams(search, hash);
}

/** Minimal shape needed from a profile row for destination logic. */
export type { AuthUser };
