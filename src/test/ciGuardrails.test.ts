import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression tests for the guardrails INSIDE the workflows.
 *
 * The failure these exist to prevent is a status-reporting one, not a code one:
 * the authenticated element audit and the privilege pentest were both gated on
 * secrets that were simply absent, so they *skipped* — and the job reported
 * SUCCESS. A green check on top of a guardrail that never ran is worse than a
 * red one, because it is trusted.
 *
 * So these tests read the workflow files and assert:
 *   - a missing secret fails the run (no skip path that exits 0 for these two),
 *   - the only tolerated skip is the one GitHub makes unavoidable (fork PRs),
 *     and it is announced loudly rather than passing quietly,
 *   - every credential the guarded steps consume is actually asserted,
 *   - the deploy's guard runs BEFORE anything is deployed,
 *   - the authenticated audit cannot run partially/logged-out and still pass.
 *
 * If you change a workflow and these fail, do not delete the assertion: either
 * make the workflow fail closed again, or replace the guard with a stronger one.
 */

const workflowsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.github/workflows'
);

const readWorkflow = (file: string) =>
  fs.readFileSync(path.join(workflowsDir, file), 'utf8').replace(/\r\n/g, '\n');

const CI = readWorkflow('ci.yml');
const DEPLOY = readWorkflow('backend-deploy.yml');
const readScript = (file: string) =>
  fs
    .readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../../scripts/e2e/${file}`), 'utf8')
    .replace(/\r\n/g, '\n');

const LOGIN = readScript('login.mjs');
const CREATE_ACCOUNTS = readScript('create-test-accounts.mjs');

/**
 * Drop line comments (YAML `#` and shell `#` alike) before asserting that a
 * construct is ABSENT. Otherwise documentation *about* the thing it forbids —
 * the comment explaining why the old `can_seed_e2e` gate was removed — would be
 * what fails the test. What must not exist is a live gate, not prose about one.
 */
const stripComments = (source: string) =>
  source
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

/** The text of one step: from its `- name:` line up to the next step. */
function stepBlock(source: string, name: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => l.includes(`- name: ${name}`));
  if (start === -1) throw new Error(`workflow step not found: "${name}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\s{6}- /.test(l));
  const block = end === -1 ? rest : rest.slice(0, end);
  return [lines[start], ...block].join('\n');
}

/** Keys of a job's top-level `env:` block (a job's step env is nested deeper). */
function jobEnvKeys(source: string, jobName: string): string[] {
  const lines = source.split('\n');
  const jobStart = lines.findIndex((l) => l === `  ${jobName}:`);
  if (jobStart === -1) throw new Error(`job not found: "${jobName}"`);
  const envStart = lines.findIndex((l, i) => i > jobStart && l === '    env:');
  if (envStart === -1) throw new Error(`job "${jobName}" has no top-level env block`);
  const keys: string[] = [];
  for (const line of lines.slice(envStart + 1)) {
    const m = /^ {6}([A-Z][A-Z0-9_]*):/.exec(line);
    if (!m) break;
    keys.push(m[1]);
  }
  return keys;
}

describe('ci.yml — the authenticated audit cannot silently not-run', () => {
  const guard = stepBlock(CI, 'Guard — authenticated-audit secrets present (fail-closed)');

  it('fails the job (not skips it) when a required secret is missing', () => {
    expect(guard).toContain('::error::');
    expect(guard).toMatch(/exit 1/);
    // The old silent gate is gone for good (executable lines only — the comment
    // explaining its removal is allowed to name it).
    expect(stripComments(CI)).not.toContain('can_seed_e2e');
  });

  it('asserts every credential its job env consumes', () => {
    const required = /REQUIRED="([^"]+)"/.exec(guard)?.[1]?.split(/\s+/) ?? [];
    expect(required.length).toBeGreaterThan(0);
    const consumed = jobEnvKeys(CI, 'element-audit');
    expect(consumed).toContain('SUPABASE_SERVICE_ROLE_KEY');
    // A new credential added to the job env without adding it here would let the
    // pass run half-configured, so hold the two lists together.
    for (const key of consumed) {
      expect(required, `job env ${key} is not asserted by the guard`).toContain(key);
    }
  });

  it('tolerates a skip only for a fork PR, and says so out loud', () => {
    const skipBranch = guard.slice(guard.indexOf('exit 0') - 600, guard.indexOf('exit 0'));
    expect(skipBranch).toContain('pull_request');
    expect(skipBranch).toContain('fork');
    // Announced, never silent — and it still reports that the pass did not run.
    expect(skipBranch).toContain('::warning::');
    expect(guard).toContain('run_authenticated=false');
    // The skip is the ONLY exit 0 in the guard: every other path must fail.
    expect(guard.match(/exit 0/g)?.length).toBe(1);
  });

  it('publishes exactly one gate the downstream steps depend on', () => {
    expect(guard).toContain('run_authenticated=true');
    for (const step of [
      'Seed E2E test accounts (live only for this run)',
      'Authenticated audit + logout security (freelancer/client/admin)',
      'Remove E2E test accounts from production',
    ]) {
      const block = stepBlock(CI, step);
      const condition = /^\s+if: (.*)$/m.exec(block)?.[1] ?? '';
      expect(condition, `"${step}" is not gated on the guard`).toContain(
        'steps.e2e_guard.outputs.run_authenticated'
      );
    }
  });

  it('cannot run the authenticated audits partially or logged-out', () => {
    const audit = stepBlock(CI, 'Authenticated audit + logout security (freelancer/client/admin)');
    // Strict login: every role must end up with a storage state.
    expect(audit).toContain('--require-all');
    // No `if [ -f .e2e/<role>.json ]` wrapping: that pattern dropped a role that
    // failed to log in and still left the job green.
    expect(audit).not.toMatch(/if \[ -f \.e2e\//);
    // All three role audits and all three logout flows are unconditional.
    for (const group of ['dashboard', 'client', 'admin']) {
      expect(audit).toContain(`--group=${group}`);
    }
    expect(audit.match(/logout-flow\.mjs/g)?.length).toBe(1); // inside the for-loop
    expect(audit).toContain('for role in freelancer client admin');
  });

  it('never marks a guard step as allowed to fail', () => {
    expect(stripComments(CI)).not.toContain('continue-on-error');
    expect(stripComments(DEPLOY)).not.toContain('continue-on-error');
  });

  it('implements the strict login contract it relies on', () => {
    expect(LOGIN).toContain("args['require-all']");
    // A missing credential must throw in strict mode rather than return null.
    expect(LOGIN).toMatch(/REQUIRE_ALL[\s\S]{0,400}throw new Error/);
  });
});

describe('the E2E seed cannot write to an account it does not own', () => {
  /**
   * On 2026-09-25 this script reset a REAL user's password and overwrote their
   * profile name + email. Cause: `GET /auth/v1/admin/users?email=…` — GoTrue
   * silently ignores that parameter and returns the first page of users, so
   * `users[0]` was whoever happened to come first, and the seed took its
   * "account already exists" branch against them. A lookup that cannot verify
   * what it found is not a lookup.
   */
  it('matches the email locally instead of asking the API to filter', () => {
    // The exact broken call — prose in comments is allowed to mention it.
    expect(CREATE_ACCOUNTS).not.toContain('/auth/v1/admin/users?email=');
    expect(CREATE_ACCOUNTS).not.toContain('body.users?.[0]');
    expect(CREATE_ACCOUNTS).toContain('per_page=200');
    expect(CREATE_ACCOUNTS).toMatch(/\.find\(\(u\) => \(u\.email \|\| ''\)\.trim\(\)\.toLowerCase\(\) === wanted\)/);
  });

  it('proves the id it is about to write to carries the account email', () => {
    expect(CREATE_ACCOUNTS).toMatch(/adminGetById\(id\)/);
    expect(CREATE_ACCOUNTS).toContain('WRONG_USER');
  });

  it('fails the step instead of printing OK for an unusable account', () => {
    for (const code of ['CREATE_FAILED', 'UPDATE_FAILED', 'PROFILE_FAILED', 'ADMIN_ROLE_FAILED']) {
      expect(CREATE_ACCOUNTS).toContain(code);
    }
    expect(CREATE_ACCOUNTS).toMatch(/if \(failures\.length\)[\s\S]{0,300}process\.exit\(1\)/);
    // Never push secrets derived from a half-built account set.
    expect(CREATE_ACCOUNTS.indexOf('failures.length')).toBeLessThan(
      CREATE_ACCOUNTS.indexOf("'--push-secrets'")
    );
  });

  it('reads the admin grant back instead of trusting an HTTP 200', () => {
    // grant_admin_role refuses with 200 + {success:false}; that is how the admin
    // sweep was once seeded with an account that could not see admin pages.
    expect(CREATE_ACCOUNTS).toContain('success === true');
    expect(CREATE_ACCOUNTS).toMatch(/profiles_private\?id=eq\.\$\{id\}&select=is_admin/);
    expect(CREATE_ACCOUNTS).toContain('flagged !== true');
  });

  it('requires the admin CONSOLE, not just a stored session', () => {
    // A signed-in non-admin gets AdminLoginPage at /admin; auditing that page
    // would report the logged-out surface as green.
    expect(LOGIN).toContain('input[aria-label="Admin password"]');
    expect(LOGIN).toContain("role === 'admin' ? sawRoute : sawSession || sawRoute");
  });

  it('reports the auth endpoint\'s real reason, not a getter\'s source', () => {
    // Playwright's statusText is a METHOD; stringifying the bare function made a
    // whole CI run fail with `400 status() { return this._initializer.status; }`.
    expect(LOGIN).toContain('res.statusText()');
    // The bare property (function itself) must not come back — asserted as a
    // shape, since writing it once was exactly the defect.
    expect(LOGIN).not.toMatch(/res\.statusText(?!\()/);
    // And it reads the error body, so invalid_credentials is nameable.
    expect(LOGIN).toMatch(/error_code[\s\S]{0,200}error_description/);
  });
});

describe('backend-deploy.yml — a deploy is never green with an unrun pentest', () => {
  const guard = stepBlock(DEPLOY, 'Guard — pentest secrets present (fail-closed)');
  const pentest = stepBlock(DEPLOY, 'Privilege + money-path pentest (against deployed DB)');

  it('asserts every secret the pentest consumes', () => {
    const consumed = [...pentest.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
    expect(consumed).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(consumed).toContain('VITE_SUPABASE_ANON_KEY');
    for (const name of consumed) {
      expect(guard, `pentest uses ${name} but the guard does not assert it`).toContain(name);
    }
  });

  it('has no silent skip left in the pentest step', () => {
    const executable = stripComments(pentest);
    expect(executable).not.toContain('::notice::');
    expect(executable).not.toContain('SKIPPED');
    expect(pentest).toMatch(/exit 1/);
    expect(pentest).toContain('node scripts/e2e/pentest-privileges.mjs');
  });

  it('runs the guard BEFORE anything is deployed', () => {
    const guardAt = DEPLOY.indexOf('Guard — pentest secrets present (fail-closed)');
    for (const step of [
      'Migration drift check (repo vs live DB — fail-closed)',
      'Apply pending migrations (db push — no-op when in sync)',
      'Deploy all edge functions from repo source',
    ]) {
      expect(DEPLOY.indexOf(`- name: ${step}`)).toBeGreaterThan(guardAt);
    }
    expect(guard).toMatch(/exit 1/);
  });
});
