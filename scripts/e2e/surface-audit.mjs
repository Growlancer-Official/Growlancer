// Whole-surface runtime audit against a deployed Growlancer backend.
//
// Why this exists: `pentest-privileges.mjs` proves a *curated* set of paths
// (admin flag, suspension, reputation, wallet, escrow lifecycle). It is deep
// but narrow. This script goes *broad*: it walks the rest of the live surface
// the same way and asserts, at runtime, over real HTTP with real JWTs —
//
//   A) every anon-executable SECURITY DEFINER function that takes a caller
//      supplied id must refuse an unauthenticated caller. This is Security
//      Principle §6 (never trust a user_id from the request). The failure mode
//      it catches is a guard written as `IF p_user_id <> auth.uid()` — for an
//      anonymous caller `auth.uid()` is NULL, so the comparison is NULL, so the
//      guard never fires. A *catalog* read cannot see this; only a call can.
//   B) the same functions must refuse a *different signed-in user*.
//   C) owner-scoped tables must not let one signed-in user read another's rows.
//   D) private tables must return zero rows to an anonymous visitor.
//   E) the DB invariants the platform promises: no orphan profiles, no negative
//      balances, escrow_balance == held escrow, honest public member count, and
//      the four self-detection sweeps at zero findings.
//
// Every row this needs is seeded for a THROWAWAY account and removed again in a
// `finally` through the same full-cascade path a real deletion uses. Nothing
// real is touched. Destructive probes always target the throwaway victim, and
// each destructive probe additionally re-reads the victim's row through the
// service role to prove the row survived — a status code alone would not.
//
// Vacuity is a first-class outcome. A table with no rows cannot leak, and a
// victim with no payout method cannot prove a payout leak, so every probe that
// would report "safe" on empty input first seeds real data and reports
// `vacuous` explicitly when it could not.
//
// Usage:
//   node scripts/e2e/surface-audit.mjs
//
// Requires (never committed, never printed):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — env first, then .env.local.
//   VITE_SUPABASE_ANON_KEY                  — env first, then .env.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readEnvKey(file, key) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return null;
  const m = fs.readFileSync(full, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

const SUPABASE_URL = process.env.SUPABASE_URL || readEnvKey('.env.local', 'SUPABASE_URL');
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvKey('.env.local', 'SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  readEnvKey('.env', 'VITE_SUPABASE_ANON_KEY') ||
  readEnvKey('.env.local', 'VITE_SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local) or VITE_SUPABASE_ANON_KEY (.env) — aborting.',
  );
  process.exit(1);
}

const SERVICE_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};
const userHeaders = (token) => ({
  apikey: ANON_KEY,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});
/** An unauthenticated browser: the anon key, no user JWT. */
const anonHeaders = { apikey: ANON_KEY, 'Content-Type': 'application/json' };

function strongPassword() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const results = [];
let failures = 0;

function record(group, label, passed, detail) {
  results.push({ group, label, passed, detail });
  if (!passed) failures++;
  const mark = passed ? 'ok  ' : 'FAIL';
  console.log(`  ${mark} [${group}] ${label} — ${detail}`);
}

/** Non-failing evidence line: the value is reported, the founder decides. */
function observe(label, detail) {
  results.push({ group: 'observe', label, passed: true, detail });
  console.log(`  note [observe] ${label} — ${detail}`);
}

/** A probe that could not be made meaningful (empty input) — never a pass. */
function vacuous(label, detail) {
  results.push({ group: 'vacuous', label, passed: true, detail });
  console.log(`  ~    [vacuous] ${label} — ${detail}`);
}

async function parseResponse(res) {
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: res.status, ok: res.ok, body: parsed, raw: text.slice(0, 300) };
}

async function request(url, init) {
  return parseResponse(await fetch(url, init));
}

/** PostgREST call as the signed-in user. */
async function rest(method, pathAndQuery, token, body) {
  return request(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: userHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** PostgREST call with no user session at all. */
async function anonRest(method, pathAndQuery, body) {
  return request(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: anonHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** PostgREST call as the service role (bypasses RLS — used only for setups/assertions). */
async function serviceRest(method, pathAndQuery, body) {
  return request(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: SERVICE_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Service-role INSERT that returns the inserted row.
 *
 * PostgREST defaults to `Prefer: return=minimal`, which answers 201 with an
 * EMPTY body — so `body[0].id` is undefined and a probe that needs the new id
 * silently becomes a no-op. That bug made the first run of this suite count
 * "nothing happened" as "nothing was allowed to happen".
 */
async function serviceInsert(table, row) {
  return request(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SERVICE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
}

/** Upsert-style insert (same, but tolerates a conflict). */
async function serviceInsertIgnoreConflict(table, row) {
  return request(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...SERVICE_HEADERS,
      Prefer: 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  });
}

function errorCode(response) {
  if (!response.body) return response.raw ? `HTTP ${response.status}` : `HTTP ${response.status}`;
  if (typeof response.body === 'object' && !Array.isArray(response.body)) {
    return response.body.code || response.body.message || `HTTP ${response.status}`;
  }
  return `HTTP ${response.status}`;
}

/**
 * The refusal *reason*, kept separate from the SQLSTATE.
 *
 * `errorCode()` returns the SQLSTATE *or* the message, never both — so a
 * predicate that wants to assert "it was refused because of ownership" must read
 * this. (A probe in an earlier pass could never pass because of that.)
 */
function errorReason(response) {
  const body = response.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body.message || body.details || body.hint || errorCode(response);
  }
  return `${errorCode(response)} ${String(response.raw || '').slice(0, 120)}`;
}

function rowCount(res) {
  return Array.isArray(res.body) ? res.body.length : 0;
}

/** Postgres RAISE EXCEPTION, a PostgREST error, or an explicit success:false. */
function refused(res) {
  if (res.status >= 400) return true;
  const b = res.body;
  if (b && typeof b === 'object' && !Array.isArray(b) && b.success === false) return true;
  return false;
}

async function adminCreateUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: SERVICE_HEADERS,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`create user failed: HTTP ${res.status}`);
  const body = await res.json();
  if (!body.id) throw new Error('create user returned no id');
  return body.id;
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed: HTTP ${res.status}`);
  const body = await res.json();
  if (!body.access_token) throw new Error('sign-in returned no access_token');
  return body.access_token;
}

async function makeAccount(tag, role) {
  const email = `surface.${tag}.${Date.now()}@growlancer-test.com`;
  const password = strongPassword();
  const id = await adminCreateUser(email, password);
  const token = await signIn(email, password);
  const profile = await rest('POST', 'rpc/create_user_profile', token, {
    p_id: id,
    p_email: email,
    p_name: `Surface ${tag}`,
    p_role: role,
    p_referral_code: null,
  });
  return { tag, role, email, password, id, token, profileOk: profile.ok };
}

async function teardown(userId) {
  const notes = [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_user_all_data`, {
    method: 'POST',
    headers: SERVICE_HEADERS,
    body: JSON.stringify({ p_user_id: userId }),
  });
  if (!res.ok) {
    notes.push(`delete_user_all_data HTTP ${res.status}`);
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: SERVICE_HEADERS,
    });
    return notes;
  }
  const body = await res.json();
  if (body && body.success === false) {
    notes.push(`cascade errors: ${JSON.stringify(body.errors).slice(0, 200)}`);
  }
  const list = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: SERVICE_HEADERS,
  });
  if (list.ok) {
    const payload = await list.json();
    const users = Array.isArray(payload) ? payload : payload.users || [];
    if (users.some((u) => u.id === userId)) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: SERVICE_HEADERS,
      });
      notes.push('auth row needed the explicit admin delete');
    }
  }
  return notes;
}

/** Count rows in a table through the service role (the real, unfiltered count). */
async function serviceCount(table, query = 'select=id') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { ...SERVICE_HEADERS, Prefer: 'count=exact', Range: '0-0' },
  });
  const cr = res.headers.get('content-range');
  if (cr && cr.includes('/')) {
    const n = Number(cr.split('/')[1]);
    if (!Number.isNaN(n)) return n;
  }
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? body.length : 0;
}

const accounts = [];
const seeded = { payoutMethodIds: [], notificationIds: [], workspaceIds: [], usageLogIds: [] };

try {
  // ══════════════════════════════════════════════════════════════════════════
  // Accounts: victim (owns seeded private rows), intruder (a different signed-in
  // user), and a non-party for good measure.
  // ══════════════════════════════════════════════════════════════════════════
  const victim = await makeAccount('victim', 'freelancer');
  accounts.push(victim);
  const intruder = await makeAccount('intruder', 'client');
  accounts.push(intruder);

  console.log(`Throwaway accounts created and signed in:\n  ${victim.email}\n  ${intruder.email}\n`);

  record(
    'setup',
    'both throwaway accounts got a profile row',
    victim.profileOk && intruder.profileOk,
    `victim=${victim.profileOk ? 'ok' : 'FAILED'} intruder=${intruder.profileOk ? 'ok' : 'FAILED'}`,
  );

  // ── Seed the victim's private rows (service role: these are the *targets*,
  //    not what is being proven). ────────────────────────────────────────────
  /** Seed one payout method and return its id (each destructive probe needs its own row). */
  async function seedPayoutMethod(label) {
    const res = await serviceInsert('payout_methods', {
      user_id: victim.id,
      type: 'upi',
      label,
      details: { upi_id: 'surface-audit-victim@okaxis' },
      upi_id: 'surface-audit-victim@okaxis',
      account_holder_name: 'Surface Audit Victim',
      bank_name: 'Audit Bank',
      ifsc_code: 'AUDI0000001',
      account_number: '1234567890123',
      is_default: false,
    });
    const id = Array.isArray(res.body) ? res.body[0]?.id ?? null : null;
    if (id) seeded.payoutMethodIds.push(id);
    else console.log(`  note  payout-method seed '${label}' failed: ${errorReason(res)}`);
    return id;
  }

  // One row per destructive probe: sharing one row would make whichever probe
  // runs second read a row the first probe already removed, and report a
  // product bug that is really a harness ordering artefact.
  const pmRead = await seedPayoutMethod('surface-audit victim (read target)');
  const pmAnonDelete = await seedPayoutMethod('surface-audit victim (anon delete target)');
  const pmAnonDefault = await seedPayoutMethod('surface-audit victim (anon default target)');
  const pmCrossDelete = await seedPayoutMethod('surface-audit victim (cross-user delete target)');
  const payoutMethodId = pmRead;

  const notify = await serviceInsert('notifications', {
    user_id: victim.id,
    type: 'system',
    title: 'surface-audit sentinel',
    message: 'seeded by surface-audit.mjs — must never be readable by another principal',
  });
  if (Array.isArray(notify.body) && notify.body[0]) seeded.notificationIds.push(notify.body[0].id);
  else console.log(`  note  notification seed failed: ${errorReason(notify)}`);

  const usage = await serviceInsert('usage_logs', {
    user_id: victim.id,
    feature: 'profile_view',
    feature_type: 'profile_view',
  });
  if (Array.isArray(usage.body) && usage.body[0]) seeded.usageLogIds.push(usage.body[0].id);
  else console.log(`  note  usage_logs seed failed: ${errorReason(usage)}`);

  const victimWallet = await serviceInsert('wallets', { user_id: victim.id });
  const walletSeeded = Array.isArray(victimWallet.body) && victimWallet.body.length > 0;
  if (!walletSeeded) console.log(`  note  wallet seed failed: ${errorReason(victimWallet)}`);

  observe(
    'seeded victim rows',
    `payout_methods=${seeded.payoutMethodIds.length} notifications=${seeded.notificationIds.length} usage_logs=${seeded.usageLogIds.length} wallets=${walletSeeded ? 1 : 0}`,
  );

  // ══════════════════════════════════════════════════════════════════════════
  // A) Anon RPC matrix — every curated anon-executable SECURITY DEFINER helper
  //    that takes a caller-supplied id. Each must refuse an anonymous caller.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\nA) Anonymous callers against caller-supplied ids (Security Principle §6)');

  let notificationsBefore = 0;
  let auditBefore = 0;
  let deletionBefore = 0;

  {
    notificationsBefore = await serviceCount('notifications', `select=id&user_id=eq.${victim.id}`);
    auditBefore = await serviceCount('payment_audit_logs', 'select=action');
    deletionBefore = await serviceCount('user_deletion_requests', `select=id&user_id=eq.${victim.id}`);
  }

  /**
   * Each probe: call as anon with the victim's real id, then judge the response.
   * `judge` returns { held, evidence }. `held === false` is a live finding.
   */
  const anonProbes = [
    {
      fn: 'get_payout_methods',
      args: () => ({ p_user_id: victim.id }),
      label: 'get_payout_methods(victim) returns no victim payout row',
      judge: (r) => {
        const leaked = Array.isArray(r.body) && r.body.length > 0;
        return {
          held: !leaked,
          evidence: leaked
            ? `LEAKED ${r.body.length} payout row(s): ${JSON.stringify(r.body[0]).slice(0, 160)}`
            : `HTTP ${r.status} ${errorCode(r)}`,
        };
      },
    },
    {
      fn: 'delete_payout_method',
      args: () => ({ p_method_id: pmAnonDelete, p_user_id: victim.id }),
      label: "delete_payout_method cannot delete another user's payout method",
      judge: async (r) => {
        const after = pmAnonDelete
          ? await serviceCount('payout_methods', `select=id&id=eq.${pmAnonDelete}`)
          : -1;
        const destroyed = after === 0;
        return {
          held: pmAnonDelete ? !destroyed : false,
          evidence: destroyed
            ? `ROW DELETED by an anonymous caller (response ${JSON.stringify(r.body).slice(0, 80)})`
            : `victim row still present; response HTTP ${r.status} ${errorCode(r)}`,
        };
      },
    },
    {
      fn: 'set_default_payout_method',
      args: () => ({ p_method_id: pmAnonDefault, p_user_id: victim.id }),
      label: "set_default_payout_method cannot promote another user's payout method",
      judge: async (r) => {
        const after = pmAnonDefault
          ? await serviceRest('GET', `payout_methods?select=is_default&id=eq.${pmAnonDefault}`)
          : { body: [] };
        const row = Array.isArray(after.body) ? after.body[0] : null;
        const promoted = row?.is_default === true;
        return {
          held: pmAnonDefault ? !promoted : false,
          evidence: promoted
            ? 'the victim\'s payout method was made default by an anonymous caller'
            : `is_default still ${String(row?.is_default)}; response HTTP ${r.status} ${errorCode(r)}`,
        };
      },
    },
    {
      fn: 'get_wallet_balance',
      args: () => ({ p_user_id: victim.id }),
      label: "get_wallet_balance returns no other user's balance",
      judge: (r) => {
        const b = Array.isArray(r.body) ? r.body[0] : r.body;
        const leaked = !refused(r) && b !== undefined && b !== null && b !== 0;
        return { held: !leaked, evidence: leaked ? `returned ${JSON.stringify(b)}` : `HTTP ${r.status} ${errorCode(r)}` };
      },
    },
    {
      fn: 'get_wallet_balance_v2',
      args: () => ({ p_user_id: victim.id }),
      label: "get_wallet_balance_v2 refuses an anon caller",
      judge: (r) => ({ held: refused(r), evidence: `HTTP ${r.status} ${errorReason(r)}` }),
    },
    {
      fn: 'get_user_email',
      args: () => ({ p_user_id: victim.id }),
      label: "get_user_email (PII) refuses an anon caller",
      judge: (r) => {
        const leaked = !refused(r) && typeof r.body === 'string' && r.body.includes('@');
        return { held: !leaked, evidence: leaked ? `LEAKED an email address` : `HTTP ${r.status} ${errorCode(r)}` };
      },
    },
    {
      fn: 'get_profile_views',
      args: () => ({ p_user_id: victim.id }),
      label: "get_profile_views returns no other user's counter",
      judge: (r) => {
        const b = Array.isArray(r.body) ? r.body[0] : r.body;
        const leaked = !refused(r) && typeof b === 'number' && b > 0;
        return {
          held: !leaked,
          evidence: leaked ? `returned the victim's count ${b}` : `returned ${JSON.stringify(b ?? r.status)}`,
        };
      },
    },
    {
      fn: 'grant_admin_role',
      args: () => ({ p_user_id: victim.id }),
      label: 'grant_admin_role refuses an anon caller',
      judge: async (r) => {
        const row = await serviceRest('GET', `profiles_private?select=is_admin&id=eq.${victim.id}`);
        const isAdmin = Array.isArray(row.body) ? row.body[0]?.is_admin : undefined;
        return {
          held: refused(r) && isAdmin !== true,
          evidence: `refused=${refused(r)} (${errorCode(r)}), victim is_admin=${String(isAdmin)}`,
        };
      },
    },
    {
      fn: 'disable_user_mfa',
      args: () => ({ p_user_id: victim.id }),
      label: "disable_user_mfa cannot strip another user's 2FA",
      judge: (r) => ({ held: refused(r), evidence: `HTTP ${r.status} ${errorCode(r)}` }),
    },
    {
      fn: 'enable_user_mfa',
      args: () => ({ p_user_id: victim.id, p_totp_secret: 'JBSWY3DPEHPK3PXP' }),
      label: "enable_user_mfa cannot set another user's 2FA secret",
      judge: (r) => ({ held: refused(r), evidence: `HTTP ${r.status} ${errorCode(r)}` }),
    },
    {
      fn: 'get_mfa_status',
      args: () => ({ p_user_id: victim.id }),
      label: "get_mfa_status returns no other user's MFA state",
      judge: (r) => ({ held: refused(r), evidence: `HTTP ${r.status} ${errorCode(r)}` }),
    },
    {
      fn: 'generate_recovery_codes',
      args: () => ({ p_user_id: victim.id }),
      label: "generate_recovery_codes cannot mint codes for another user",
      judge: (r) => {
        const leaked = !refused(r) && Array.isArray(r.body) && r.body.length > 0;
        return { held: !leaked, evidence: leaked ? `MINTED codes` : `HTTP ${r.status} ${errorCode(r)}` };
      },
    },
    {
      fn: 'get_recovery_codes_count',
      args: () => ({ p_user_id: victim.id }),
      label: "get_recovery_codes_count ignores another user's id",
      judge: (r) => {
        const b = Array.isArray(r.body) ? r.body[0] : r.body;
        const leaked = !refused(r) && typeof b === 'number' && b > 0;
        return { held: !leaked, evidence: leaked ? `returned ${b}` : `HTTP ${r.status} ${errorCode(r)}` };
      },
    },
    {
      fn: 'verify_recovery_code',
      args: () => ({ p_user_id: victim.id, p_code: 'AAAA-BBBB' }),
      label: "verify_recovery_code cannot test another user's codes",
      judge: (r) => ({ held: refused(r), evidence: `HTTP ${r.status} ${errorCode(r)}` }),
    },
    {
      fn: 'request_account_deletion',
      args: () => ({ p_user_id: victim.id, p_reason: 'surface audit' }),
      label: "request_account_deletion cannot start another user's deletion",
      judge: async (r) => {
        const after = await serviceCount(
          'user_deletion_requests',
          `select=id&user_id=eq.${victim.id}`,
        );
        const created = after > deletionBefore;
        return {
          held: !created,
          evidence: created
            ? 'CREATED a deletion request for the victim'
            : `refused=${refused(r)} (${errorCode(r)}), victim requests ${deletionBefore} → ${after}`,
        };
      },
    },
    {
      fn: 'cancel_account_deletion',
      args: () => ({ p_user_id: victim.id }),
      label: "cancel_account_deletion cannot cancel another user's deletion",
      judge: (r) => ({ held: refused(r), evidence: `HTTP ${r.status} ${errorCode(r)}` }),
    },
    {
      fn: 'check_deletion_status',
      args: () => ({ p_user_id: victim.id }),
      label: "check_deletion_status returns no other user's status",
      judge: (r) => ({ held: refused(r), evidence: `HTTP ${r.status} ${errorCode(r)}` }),
    },
    {
      fn: 'update_user_country',
      args: () => ({ p_user_id: victim.id, p_country: 'Antarctica' }),
      label: "update_user_country cannot change another user's country",
      judge: async (r) => {
        const row = await serviceRest('GET', `profiles?select=country&id=eq.${victim.id}`);
        const country = Array.isArray(row.body) ? row.body[0]?.country : undefined;
        return {
          held: refused(r) && country !== 'Antarctica',
          evidence: `refused=${refused(r)} (${errorCode(r)}), victim country=${String(country)}`,
        };
      },
    },
    {
      fn: 'update_reputation_score',
      args: () => ({ p_freelancer_id: victim.id }),
      label: 'update_reputation_score (merit ranking writer) refuses an anon caller',
      judge: (r) => ({ held: refused(r), evidence: `HTTP ${r.status} ${errorReason(r)}` }),
    },
    {
      fn: 'complete_referral',
      args: () => ({ p_referee_user_id: victim.id }),
      label: 'complete_referral refuses an anon caller',
      judge: (r) => ({ held: refused(r), evidence: `HTTP ${r.status} ${errorCode(r)}` }),
    },
    {
      fn: '_refund_notify',
      args: () => ({
        p_user_id: victim.id,
        p_type: 'system',
        p_title: 'surface-audit forged notification',
        p_message: 'should never be inserted by an anonymous caller',
      }),
      label: 'internal _refund_notify cannot write into another inbox',
      judge: async (r) => {
        const after = await serviceCount('notifications', `select=id&user_id=eq.${victim.id}`);
        const created = after > notificationsBefore;
        return {
          held: !created,
          evidence: created
            ? 'INSERTED a notification for the victim'
            : `refused=${refused(r)} (${errorCode(r)}), victim notifications ${notificationsBefore} → ${after}`,
        };
      },
    },
    {
      fn: '_refund_audit',
      args: () => ({
        p_user_id: victim.id,
        p_action: 'surface_audit_forged',
        p_entity_type: 'audit',
        p_entity_id: 'forged',
        p_amount: 1,
        p_currency: 'INR',
      }),
      label: 'internal _refund_audit cannot forge a payment audit row',
      judge: async (r) => {
        const after = await serviceCount('payment_audit_logs', 'select=action');
        const created = after > auditBefore;
        return {
          held: !created,
          evidence: created
            ? 'INSERTED a payment audit log'
            : `refused=${refused(r)} (${errorCode(r)}), audit rows ${auditBefore} → ${after}`,
        };
      },
    },
    {
      fn: '_refund_history_event',
      args: () => ({
        p_refund_request_id: '00000000-0000-0000-0000-000000000000',
        p_event: 'surface_audit_forged',
        p_actor_id: victim.id,
        p_actor_role: 'system',
        p_note: 'forged',
      }),
      label: 'internal _refund_history_event is refused for authority, not by accident',
      judge: (r) => {
        // A bare "did it error?" check would pass here for the wrong reason: the
        // seed row has a fake refund id, so an *unguarded* body still fails with
        // a foreign-key violation (23503). That error means the body RAN, which
        // is the opposite of a refusal — so the discriminator is whether the
        // error is authorization-shaped, not whether one occurred at all.
        const authorizationShaped = /unauthor|permission|not allowed|denied/i.test(
          errorReason(r),
        );
        return {
          held: r.status >= 400 && authorizationShaped,
          evidence: `HTTP ${r.status} ${errorReason(r)}`,
        };
      },
    },
  ];

  for (const probe of anonProbes) {
    const r = await anonRest('POST', `rpc/${probe.fn}`, probe.args());
    const { held, evidence } = await probe.judge(r, victim);
    record('anon-rpc', probe.label, held, evidence);
  }

  // The payout read is the one that matters most; if the seed failed, say so
  // rather than banking a pass that never had a row to leak.
  if (!payoutMethodId) {
    vacuous(
      'payout-method leak probe was meaningful',
      'no payout method could be seeded for the victim, so the read probe proved less than it looks',
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // B) The same helpers, called by a *different signed-in user*.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\nB) A different signed-in user against another user\'s ids');

  {
    const r = await rest('POST', 'rpc/get_payout_methods', intruder.token, {
      p_user_id: victim.id,
    });
    const leaked = Array.isArray(r.body) && r.body.length > 0;
    record(
      'cross-user-rpc',
      "a signed-in user cannot read another user's payout methods",
      !leaked,
      leaked ? `LEAKED ${r.body.length} row(s)` : `HTTP ${r.status} ${errorCode(r)}`,
    );
  }
  {
    const r = await rest('POST', 'rpc/get_wallet_balance_v2', intruder.token, {
      p_user_id: victim.id,
    });
    record(
      'cross-user-rpc',
      "a signed-in user cannot read another user's wallet balance",
      refused(r),
      `HTTP ${r.status} ${errorReason(r)}`,
    );
  }
  {
    const r = await rest('POST', 'rpc/delete_payout_method', intruder.token, {
      p_method_id: pmCrossDelete,
      p_user_id: victim.id,
    });
    const after = pmCrossDelete
      ? await serviceCount('payout_methods', `select=id&id=eq.${pmCrossDelete}`)
      : -1;
    record(
      'cross-user-rpc',
      "a signed-in user cannot delete another user's payout method",
      after !== 0,
      after === 0
        ? 'ROW DELETED by another signed-in user'
        : `row survived; refused=${refused(r)} (${errorCode(r)})`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // C) Owner-scoped tables: two signed-in users, one must not see the other.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\nC) Owner-scoped table reads across two signed-in users');

  const ownerScopedTables = [
    { table: 'payout_methods', query: (id) => `payout_methods?select=id&user_id=eq.${id}`, hasData: seeded.payoutMethodIds.length > 0 },
    { table: 'wallets', query: (id) => `wallets?select=user_id&user_id=eq.${id}`, hasData: walletSeeded },
    { table: 'notifications', query: (id) => `notifications?select=id&user_id=eq.${id}`, hasData: seeded.notificationIds.length > 0 },
    { table: 'usage_logs', query: (id) => `usage_logs?select=id&user_id=eq.${id}`, hasData: seeded.usageLogIds.length > 0 },
    { table: 'profiles_private', query: (id) => `profiles_private?select=id&id=eq.${id}`, hasData: true },
    { table: 'user_mfa_settings', query: (id) => `user_mfa_settings?select=user_id&user_id=eq.${id}`, hasData: false },
    { table: 'recovery_codes', query: (id) => `recovery_codes?select=id&user_id=eq.${id}`, hasData: false },
    { table: 'saved_payment_cards', query: (id) => `saved_payment_cards?select=id&user_id=eq.${id}`, hasData: false },
    { table: 'push_tokens', query: (id) => `push_tokens?select=id&user_id=eq.${id}`, hasData: false },
    { table: 'payment_methods', query: (id) => `payment_methods?select=id&user_id=eq.${id}`, hasData: false },
    { table: 'identity_verifications', query: (id) => `identity_verifications?select=id&user_id=eq.${id}`, hasData: false },
    { table: 'user_deletion_requests', query: (id) => `user_deletion_requests?select=id&user_id=eq.${id}`, hasData: false },
    { table: 'transactions', query: (id) => `transactions?select=id&user_id=eq.${id}`, hasData: false },
    { table: 'withdrawals', query: (id) => `withdrawals?select=id&user_id=eq.${id}`, hasData: false },
    { table: 'payment_audit_logs', query: (id) => `payment_audit_logs?select=id&user_id=eq.${id}`, hasData: false },
    { table: 'platform_revenue', query: (id) => `platform_revenue?select=id&client_id=eq.${id}`, hasData: false },
    { table: 'invoices', query: (id) => `invoices?select=id&client_id=eq.${id}`, hasData: false },
    { table: 'contract_files', query: (id) => `contract_files?select=id&uploaded_by=eq.${id}`, hasData: false },
    { table: 'dispute_internal_notes', query: () => `dispute_internal_notes?select=id`, hasData: false },
    { table: 'security_alerts', query: () => `security_alerts?select=id`, hasData: false },
    { table: 'fraud_events', query: () => `fraud_events?select=id`, hasData: false },
    { table: 'workspace_notes', query: () => `workspace_notes?select=id`, hasData: false },
  ];

  const missingRows = [];
  for (const spec of ownerScopedTables) {
    const res = await rest('GET', spec.query(victim.id), intruder.token);
    const seen = rowCount(res);
    const blocked = res.status >= 400 || seen === 0;
    if (!spec.hasData) missingRows.push(spec.table);
    record(
      'cross-user-table',
      `intruder reads 0 of the victim's ${spec.table} rows`,
      blocked,
      blocked
        ? `HTTP ${res.status}, rows=${seen}${spec.hasData ? '' : ' (no victim row to hide — weak)'}`
        : `SAW ${seen} row(s) belonging to the victim`,
    );
  }
  if (missingRows.length) {
    vacuous(
      'all cross-user table probes had real rows to hide',
      `no victim row existed for: ${missingRows.join(', ')} — those probes rely on RLS shape, not on data`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // C2) Cross-tenant workspace isolation. Seeded through the service role so the
  //     probe does not depend on the workspace feature's own creation path.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\nC2) Cross-tenant workspace isolation');

  {
    const projectA = await serviceInsert('projects', {
      client_id: victim.id,
      title: 'surface-audit workspace A',
      description: 'seeded by surface-audit.mjs',
    });
    const projectB = await serviceInsert('projects', {
      client_id: intruder.id,
      title: 'surface-audit workspace B',
      description: 'seeded by surface-audit.mjs',
    });
    const projectAId = Array.isArray(projectA.body) ? projectA.body[0]?.id : null;
    const projectBId = Array.isArray(projectB.body) ? projectB.body[0]?.id : null;

    if (!projectAId || !projectBId) {
      vacuous('cross-tenant workspace isolation', 'could not seed the two workspaces');
    } else {
      seeded.workspaceIds.push(projectAId, projectBId);
      const wsA = await serviceInsert('workspaces', {
        project_id: projectAId,
        client_id: victim.id,
        status: 'active',
      });
      const wsB = await serviceInsert('workspaces', {
        project_id: projectBId,
        client_id: intruder.id,
        status: 'active',
      });
      const wsAId = Array.isArray(wsA.body) ? wsA.body[0]?.id : null;
      const wsBId = Array.isArray(wsB.body) ? wsB.body[0]?.id : null;

      if (!wsAId || !wsBId) {
        vacuous(
          'cross-tenant workspace isolation',
          `workspace seed failed: ${errorReason(wsA)} | ${errorReason(wsB)}`,
        );
      } else {
        // `workspace_members.role` is CHECK-constrained to
        // client|lead|contributor|reviewer — an invalid value fails the INSERT,
        // and ignoring that response is how the first run of this suite reported
        // a cross-tenant "pass" over an empty table.
        const memberA = await serviceInsertIgnoreConflict('workspace_members', {
          workspace_id: wsAId,
          user_id: victim.id,
          role: 'client',
          status: 'active',
        });
        const memberB = await serviceInsertIgnoreConflict('workspace_members', {
          workspace_id: wsBId,
          user_id: intruder.id,
          role: 'client',
          status: 'active',
        });
        const seededMembers =
          (Array.isArray(memberA.body) ? memberA.body.length : 0) +
          (Array.isArray(memberB.body) ? memberB.body.length : 0);
        if (seededMembers < 2) {
          console.log(
            `  note  workspace_members seed incomplete (${seededMembers}/2): ${errorReason(memberA)}`,
          );
        }
        await serviceInsert('workspace_activity_logs', {
          workspace_id: wsAId,
          actor_id: victim.id,
          action: 'surface-audit A',
          metadata: {},
        });
        await serviceInsert('workspace_activity_logs', {
          workspace_id: wsBId,
          actor_id: intruder.id,
          action: 'surface-audit B',
          metadata: {},
        });

        // The victim is a member of workspace A only.
        //
        // A negative result only means something when the same read SUCCEEDS for
        // the caller's own workspace — otherwise "0 rows" is indistinguishable
        // from "the table is unreachable". Both directions are read in one place
        // so an error (this table returned HTTP 500 while its RLS policy
        // recursed) can never be counted as a pass.
        const ownLogs = await rest(
          'GET',
          `workspace_activity_logs?select=id&workspace_id=eq.${wsAId}`,
          victim.token,
        );
        const foreignLogs = await rest(
          'GET',
          `workspace_activity_logs?select=id,workspace_id&workspace_id=eq.${wsBId}`,
          victim.token,
        );
        const ownRows = rowCount(ownLogs);
        const foreignRows = rowCount(foreignLogs);
        const positiveWorks = ownLogs.status === 200 && ownRows > 0;

        record(
          'cross-tenant',
          'the workspace feature still works for its own member (positive control)',
          positiveWorks,
          `HTTP ${ownLogs.status}, own-workspace rows=${ownRows}`,
        );
        record(
          'cross-tenant',
          "a member of one workspace cannot read another workspace's activity log",
          positiveWorks && foreignRows === 0,
          positiveWorks
            ? `HTTP ${foreignLogs.status}, rows=${foreignRows}`
            : `INCONCLUSIVE: the positive control failed (HTTP ${ownLogs.status}), so rows=0 proves nothing here`,
        );

        const ownMembers = await rest(
          'GET',
          `workspace_members?select=id&workspace_id=eq.${wsAId}`,
          victim.token,
        );
        const foreignMembers = await rest(
          'GET',
          `workspace_members?select=id,workspace_id,user_id&workspace_id=eq.${wsBId}`,
          victim.token,
        );
        const positiveMembers = ownMembers.status === 200 && rowCount(ownMembers) > 0;
        record(
          'cross-tenant',
          "a member of one workspace cannot enumerate another workspace's members",
          positiveMembers && rowCount(foreignMembers) === 0,
          positiveMembers
            ? `HTTP ${foreignMembers.status}, rows=${rowCount(foreignMembers)}`
            : `INCONCLUSIVE: own-member read was HTTP ${ownMembers.status} with ${rowCount(ownMembers)} row(s)`,
        );

        // An intruder who is a member of workspace B must also not reach A.
        const reverseLogs = await rest(
          'GET',
          `workspace_activity_logs?select=id&workspace_id=eq.${wsAId}`,
          intruder.token,
        );
        record(
          'cross-tenant',
          'the reverse direction is closed too',
          rowCount(reverseLogs) === 0,
          `HTTP ${reverseLogs.status}, rows=${rowCount(reverseLogs)}`,
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // D) Anonymous reads of private tables — must be zero rows.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\nD) Anonymous reads of private tables');

  const privateTables = [
    'payout_methods', 'wallets', 'transactions', 'withdrawals', 'escrow', 'ledger_entries',
    'invoices', 'platform_revenue', 'payment_methods', 'saved_payment_cards',
    'payment_audit_logs', 'payment_webhook_events', 'razorpay_orders', 'razorpay_transactions',
    'refunds', 'refund_history', 'refund_requests', 'paypal_orders', 'paypal_transactions',
    'profiles_private', 'identity_verifications', 'kyc_provider_config', 'user_mfa_settings',
    'recovery_codes', 'push_tokens', 'notifications', 'notification_preferences',
    'user_deletion_requests', 'deletion_failures', 'admin_credentials', 'admin_users',
    'admin_withdrawals', 'dispute_internal_notes', 'security_alerts', 'client_errors',
    'fraud_events', 'workspace_activity_logs', 'workspace_members', 'workspace_notes',
    'contracts', 'contract_files', 'milestones', 'messages', 'support_tickets',
    'ticket_messages', 'user_reports', 'user_invitations',
  ];

  let emptyTables = 0;
  for (const table of privateTables) {
    const total = await serviceCount(table, 'select=id');
    const res = await anonRest('GET', `${table}?select=*&limit=1`);
    const seen = rowCount(res);
    const blocked = res.status >= 400 || seen === 0;
    record(
      'anon-table',
      `anon reads 0 rows from ${table}`,
      blocked,
      blocked
        ? `HTTP ${res.status}, rows=${seen} (table has ${total} row(s))`
        : `LEAKED ${seen} row(s) to an anonymous visitor`,
    );
    if (total === 0) emptyTables++;
  }
  if (emptyTables) {
    vacuous(
      'every private table actually had rows to hide',
      `${emptyTables}/${privateTables.length} private tables are empty, so their anon read proves nothing yet`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // E) DB invariants — the promises the platform makes about its own data.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\nE) Database invariants and self-detection');

  {
    // E1/E2: no negative wallet balances.
    const negative = await serviceRest(
      'GET',
      'wallets?select=user_id,balance,pending_balance&or=(balance.lt.0,pending_balance.lt.0)',
    );
    record(
      'invariants',
      'no wallet has a negative balance or pending balance',
      rowCount(negative) === 0,
      `${rowCount(negative)} offending row(s)`,
    );

    // E3: no orphan profiles — every profile must have a signable auth row.
    const profileIds = await serviceRest('GET', 'profiles?select=id&limit=1000');
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
      headers: SERVICE_HEADERS,
    });
    const authPayload = authRes.ok ? await authRes.json() : null;
    const authUsers = Array.isArray(authPayload) ? authPayload : authPayload?.users || [];
    const authIds = new Set(authUsers.map((u) => u.id));
    const profileIdList = (Array.isArray(profileIds.body) ? profileIds.body : []).map((r) => r.id);
    const orphans = profileIdList.filter((id) => !authIds.has(id));
    record(
      'invariants',
      'every profile still has a signable auth account (no orphans)',
      orphans.length === 0,
      `${orphans.length} orphan profile(s) out of ${profileIdList.length}`,
    );

    // E4: the public member count must equal signable profiles, not profiles.count.
    const metrics = await serviceRest('GET', 'rpc/get_public_platform_metrics');
    const m = Array.isArray(metrics.body) ? metrics.body[0] : metrics.body;
    const reportedMembers = m?.memberCount ?? m?.member_count ?? null;
    const signable = profileIdList.filter((id) => authIds.has(id)).length;
    record(
      'invariants',
      'public member count counts only accounts that can still sign in',
      reportedMembers === signable,
      `reported=${String(reportedMembers)} signable=${signable}`,
    );
    observe(
      'public metrics snapshot',
      JSON.stringify({
        memberCount: reportedMembers,
        escrow: m?.escrow ?? m?.escrowTotal ?? null,
        reviews: m?.reviews ?? null,
        countries: m?.countries ?? null,
      }),
    );

    // E5: escrow_balance must equal the sum of held escrow, per client.
    const wallets = await serviceRest(
      'GET',
      'wallets?select=user_id,escrow_balance&escrow_balance=gt.0',
    );
    const offenders = [];
    for (const w of Array.isArray(wallets.body) ? wallets.body : []) {
      const held = await serviceRest(
        'GET',
        `escrow?select=amount&client_id=eq.${w.user_id}&status=in.(funded,disputed,frozen)`,
      );
      const sum = (Array.isArray(held.body) ? held.body : []).reduce(
        (t, r) => t + Number(r.amount ?? 0),
        0,
      );
      if (Math.abs(sum - Number(w.escrow_balance)) > 0.001) {
        offenders.push(`${w.user_id}: escrow_balance=${w.escrow_balance} held=${sum}`);
      }
    }
    record(
      'invariants',
      'wallets.escrow_balance equals the sum of that client\'s held escrow',
      offenders.length === 0,
      offenders.length ? offenders.join('; ') : `all ${rowCount(wallets)} wallet(s) with escrow agree`,
    );
    if (rowCount(wallets) === 0) {
      vacuous(
        'escrow_balance invariant had live escrow to check',
        'no wallet holds escrow right now, so the invariant holds trivially',
      );
    }

    // E6-E9: the four self-detection sweeps must find nothing.
    const detectors = [
      ['self_writable_trust_columns', 'self-writable trust columns'],
      ['anon_reachable_money_rpc', 'anon-reachable money RPCs'],
      ['client_writable_money_tables', 'client-writable money tables'],
      ['stale_jwt_claim_check', 'stale JWT-claim guards'],
    ];
    for (const [fn, label] of detectors) {
      const r = await serviceRest('GET', `rpc/${fn}`);
      const n = Array.isArray(r.body) ? r.body.length : null;
      record(
        'drift-monitor',
        `${label}: 0 findings`,
        n === 0,
        n === null ? `HTTP ${r.status} ${errorCode(r)}` : `${n} finding(s)`,
      );
    }

    // E10: open security alerts.
    const alerts = await serviceCount('security_alerts', 'select=id&resolved_at=is.null');
    observe('open security alerts', `${alerts}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Baseline: the DB must be back where it started.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\nF) Teardown');
} finally {
  const notes = [];
  for (const a of accounts) {
    try {
      notes.push(...(await teardown(a.id)));
    } catch (err) {
      notes.push(`teardown threw for ${a.tag}: ${err.message}`);
    }
  }
  // The seeded workspace/project rows cascade with the accounts, but assert it.
  for (const id of seeded.workspaceIds) {
    await serviceRest('DELETE', `projects?id=eq.${id}`);
  }
  const leftovers = [];
  for (const [table, query] of [
    ['projects', 'select=id&title=like.surface-audit*'],
    ['workspaces', 'select=id'],
    ['workspace_activity_logs', 'select=id&action=like.surface-audit*'],
    ['notifications', 'select=id&title=eq.surface-audit sentinel'],
  ]) {
    const n = await serviceCount(table, query);
    if (n > 0) leftovers.push(`${table}=${n}`);
  }
  console.log(
    notes.length ? `  teardown notes: ${notes.join(' | ')}` : '  teardown clean (no cascade errors)',
  );
  console.log(
    leftovers.length
      ? `  LEFTOVERS: ${leftovers.join(', ')}`
      : '  no probe leftovers in projects/workspaces/activity logs/notifications',
  );
  if (leftovers.length) failures++;
}

// ── Summary ────────────────────────────────────────────────────────────────
const groups = [...new Set(results.map((r) => r.group))];
console.log('\n══════════════════════════════════════════════════════════════');
console.log('SURFACE AUDIT SUMMARY');
for (const g of groups) {
  const all = results.filter((r) => r.group === g);
  const bad = all.filter((r) => !r.passed).length;
  console.log(`  ${g.padEnd(18)} ${String(all.length).padStart(3)} probe(s)${bad ? `  ${bad} FAILED` : ''}`);
}
const checks = results.filter((r) => r.group !== 'observe' && r.group !== 'vacuous').length;
const vacuousCount = results.filter((r) => r.group === 'vacuous').length;
console.log(
  `\n  ${checks} check(s), ${failures} failure(s), ${vacuousCount} vacuous note(s)`,
);
if (failures) {
  console.log('\nFAILURES:');
  for (const f of results.filter((r) => !r.passed)) {
    console.log(`  ✗ [${f.group}] ${f.label}\n      ${f.detail}`);
  }
}
console.log('══════════════════════════════════════════════════════════════');
process.exit(failures ? 1 : 0);
