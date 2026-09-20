// Removes the 3 E2E test accounts (freelancer / client / admin) from the linked
// Supabase project — full cascade via the delete_user_all_data RPC, the same path
// a real account deletion takes.
//
// Why this exists: the authenticated element-audit needs those accounts to log in,
// but they must not sit in production between runs — they show up in member counts,
// admin tables and any other live metric. CI therefore seeds them right before the
// authenticated pass and calls this right after (always, pass or fail).
//
// Safe to run any time: an account that does not exist is reported as
// `already_absent` and nothing else happens. Idempotent.
//
// Usage:
//   node scripts/e2e/remove-test-accounts.mjs
//
// Requires (never committed):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — from the environment first (CI),
//   falling back to .env.local for local runs.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ENV_LOCAL = path.join(ROOT, '.env.local');

function readEnvKey(file, key) {
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

const SUPABASE_URL = process.env.SUPABASE_URL || readEnvKey(ENV_LOCAL, 'SUPABASE_URL');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvKey(ENV_LOCAL, 'SUPABASE_SERVICE_ROLE_KEY');
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (env or .env.local) — aborting.');
  process.exit(1);
}

const H = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' };

const ACCOUNTS = [
  { role: 'freelancer', email: 'e2e.freelancer@growlancer-test.com' },
  { role: 'client', email: 'e2e.client@growlancer-test.com' },
  { role: 'admin', email: 'e2e.admin@growlancer-test.com' },
];

/** Look up an auth user id by email. Returns null when the account is absent. */
async function findUserId(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: H });
  if (!res.ok) throw new Error(`list users failed: HTTP ${res.status}`);
  const body = await res.json();
  const users = Array.isArray(body) ? body : body.users || [];
  const hit = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  return hit ? hit.id : null;
}

let removed = 0;
let absent = 0;
const failures = [];

for (const acct of ACCOUNTS) {
  try {
    const userId = await findUserId(acct.email);
    if (!userId) {
      absent++;
      console.log(`- ${acct.role}: already_absent`);
      continue;
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_user_all_data`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ p_user_id: userId }),
    });
    if (!res.ok) throw new Error(`delete RPC failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);

    const result = await res.json();
    if (result && result.success === false) {
      throw new Error(`cascade reported errors: ${JSON.stringify(result.errors).slice(0, 300)}`);
    }
    removed++;
    console.log(`- ${acct.role}: removed`);
  } catch (err) {
    failures.push(`${acct.role}: ${err.message}`);
    console.error(`- ${acct.role}: FAILED — ${err.message}`);
  }
}

console.log(`\nE2E account teardown: removed=${removed} already_absent=${absent} failed=${failures.length}`);
if (failures.length) {
  // Leaving test accounts in production is the thing this script exists to prevent,
  // so a partial failure must be loud.
  console.error('Teardown incomplete — these accounts may still be live:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
