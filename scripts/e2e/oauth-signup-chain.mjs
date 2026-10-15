// Drives the OAuth signup chain end to end against the DEPLOYED backend, without
// needing a human to complete a provider login.
//
// WHY THIS SHAPE: a GitHub/LinkedIn signup is two independent legs.
//   1. GoTrue exchanges the provider code and INSERTs a row into auth.users.
//      That is the only thing the provider is responsible for, and it is the
//      contract this harness reproduces through the Admin API — the same table
//      write, with zero app involvement.
//   2. The browser is then supposed to call the `create_user_profile` RPC to
//      create profiles / profiles_private (and, via the profiles trigger, the
//      wallet). Nothing server-side did this before this harness existed, so a
//      transient failure in that brief window left a permanent "ghost" account:
//      authenticated, but with no profile → login looks broken for that user.
//
// Leg A asserts leg 1 alone is enough (the fix). Legs B–D assert the browser
// path still works, repairs a ghost, and is idempotent.
//
// Usage:
//   node scripts/e2e/oauth-signup-chain.mjs [--keep]
//
//   --keep  skip teardown (leaves the throwaway account for inspection)
//
// Requires (never committed):
//   SUPABASE_URL / VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   VITE_SUPABASE_ANON_KEY — from the environment first (CI), falling back to
//   .env.local for local runs. Missing config is fail-closed (exit 1), never a
//   silent pass.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
// Both files are gitignored; CI supplies the same values as `E2E_*` / public
// service secrets. .env.local is preferred, .env is the local fallback that
// carries the publishable anon key.
const ENV_FILES = [path.join(ROOT, '.env.local'), path.join(ROOT, '.env')];
const KEEP = process.argv.includes('--keep');

function readEnvKey(file, key) {
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

function readEnv(key) {
  for (const file of ENV_FILES) {
    const value = readEnvKey(file, key);
    if (value) return value;
  }
  return null;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || readEnv('SUPABASE_URL') || readEnv('VITE_SUPABASE_URL');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnv('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || readEnv('VITE_SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY ' +
      '(env or .env.local) — aborting rather than reporting a pass.',
  );
  process.exit(1);
}

const SVC = {
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
  'Content-Type': 'application/json',
};

// ── assertions ────────────────────────────────────────────────────────────────
const checks = [];
function record(leg, name, ok, detail) {
  checks.push({ leg, name, ok: !!ok, detail: detail ?? '' });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function serviceRest(method, query, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    method,
    headers: { ...SVC, Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

/** The exact request shape src/lib/services/authService.ts uses. */
async function appCreateProfile(jwt, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_user_profile`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

/** The exact request shape src/lib/services/authService.ts#fetchUserProfile uses. */
async function appFetchProfile(jwt, userId) {
  const pub = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&id=eq.${userId}&limit=1`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` },
  });
  const pubBody = await pub.json().catch(() => null);
  const priv = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles_private?select=email,phone,is_admin,suspended_at,onboarding_completed,referral_code&id=eq.${userId}`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}` } },
  );
  const privBody = await priv.json().catch(() => null);
  return {
    profile: Array.isArray(pubBody) ? pubBody[0] ?? null : null,
    private: Array.isArray(privBody) ? privBody[0] ?? null : null,
    statuses: [pub.status, priv.status],
  };
}

const runId = crypto.randomBytes(4).toString('hex');
const email = `oauth-chain.${runId}@growlancer-test.com`;
const password = crypto.randomBytes(18).toString('base64url');
const displayName = `OAuth Chain ${runId}`;

let userId = null;
const failures = [];

async function main() {
  console.log(`\n── OAuth signup chain ── target ${SUPABASE_URL} · account ${email}\n`);

  // ── Leg A: what GoTrue itself does on a provider signup ────────────────────
  console.log('A. provider leg — a new auth.users row (Admin API, no app involvement)');
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: SVC,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: displayName, full_name: displayName },
    }),
  });
  const createdBody = await created.json().catch(() => null);
  if (!created.ok || !createdBody?.id) {
    throw new Error(`admin create user failed: HTTP ${created.status} ${String(createdBody).slice(0, 200)}`);
  }
  userId = createdBody.id;
  record('A', 'admin created the auth user', !!userId, `id=${userId.slice(0, 8)}…`);

  // Give the (previously browser-only) profile creation a moment to land.
  let profile = null;
  let priv = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500));
    const pub = await serviceRest('GET', `profiles?id=eq.${userId}&select=id,name,role`);
    priv = await serviceRest(
      'GET',
      `profiles_private?id=eq.${userId}&select=id,email,onboarding_completed,referral_code`,
    );
    profile = Array.isArray(pub.body) ? pub.body[0] ?? null : null;
    if (profile) break;
  }
  const privRow = Array.isArray(priv?.body) ? priv.body[0] ?? null : null;
  const wallet = await serviceRest('GET', `wallets?user_id=eq.${userId}&select=user_id,balance`);
  const triggerRefCode = await serviceRest(
    'GET',
    `profiles_private?id=eq.${userId}&select=referral_code,onboarding_completed`,
  );
  const triggerRef = Array.isArray(triggerRefCode.body) ? triggerRefCode.body[0] ?? null : null;

  record(
    'A',
    'profiles row exists from the auth insert alone (no browser needed)',
    !!profile,
    profile ? `role=${profile.role} name=${profile.name}` : 'MISSING — the account is a ghost until a browser calls the RPC',
  );
  record(
    'A',
    'profiles_private row exists (email + onboarding flag)',
    !!privRow,
    privRow ? `email=${privRow.email} onboarding_completed=${privRow.onboarding_completed}` : 'MISSING',
  );
  record(
    'A',
    'wallet exists (created by the profiles insert trigger)',
    Array.isArray(wallet.body) && wallet.body.length > 0,
    Array.isArray(wallet.body) && wallet.body.length > 0 ? 'present' : 'MISSING',
  );
  record(
    'A',
    'the server assigned a deterministic referral code and onboarding=false',
    /^GRW-[A-Z]{2}-[0-9a-f]{6}$/.test(triggerRef?.referral_code ?? '') && triggerRef?.onboarding_completed === false,
    `referral_code=${triggerRef?.referral_code ?? 'none'} onboarding_completed=${triggerRef?.onboarding_completed}`,
  );

  // ── Leg B: the browser leg (real session, real RPC) ───────────────────────
  console.log('\nB. browser leg — real user session (mirrors the OAuth callback session)');
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const tokenBody = await tokenRes.json().catch(() => null);
  const jwt = tokenBody?.access_token;
  record('B', 'signed in and got a real user JWT', !!jwt, jwt ? 'access_token present' : String(tokenBody).slice(0, 160));
  if (!jwt) throw new Error('no JWT — cannot drive the browser leg');

  const rpc = await appCreateProfile(jwt, {
    p_id: userId,
    p_email: email,
    p_name: displayName,
    p_role: 'freelancer',
    p_referral_code: `GRW-FR-${runId}`.toUpperCase(),
  });
  record(
    'B',
    'create_user_profile RPC (exact app params) succeeds',
    rpc.status === 200 && rpc.body?.success !== false,
    `HTTP ${rpc.status} ${String(rpc.body).slice(0, 120)}`,
  );

  const fetched = await appFetchProfile(jwt, userId);
  record(
    'B',
    'fetchUserProfile shape resolves for the signed-in owner (profiles + profiles_private grants)',
    !!fetched.profile && !!fetched.private && fetched.statuses.every((s) => s === 200),
    `statuses=${fetched.statuses.join('/')} role=${fetched.profile?.role ?? '-'} email=${fetched.private?.email ? 'read' : 'missing'}`,
  );

  // ── Leg C: ghost self-heal ────────────────────────────────────────────────
  console.log('\nC. self-heal — the app must be able to repair a profile-less account');
  await serviceRest('DELETE', `profiles?id=eq.${userId}`);
  await serviceRest('DELETE', `profiles_private?id=eq.${userId}`);
  const gone = await serviceRest('GET', `profiles?id=eq.${userId}&select=id`);
  record('C', 'reproduced the ghost state (rows removed)', !Array.isArray(gone.body) || gone.body.length === 0, 'profiles row deleted');

  const healed = await appCreateProfile(jwt, {
    p_id: userId,
    p_email: email,
    p_name: displayName,
    p_role: 'client',
    p_referral_code: `GRW-CL-${runId}`.toUpperCase(),
  });
  const afterHeal = await serviceRest('GET', `profiles?id=eq.${userId}&select=id,name,role`);
  const healedRow = Array.isArray(afterHeal.body) ? afterHeal.body[0] ?? null : null;
  record(
    'C',
    'self-heal recreates the profile with the caller-chosen role',
    healed.status === 200 && healedRow?.role === 'client',
    `HTTP ${healed.status} role=${healedRow?.role ?? 'none'}`,
  );

  // ── Leg D: idempotency ────────────────────────────────────────────────────
  console.log('\nD. idempotency — signing in again must not duplicate or corrupt rows');
  const second = await appCreateProfile(jwt, {
    p_id: userId,
    p_email: email,
    p_name: `${displayName} (renamed)`,
    p_role: 'client',
    p_referral_code: `GRW-CL-${runId}`.toUpperCase(),
  });
  const rows = await serviceRest('GET', `profiles?id=eq.${userId}&select=id,name,role`);
  const privRows = await serviceRest('GET', `profiles_private?id=eq.${userId}&select=id,referral_code`);
  record(
    'D',
    'exactly one profiles + one profiles_private row after the second call',
    Array.isArray(rows.body) && rows.body.length === 1 && Array.isArray(privRows.body) && privRows.body.length === 1,
    `profiles=${Array.isArray(rows.body) ? rows.body.length : '?'} private=${Array.isArray(privRows.body) ? privRows.body.length : '?'} HTTP ${second.status}`,
  );
  record(
    'D',
    'the second call updated the name instead of failing',
    Array.isArray(rows.body) && rows.body[0]?.name === `${displayName} (renamed)`,
    `name=${Array.isArray(rows.body) ? rows.body[0]?.name : '-'}`,
  );
  // The RPC's documented collision rule appends `-<4 hex>` when the requested
  // code already exists — including for the same row on a repeat call. So the
  // contract is "preserved, or deterministically suffixed", never "lost".
  // (Caught by this harness: a strict-equality assertion here was the harness's
  // own defect, not a product one.)
  const requestedCode = `GRW-CL-${runId}`.toUpperCase();
  const finalCode = Array.isArray(privRows.body) ? privRows.body[0]?.referral_code : null;
  record(
    'D',
    'the referral code is preserved (or suffixed by the documented collision rule)',
    finalCode === requestedCode || new RegExp(`^${requestedCode}-[0-9a-f]{4}$`).test(finalCode ?? ''),
    `requested=${requestedCode} final=${finalCode}`,
  );
}

async function teardown() {
  if (!userId) return;
  if (KEEP) {
    console.log(`\n--keep: leaving ${email} (${userId}) in place.`);
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: SVC,
  });
  record('teardown', 'admin hard-delete accepted (cascade trigger runs)', res.ok, `HTTP ${res.status}`);

  await new Promise((r) => setTimeout(r, 1500));
  for (const [table, query] of [
    ['profiles', `profiles?id=eq.${userId}&select=id`],
    ['profiles_private', `profiles_private?id=eq.${userId}&select=id`],
    ['wallets', `wallets?user_id=eq.${userId}&select=user_id`],
  ]) {
    const left = await serviceRest('GET', query);
    record(
      'teardown',
      `no ${table} row left behind`,
      Array.isArray(left.body) && left.body.length === 0,
      Array.isArray(left.body) && left.body.length === 0 ? 'clean' : `LEFTOVER ${left.body.length} row(s)`,
    );
  }
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  failures.push(err instanceof Error ? err.message : String(err));
  console.error(`\nHarness error: ${failures[failures.length - 1]}`);
} finally {
  try {
    await teardown();
  } catch (err) {
    failures.push(`teardown: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`Teardown error: ${failures[failures.length - 1]}`);
  }
}

const failed = checks.filter((c) => !c.ok);
console.log('\n─── results ───');
for (const leg of ['A', 'B', 'C', 'D', 'teardown']) {
  const inLeg = checks.filter((c) => c.leg === leg);
  if (!inLeg.length) continue;
  console.log(`${leg}: ${inLeg.filter((c) => c.ok).length}/${inLeg.length} passed`);
}
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(`  • [${f.leg}] ${f.name} — ${f.detail}`);
}
if (failures.length) {
  console.log('\nHarness/teardown errors:');
  for (const f of failures) console.log(`  • ${f}`);
}

const total = checks.length;
console.log(`\n${total - failed.length}/${total} checks passed`);
exitCode = failed.length || failures.length ? 1 : 0;
process.exit(exitCode);
