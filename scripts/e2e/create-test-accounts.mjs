// Creates/updates the 3 permanent E2E test accounts (freelancer / client / admin)
// in the linked Supabase project and prints NOTHING sensitive.
//
// Usage:
//   node scripts/e2e/create-test-accounts.mjs            # create or repair
//   node scripts/e2e/create-test-accounts.mjs --rotate   # new random passwords + push secrets
//
// Requires (never committed):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — from the environment first (CI),
//   falling back to .env.local for local runs.
// Optional for --rotate (GitHub CLI must be authed):
//   GH_REPO (or it will use Growlancer-Official/Growlancer)
//
// Secrets land in `.env.e2e` (gitignored) and, with --rotate, as GitHub
// Actions secrets: E2E_FREELANCER_EMAIL/_PASSWORD, E2E_CLIENT_EMAIL/_PASSWORD,
// E2E_ADMIN_EMAIL/_PASSWORD.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const ENV_LOCAL = path.join(ROOT, '.env.local');
const ENV_E2E = path.join(ROOT, '.env.e2e');
const REPO = process.env.GH_REPO || 'Growlancer-Official/Growlancer';

function readEnvKey(file, key) {
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

// Environment wins so CI can run without a local .env.local file; the file is the
// local convenience fallback. Never printed either way.
const SUPABASE_URL = process.env.SUPABASE_URL || readEnvKey(ENV_LOCAL, 'SUPABASE_URL');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvKey(ENV_LOCAL, 'SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (env or .env.local) — aborting.');
  process.exit(1);
}

const H = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' };

const ACCOUNTS = [
  { role: 'freelancer', email: 'e2e.freelancer@growlancer-test.com', name: 'E2E Freelancer' },
  { role: 'client', email: 'e2e.client@growlancer-test.com', name: 'E2E Client' },
  { role: 'admin', email: 'e2e.admin@growlancer-test.com', name: 'E2E Admin' },
];

function strongPassword() {
  // 20 chars, 4 classes; crypto-random, never logged.
  const c = 'abcdefghijkmnopqrstuvwxyz', u = 'ABCDEFGHJKLMNPQRSTUVWXYZ', d = '23456789', s = '!@#$%^&*';
  const all = c + u + d + s;
  const pick = (set) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(c), pick(u), pick(d), pick(s)];
  while (chars.length < 20) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function adminCreate(email, password, name) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, role_hint: undefined } }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, id: body.id || null, error: body.msg || body.message || null };
}

/**
 * Look an auth user up by email — by listing and comparing locally, never by
 * asking the API to filter.
 *
 * GoTrue silently IGNORES an `email` query parameter: `/admin/users?email=…`
 * returns the first page of users whatever you pass (verified live — a bogus
 * address returns exactly the same rows as a real one). The old version took
 * `users[0]` from that reply, so on 2026-09-25 the seed "found" a real account
 * and pointed its password reset + profile write at that person instead of
 * creating the test account. Indexing into a list without comparing the email
 * is the whole bug: match explicitly, and treat "no exact match" as absent.
 */
async function adminGetByEmail(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: H });
  if (!res.ok) throw new Error(`list users failed: HTTP ${res.status}`);
  const body = await res.json().catch(() => ({ users: [] }));
  const users = Array.isArray(body) ? body : body.users || [];
  const wanted = email.trim().toLowerCase();
  return users.find((u) => (u.email || '').trim().toLowerCase() === wanted) || null;
}

/** Re-read one auth user — used to prove the id we write to carries our email. */
async function adminGetById(id) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { headers: H });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function adminUpdatePassword(id, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT', headers: H, body: JSON.stringify({ password, email_confirm: true }),
  });
  return res.status;
}

async function ensureProfile(id, email, name, role) {
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_user_profile`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_id: id, p_email: email, p_name: name, p_role: role, p_referral_code: '' }),
  });
  return rpc.status;
}

async function setAdminRole(id) {
  // grant_admin_role RPC (SECURITY DEFINER) — used by admin-signup edge function.
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/grant_admin_role`, {
    method: 'POST', headers: H, body: JSON.stringify({ p_user_id: id }),
  });
  // A refusal arrives as HTTP 200 with success:false ("Unauthorized: admins
  // only"), so the status alone is not evidence — that is exactly how the admin
  // sweep was once seeded with an account that could not see admin pages.
  const body = await rpc.json().catch(() => null);
  return { status: rpc.status, success: body?.success === true, error: body?.error || null };
}

/**
 * Put the account into the state the audits assume: fully onboarded, India.
 *
 * getPostAuthPath() sends anyone with onboardingCompleted === false to
 * /onboarding — correct app behaviour, but it means a freshly seeded account
 * can never "log in and reach the dashboard", which is exactly what
 * logout-flow's first step asserts (it failed in CI on 2026-09-26). The country
 * gate diverts non-India profiles the same way. complete_onboarding() and
 * update_user_country() are caller-scoped (auth.uid()), so a service-role seed
 * writes the two fields directly — the same values onboarding itself writes —
 * and reads both back.
 */
async function setOnboardedState(id, country) {
  const patch = async (table, body) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH', headers: H, body: JSON.stringify(body),
    });
    return res.ok;
  };
  const okPriv = await patch('profiles_private', { onboarding_completed: true, updated_at: new Date().toISOString() });
  const okProf = await patch('profiles', { country, updated_at: new Date().toISOString() });
  if (!okPriv || !okProf) return null;

  const read = async (table, select) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&select=${select}`, { headers: H });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => null);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  };
  const priv = await read('profiles_private', 'onboarding_completed');
  const prof = await read('profiles', 'country');
  if (!priv || !prof) return null;
  return { onboardingCompleted: priv.onboarding_completed === true, country: prof.country };
}

/** Read the admin flag back — the state the admin audit actually depends on. */
async function adminFlagOf(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles_private?id=eq.${id}&select=is_admin`, { headers: H });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) && rows.length ? rows[0].is_admin === true : false;
}

const rotate = process.argv.includes('--rotate');
const results = [];
const secretLines = [];
// Anything that leaves an account missing or half-built is a failure: a seeded
// account the audit cannot use must fail the step, not print a line and exit 0.
const failures = [];
// CI passes the passwords it will log in with (repo secrets); using them keeps the
// recreated accounts login-able. Without this, CI would generate a random password
// nothing else knows and the authenticated pass would fail.
let usedExternalPassword = false;

for (const acct of ACCOUNTS) {
  const existing = await adminGetByEmail(acct.email);
  const envVarPassword = process.env[`E2E_${acct.role.toUpperCase()}_PASSWORD`];
  const existingEnvPassword = envVarPassword || readEnvKey(ENV_E2E, `E2E_${acct.role.toUpperCase()}_PASSWORD`);
  if (envVarPassword) usedExternalPassword = true;
  const password = rotate || !existingEnvPassword ? strongPassword() : existingEnvPassword;

  let id = existing?.id || null;
  if (!id) {
    const created = await adminCreate(acct.email, password, acct.name);
    if (created.status !== 200 || !created.id) {
      console.error(`✗ ${acct.role}: admin create failed (${created.status}) ${created.error || ''}`);
      failures.push(`${acct.role}: CREATE_FAILED`);
      continue;
    }
    id = created.id;
  } else {
    const st = await adminUpdatePassword(id, password);
    if (st !== 200) {
      console.error(`✗ ${acct.role}: password update failed (${st})`);
      failures.push(`${acct.role}: UPDATE_FAILED`);
      continue;
    }
  }

  // Prove the id we are about to write to is really this account. The lookup can
  // only return an exact email match now, but the authenticated audit logs in as
  // these addresses — "the API probably did what we asked" is not good enough.
  const confirmed = await adminGetById(id);
  if (!confirmed || (confirmed.email || '').trim().toLowerCase() !== acct.email.toLowerCase()) {
    console.error(`✗ ${acct.role}: the resolved user id does not carry this account's email — refusing to write to it`);
    failures.push(`${acct.role}: WRONG_USER`);
    continue;
  }

  const profileSt = await ensureProfile(id, acct.email, acct.name, acct.role);
  if (profileSt !== 200) {
    console.error(`✗ ${acct.role}: profile ensure failed (${profileSt})`);
    failures.push(`${acct.role}: PROFILE_FAILED`);
    continue;
  }

  const state = await setOnboardedState(id, 'India');
  if (!state || state.onboardingCompleted !== true || state.country !== 'India') {
    console.error(`✗ ${acct.role}: not in the audited state (onboardingCompleted=${state ? state.onboardingCompleted : 'unreadable'}, country=${state ? state.country : 'unreadable'})`);
    failures.push(`${acct.role}: STATE_FAILED`);
    continue;
  }
  let adminSt = null;
  if (acct.role === 'admin') {
    const granted = await setAdminRole(id);
    const flagged = await adminFlagOf(id);
    if (granted.status !== 200 || !granted.success || flagged !== true) {
      // The admin sweep renders admin routes only for a real admin; without the
      // flag it would audit the admin login screen and report that as green.
      console.error(`✗ ${acct.role}: admin flag not set (http=${granted.status}, success=${granted.success}, is_admin=${flagged})${granted.error ? ` — ${granted.error}` : ''}`);
      failures.push(`${acct.role}: ADMIN_ROLE_FAILED`);
      continue;
    }
    adminSt = `${granted.status} (is_admin verified)`;
  }

  secretLines.push(`E2E_${acct.role.toUpperCase()}_EMAIL=${acct.email}`);
  secretLines.push(`E2E_${acct.role.toUpperCase()}_PASSWORD=${password}`);
  results.push(`${acct.role}: OK (profile=${profileSt}${adminSt ? `, admin-role=${adminSt}` : ''})`);
}

// Write gitignored .env.e2e (merge-preserve comments not needed; it is machine-managed).
// Skipped when the passwords came from the environment (CI) so known secrets are
// never written to a runner's disk.
if (secretLines.length && !usedExternalPassword) {
  fs.writeFileSync(ENV_E2E, `# E2E test credentials — GITIGNORED, never commit\n${secretLines.join('\n')}\n`);
}

console.log(results.join('\n'));

if (failures.length) {
  console.error(`\n✗ create-test-accounts: ${failures.length} account(s) unusable — ${failures.join(', ')}`);
  process.exit(1);
}

// Optionally push GitHub secrets
if (process.argv.includes('--push-secrets')) {
  for (const line of secretLines) {
    const [k, v] = line.split('=');
    execSync(`gh secret set ${k} -R ${REPO} --body ${JSON.stringify(v)}`, { stdio: 'ignore' });
    console.log(`gh secret set: ${k} ✓`);
  }
}
