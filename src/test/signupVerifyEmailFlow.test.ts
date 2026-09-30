import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locks the signup → "verify your email" flow, which silently disappeared for
 * every real email/password signup.
 *
 * Reproduced against the deployed site (2026-09-30), signed up with a fresh
 * address and captured the network + navigation:
 *
 *   POST 200 auth/v1/signup           → user created, email unconfirmed, no session
 *   POST 200 rpc/create_user_profile  → profile row created
 *   GET  401 rest/v1/profiles         → 42501 permission denied for table profiles
 *   POST 400 rpc/create_user_profile  → P0001 Unauthorized          (retry)
 *   navigations: /dashboard → /?modal=login → /
 *
 * Two independent defects compounded:
 *
 *   1. `createUserProfile()` treated a successful creation as a failure. The
 *      SECURITY DEFINER RPC returns 2xx (the row EXISTS), but the function then
 *      returned `fetchUserProfile()` — a SELECT that RLS must refuse when there
 *      is no session (unconfirmed signup). That null was the function's result,
 *      so `profileDeferred` became true for a signup that had actually worked.
 *
 *   2. `AuthContext.signUp` computed `needsVerification` as
 *      `!loginData?.user && !profileDeferred`. Verification is a property of the
 *      EMAIL, not of profile setup, so defect 1 silently cancelled the verify
 *      screen: SignupModal took its else-branch, navigated to /dashboard with no
 *      session, and ProtectedRoute bounced the user into the LOGIN MODAL.
 *
 * The user-visible symptom was "the verify-email page is gone" even though the
 * confirmation email was being sent normally the whole time. These assertions
 * read the source directly so the fix cannot drift away from its test.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..');

/** Reads a source file with newlines normalised (the repo mixes LF and CRLF). */
function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Removes TS comments. Negative assertions must run against code only — the
 * explanatory comment that documents a removed bug otherwise re-triggers the
 * very assertion that forbids it (a trap this repo has hit before).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const AUTH_SERVICE = readSource('src/lib/services/authService.ts');
const AUTH_SERVICE_CODE = stripComments(AUTH_SERVICE);
const AUTH_CONTEXT = readSource('src/context/AuthContext.tsx');
const SIGNUP_MODAL = readSource('src/components/SignupModal.tsx');
const APP = readSource('src/app/App.tsx');

/** The tail of `createUserProfile()` after its creating RPC reported success. */
function successPath(): string {
  const marker = "'[Auth] create_user_profile RPC success:'";
  const start = AUTH_SERVICE.indexOf(marker);
  expect(start, 'createUserProfile lost its RPC-success log — this test no longer finds the success path').toBeGreaterThan(-1);
  const end = AUTH_SERVICE.indexOf('\n}\n', start);
  expect(end, 'could not delimit the end of createUserProfile()').toBeGreaterThan(start);
  return AUTH_SERVICE.slice(start, end);
}

describe('signup reaches the verify-email screen', () => {
  it('does not report a successful profile creation as a failure', () => {
    const tail = successPath();

    // The row exists: the RPC returned 2xx and its own guard only allows
    // creation for a just-signed-up auth row.
    expect(tail).toContain('const profile = await fetchUserProfile(userId);');
    expect(tail).toContain('if (profile) return profile;');

    // The read-back is OPTIONAL. The old success path ended with a bare
    // `return fetchUserProfile(userId);`, which is null whenever RLS hides
    // `profiles` from a session-less (unconfirmed) signup.
    expect(tail.match(/return fetchUserProfile\(userId\);/g)?.length ?? 0).toBe(0);

    // ...and the session-less case must still return the row we just created.
    expect(tail).toContain('sessionData?.session');
    expect(tail).toMatch(/return \{\s*\n\s*id: userId,/);
    expect(tail).toContain('role: safeRole,');
  });

  it('only fills in the created profile when there is no session (no session is handed a profile it lacks)', () => {
    const tail = successPath();
    // A signed-in caller whose read-back failed (suspended/transient) keeps the
    // old `null`, so this convenience cannot widen what a live session can read.
    expect(tail).toMatch(/if \(sessionData\?\.session\) return null;/);
  });

  it('keeps needsVerification tied to the email, never to profile setup', () => {
    // Defect 2: the coupling that turned a profile hiccup into "no verify page".
    expect(AUTH_CONTEXT).toContain('needsVerification: !loginData?.user,');
    expect(stripComments(AUTH_CONTEXT)).not.toContain('needsVerification: !loginData?.user && !profileDeferred');
  });

  it('still routes an unverified signup to the verify page, and that page is still routed', () => {
    expect(SIGNUP_MODAL).toContain('if (result.needsVerification)');
    expect(SIGNUP_MODAL).toContain('navigate(`/auth/verify-email?email=');
    // The destination must stay reachable — a culled route would silently
    // restore the original symptom no matter what the signup code does.
    expect(APP).toContain('<Route path="auth/verify-email"');
  });

  it('never treats an RLS-blocked read as proof the row is missing', () => {
    // `profiles` is not publicly readable (by design), so a failed SELECT is
    // expected for a session-less signup and must not be read as "no row".
    expect(AUTH_SERVICE_CODE).toContain("from('profiles')");
    expect(successPath()).not.toMatch(/if \(!profile\).*console\.error/);
  });
});
