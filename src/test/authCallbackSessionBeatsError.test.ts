import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locks the rule: a session that genuinely exists OUTRANKS an `error` param.
 *
 * Why this needs a guard (live incident, 2026-10-10 16:26 UTC):
 *   GoTrue's /callback was hit twice for one LinkedIn sign-up. The first request
 *   ran past this client's 15 s abort (REQUEST_TIMEOUT_MS) and the user
 *   refreshed; the replay answered
 *     ?error=invalid_request&error_code=bad_oauth_state
 *   The sign-up had ALREADY succeeded — auth.users row, user_signedup and Login
 *   all fired — but AuthCallbackPage rendered "Authentication failed" because it
 *   read the error param before it ever looked at the session. Navigating away
 *   then killed the in-flight profile creation, leaving an authenticated account
 *   with no profile row (a "ghost": it can never finish onboarding, so from the
 *   user's side signup AND login are broken).
 *
 * The assertions read the real sources so the guard cannot silently regress: the
 * `error` param describes ONE request, the session is the actual auth state.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..');

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
}

/** Comments must not satisfy a check comment, nor trip a negative one. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const CALLBACK_PATH = 'src/pages/AuthCallbackPage.tsx';
const CALLBACK = readSource(CALLBACK_PATH);
const CALLBACK_CODE = stripComments(CALLBACK);

/**
 * The defect this test exists for: an `error` param that immediately renders the
 * failure screen without first asking whether a session exists.
 *
 * The `(?<!else\s)` guard matters — `} else if (error) {` is the CORRECT shape,
 * so a bare-looking `if (error) {` must be matched only where it is not the
 * else-branch of the session check.
 */
const UNGUARDED_ERROR_BRANCH = /(?<!else\s)if\s*\(\s*error\s*\)\s*\{\s*setStatus\(\s*'error'\s*\)/;

/**
 * Only the OAuth-error branch, so an unrelated `if (error)` elsewhere cannot trip
 * it. End marker is the next piece of CODE (the magiclink block) — a `// ── 3.`
 * comment marker would already be gone, because comments are stripped above.
 */
const errorBlockStart = CALLBACK_CODE.indexOf("const error = searchParams.get('error')");
const errorBlockEnd = CALLBACK_CODE.indexOf("detectedAction === 'magiclink'", errorBlockStart);
const ERROR_BLOCK =
  errorBlockStart >= 0 && errorBlockEnd > errorBlockStart
    ? CALLBACK_CODE.slice(errorBlockStart, errorBlockEnd)
    : '';

describe('AuthCallbackPage: a real session outranks a benign error param', () => {
  it('checks for an established session before rendering the error screen', () => {
    expect(ERROR_BLOCK, 'the OAuth-error branch must still exist').not.toBe('');
    // The guarded form must be present: `if (error && await recover…())`.
    expect(ERROR_BLOCK).toMatch(/if\s*\(\s*error\s*&&\s*await\s+recoverEstablishedSession\(\)\s*\)/);
    expect(ERROR_BLOCK).toContain('} else if (error) {');
    // …and no bare (unguarded) error branch may be left in that block.
    expect(ERROR_BLOCK).not.toMatch(UNGUARDED_ERROR_BRANCH);
  });

  it('the session check reads real storage and the implicit-flow hash tokens', () => {
    expect(CALLBACK_CODE).toContain('recoverEstablishedSession');
    expect(CALLBACK_CODE).toMatch(/supabase\.auth\s*\.\s*getSession\(\)/);
    expect(CALLBACK_CODE).toContain("hashParams.get('access_token')");
    expect(CALLBACK_CODE).toMatch(/setSession\(\s*\{\s*access_token:\s*accessToken,\s*refresh_token:\s*refreshToken\s*\}\s*\)/);
  });

  it('the check runs before the error branch, and the error branch still exists', () => {
    const guard = CALLBACK_CODE.indexOf('recoverEstablishedSession()');
    const errorScreen = CALLBACK_CODE.indexOf("setStatus('error')");
    expect(guard).toBeGreaterThan(-1);
    expect(errorScreen).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(errorScreen);

    // A genuinely failed sign-in must still be reported, with its escape hatch.
    expect(CALLBACK_CODE).toContain('Authentication failed');
    expect(CALLBACK_CODE).toContain("navigate('/?modal=login'");
  });

  it('a benign error is logged rather than silently swallowed', () => {
    expect(CALLBACK_CODE).toContain('ignoring auth error param');
    expect(CALLBACK_CODE).toContain("searchParams.get('error_code')");
  });

  it('negative control — planting the old defect turns the guard RED', () => {
    // Recreate the exact pre-fix shape: the guarded check and its else-branch
    // collapse back into a single unguarded `if (error) { setStatus('error') }`.
    const replanted = ERROR_BLOCK.replace(
      /if\s*\(\s*error\s*&&\s*await\s+recoverEstablishedSession\(\)\s*\)\s*\{[\s\S]*?\}\s*else if\s*\(\s*error\s*\)\s*\{/,
      'if (error) {',
    );
    expect(replanted).not.toBe(ERROR_BLOCK); // the mutation really applied
    expect(replanted).not.toMatch(/recoverEstablishedSession/);
    // …and the predicate that guards the real file must now fire.
    expect(replanted).toMatch(UNGUARDED_ERROR_BRANCH);
  });
});
