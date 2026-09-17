// Creates/updates the 3 permanent E2E test accounts (freelancer / client / admin)
// in the linked Supabase project and prints NOTHING sensitive.
//
// Usage:
//   node scripts/e2e/create-test-accounts.mjs            # create or repair
//   node scripts/e2e/create-test-accounts.mjs --rotate   # new random passwords + push secrets
//
// Requires in .env.local (never committed):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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

const SUPABASE_URL = readEnvKey(ENV_LOCAL, 'SUPABASE_URL');
const SERVICE_KEY = readEnvKey(ENV_LOCAL, 'SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local — aborting.');
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

async function adminGetByEmail(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers: H });
  const body = await res.json().catch(() => ({ users: [] }));
  return body.users?.[0] || null;
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
  return rpc.status;
}

const rotate = process.argv.includes('--rotate');
const results = [];
const secretLines = [];

for (const acct of ACCOUNTS) {
  const existing = await adminGetByEmail(acct.email);
  const existingEnvPassword = readEnvKey(ENV_E2E, `E2E_${acct.role.toUpperCase()}_PASSWORD`);
  const password = rotate || !existingEnvPassword ? strongPassword() : existingEnvPassword;

  let id = existing?.id || null;
  if (!id) {
    const created = await adminCreate(acct.email, password, acct.name);
    if (created.status !== 200 || !created.id) {
      console.error(`✗ ${acct.role}: admin create failed (${created.status}) ${created.error || ''}`);
      results.push(`${acct.role}: CREATE_FAILED`);
      continue;
    }
    id = created.id;
  } else {
    const st = await adminUpdatePassword(id, password);
    if (st !== 200) {
      console.error(`✗ ${acct.role}: password update failed (${st})`);
      results.push(`${acct.role}: UPDATE_FAILED`);
      continue;
    }
  }

  const profileSt = await ensureProfile(id, acct.email, acct.name, acct.role);
  let adminSt = null;
  if (acct.role === 'admin') adminSt = await setAdminRole(id);

  secretLines.push(`E2E_${acct.role.toUpperCase()}_EMAIL=${acct.email}`);
  secretLines.push(`E2E_${acct.role.toUpperCase()}_PASSWORD=${password}`);
  results.push(`${acct.role}: OK (profile=${profileSt}${adminSt ? `, admin-role=${adminSt}` : ''})`);
}

// Write gitignored .env.e2e (merge-preserve comments not needed; it is machine-managed)
if (secretLines.length) {
  fs.writeFileSync(ENV_E2E, `# E2E test credentials — GITIGNORED, never commit\n${secretLines.join('\n')}\n`);
}

console.log(results.join('\n'));

// Optionally push GitHub secrets
if (process.argv.includes('--push-secrets')) {
  for (const line of secretLines) {
    const [k, v] = line.split('=');
    execSync(`gh secret set ${k} -R ${REPO} --body ${JSON.stringify(v)}`, { stdio: 'ignore' });
    console.log(`gh secret set: ${k} ✓`);
  }
}
