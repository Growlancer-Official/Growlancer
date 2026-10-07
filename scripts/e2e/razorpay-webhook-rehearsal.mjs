// Drives the Razorpay MONEY-IN chain with a correctly signed webhook event, so
// the leg that only a human card payment used to reach is now rehearsable:
//
//   create_order → [forged webhook: refused] → signed payment.captured
//   → escrow funded → replay (idempotent) → milestone release
//   → 5% commission + invoice + ledger + wallet credit
//
// Why this exists: `scripts/e2e/razorpay-chain.mjs` can create a real test-mode
// gateway order and prove that a forged signature is refused, but it stops at
// payment authorization — the card form inside Razorpay's hosted checkout is
// interactive by design, so the success branch of `razorpay-webhook`
// (order reconcile → `admin_fund_escrow` → notifications) had never run in
// production. This script reaches that branch by SIGNING an event with the same
// secret the deployed function verifies against, which is what Razorpay itself
// would send. It is a rehearsal, not a simulation of the handler: the event
// travels over real HTTP into the deployed function, through the real signature
// check, and the assertions read the real rows it wrote.
//
// Safety:
//   * Refuses to run unless the deployed Razorpay keys are TEST mode (a live run
//     could move real money).
//   * Fails closed when the signing secret is missing — an unsigned rehearsal
//     proves nothing. The secret value is never printed, and only ever used to
//     compute an HMAC.
//   * Three anti-vacuity controls: a forged signature must be rejected, a
//     correctly signed event for an order we do not own must NOT fund anything,
//     and a replay must not double-fund.
//   * Two throwaway accounts, one throwaway contract; everything is deleted at
//     the end and the row counts are compared with the baseline taken at start.
//
// Env (never printed): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local),
//   VITE_SUPABASE_ANON_KEY (.env), RAZORPAY_WEBHOOK_SECRET.
//   The webhook secret is the signing secret from Razorpay Dashboard →
//   Settings → Webhooks → your endpoint (same value as the deployed secret).
//   Export it for just this process, e.g.:
//     RAZORPAY_WEBHOOK_SECRET=... node scripts/e2e/razorpay-webhook-rehearsal.mjs
//
// Usage:
//   node scripts/e2e/razorpay-webhook-rehearsal.mjs [--keep]
//
// Exit code: 0 only if every check passes. A wrong secret, a refused event, a
// missing artifact or a leftover row all exit 1.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const KEEP = process.argv.includes('--keep');

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
// Never logged. Absence is a hard stop: without it every event we send would be
// rejected, and a rejected rehearsal would look like a broken webhook.
let WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET ||
  readEnvKey('.env.local', 'RAZORPAY_WEBHOOK_SECRET') ||
  readEnvKey('.env', 'RAZORPAY_WEBHOOK_SECRET');

/**
 * Last resort: ask the Supabase Management API for the deployed secret value.
 * Only used when the caller already holds a management token (CI does, via
 * SUPABASE_ACCESS_TOKEN) — the value is used to compute one HMAC and is never
 * printed, written or returned. A 401/403 or a value-less response is treated
 * as "not available", not as a failure.
 */
async function resolveSecretViaManagementApi(projectRef) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token || !projectRef) return null;
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const list = await res.json();
    const hit = Array.isArray(list)
      ? list.find((s) => s?.name === 'RAZORPAY_WEBHOOK_SECRET' && typeof s.value === 'string')
      : null;
    return hit?.value || null;
  } catch {
    return null;
  }
}

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('Missing SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY — aborting.');
  process.exit(1);
}
if (!WEBHOOK_SECRET) {
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
  WEBHOOK_SECRET = await resolveSecretViaManagementApi(projectRef);
  if (WEBHOOK_SECRET) console.log('  signing secret resolved from the Management API (value not printed)');
}
if (!WEBHOOK_SECRET) {
  console.error(
    'RAZORPAY_WEBHOOK_SECRET is not available — refusing to run a rehearsal that cannot be signed.\n' +
      'Set it for this one process (Razorpay Dashboard → Settings → Webhooks → your endpoint):\n' +
      '  RAZORPAY_WEBHOOK_SECRET=... node scripts/e2e/razorpay-webhook-rehearsal.mjs\n' +
      'or add it as a repo secret (CI) / export SUPABASE_ACCESS_TOKEN so this script can\n' +
      'resolve it from the Management API. The value is never printed or stored.',
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
const anonHeaders = { apikey: ANON_KEY, 'Content-Type': 'application/json' };

const RATE = 5000;
const FEE = Math.round(RATE * 0.05 * 100) / 100; // flat 5% — the client pays it on top
const GROSS_CHARGED = RATE + FEE;

const results = [];
const blockers = [];

function record(step, label, passed, detail) {
  results.push({ step, label, passed, detail });
  console.log(`  ${passed ? 'ok  ' : 'STOP'} [${step}] ${label} — ${detail}`);
  if (!passed && !blockers.includes(step)) blockers.push(step);
}

async function parse(res) {
  const raw = await res.text();
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body, raw: raw.slice(0, 300) };
}
const request = async (url, init) => parse(await fetch(url, init));

const serviceRest = (method, pathAndQuery, body) =>
  request(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { ...SERVICE_HEADERS, Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const rest = (method, pathAndQuery, token, body) =>
  request(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { ...userHeaders(token), Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Deployed edge function. `token` undefined = the anonymous internet. */
const edge = (name, token, body) =>
  request(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: token ? userHeaders(token) : anonHeaders,
    body: JSON.stringify(body ?? {}),
  });

/** Edge function as the service role — for diagnostics that reject anon. */
const serviceEdge = (name, body) =>
  request(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { ...SERVICE_HEADERS },
    body: JSON.stringify(body ?? {}),
  });

const razorpay = (action, token, data) => edge('razorpay', token, { action, data });

function detailOf(res) {
  const b = res.body;
  if (b && typeof b === 'object' && !Array.isArray(b)) {
    const d = b.data && typeof b.data === 'object' ? b.data : {};
    const parts = [b.code, b.error, b.message, d.error, d.message, d.detail].filter(Boolean);
    return parts.join(' ').trim().slice(0, 220) || JSON.stringify(b).slice(0, 220);
  }
  return String(res.raw || '').slice(0, 220);
}

/**
 * POST the webhook exactly the way Razorpay does: the RAW body string is signed
 * with HMAC-SHA256 over the webhook secret, and the hex digest travels in
 * `x-razorpay-signature`. The function verifies the raw bytes, so the body must
 * never be re-serialized between signing and sending.
 */
async function sendWebhook(rawBody, secret, { label } = {}) {
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const res = await request(`${SUPABASE_URL}/functions/v1/razorpay-webhook`, {
    method: 'POST',
    headers: { ...anonHeaders, 'x-razorpay-signature': signature },
    body: rawBody,
  });
  return { ...res, signature, label };
}

function strongPassword() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function adminCreateUser(email, password) {
  const res = await request(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: SERVICE_HEADERS,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  return res.body?.id ?? null;
}

async function signIn(email, password) {
  const res = await request(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: anonHeaders,
    body: JSON.stringify({ email, password }),
  });
  return res.body?.access_token ?? null;
}

async function makeAccount(tag, role) {
  const email = `rehearsal.${tag}.${Date.now()}@growlancer-test.com`;
  const password = process.env.E2E_CHAIN_PASSWORD || strongPassword();
  const id = await adminCreateUser(email, password);
  if (!id) throw new Error(`could not create auth user ${tag}`);
  const token = await signIn(email, password);
  if (!token) throw new Error(`could not sign in ${tag}`);
  await rest('POST', 'rpc/create_user_profile', token, {
    p_id: id,
    p_email: email,
    p_name: `Rehearsal ${tag}`,
    p_role: role,
    p_referral_code: null,
  });
  return { tag, role, email, password, id, token };
}

async function teardown(userId) {
  const res = await request(`${SUPABASE_URL}/rest/v1/rpc/delete_user_all_data`, {
    method: 'POST',
    headers: { ...SERVICE_HEADERS },
    body: JSON.stringify({ p_user_id: userId }),
  });
  const notes = [];
  if (res.body && res.body.success === false)
    notes.push(`cascade: ${JSON.stringify(res.body.errors).slice(0, 160)}`);
  const list = await request(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    method: 'GET',
    headers: SERVICE_HEADERS,
  });
  const users = Array.isArray(list.body) ? list.body : list.body?.users || [];
  if (users.some((u) => u.id === userId)) {
    await request(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: SERVICE_HEADERS,
    });
    notes.push('auth row needed the explicit admin delete');
  }
  return notes;
}

const TABLE_COUNTS = [
  'contracts',
  'escrow',
  'invoices',
  'platform_revenue',
  'payment_webhook_events',
  'ledger_entries',
  'razorpay_orders',
  'razorpay_transactions',
];

/** Exact row count via the Content-Range header (no row bodies fetched). */
async function totalRows(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
    method: 'HEAD',
    headers: { ...SERVICE_HEADERS, Prefer: 'count=exact', Range: '0-0' },
  });
  const cr = res.headers.get('content-range') || '';
  const total = Number(cr.split('/')[1]);
  return Number.isFinite(total) ? total : null;
}

const accounts = [];
let contractId = null;
let orderId = null;
let paymentId = null;
let baseline = null;
let clientWalletEscrowBefore = 0;
// Every event this run logs is removed again: the webhook writes one audit row
// per event, and a rehearsal must not leave audit noise behind (nor break its
// own "row counts are back to baseline" assertion).
const eventIds = [];
const eventKey = (order, payment) => `payment.captured|${order}|${payment}|`;
// Ledger rows are keyed by entity_type/entity_id TEXT, not by a user foreign key,
// so `delete_user_all_data` does NOT cascade them (verified live: the release
// left three rows behind referencing the deleted contract). For a throwaway
// probe they are removed by entity id below; for real accounts the same
// behaviour is a data-hygiene item, not something a probe should silently fix.
const ledgerEntityIds = [];

try {
  // ── 0. Mode guard: never rehearse against live keys ────────────────────
  const auth = await serviceEdge('razorpay', { action: 'test_auth' });
  const mode = auth.body?.data?.key_id_mode;
  record(
    'credentials',
    'deployed Razorpay credentials authenticate',
    auth.body?.data?.ok === true,
    `HTTP ${auth.status} ok=${auth.body?.data?.ok} mode=${mode} ${detailOf(auth)}`,
  );
  if (mode !== 'test') {
    console.error(
      `\nREFUSING TO CONTINUE: credentials are '${mode}', not 'test'. A live run could move real money.`,
    );
    process.exit(2);
  }

  // Baseline BEFORE anything is created, so teardown can prove the DB is back
  // where it started rather than merely "no rows with our email".
  baseline = {};
  for (const t of TABLE_COUNTS) baseline[t] = await totalRows(t);
  console.log(
    `\n  baseline: ${TABLE_COUNTS.map((t) => `${t}=${baseline[t] ?? '?'}`).join(' ')}\n`,
  );

  // ── 1. Throwaway accounts + a real contract ────────────────────────────
  const client = await makeAccount('client', 'client');
  accounts.push(client);
  const freelancer = await makeAccount('freelancer', 'freelancer');
  accounts.push(freelancer);
  console.log(`  throwaway: ${client.email}\n  throwaway: ${freelancer.email}\n`);

  const project = await serviceRest('POST', 'projects', {
    client_id: client.id,
    title: `Rehearsal ${Date.now()}`,
    description: 'Throwaway contract for the signed-webhook rehearsal',
  });
  const projectId = project.body?.[0]?.id;
  const proposal = await serviceRest('POST', 'proposals', {
    project_id: projectId,
    freelancer_id: freelancer.id,
    message: 'Throwaway proposal',
    proposed_rate: RATE,
  });
  const proposalId = proposal.body?.[0]?.id;
  const created = await rest('POST', 'rpc/create_contract_with_escrow', client.token, {
    p_project_id: projectId,
    p_freelancer_id: freelancer.id,
    p_proposal_id: proposalId,
    p_amount: RATE,
    p_client_id: client.id,
  });
  contractId = typeof created.body === 'string' ? created.body : created.body?.[0];
  record(
    'contract',
    'throwaway contract created with a pending escrow',
    !!contractId,
    `contract=${contractId ?? 'none'} HTTP ${created.status} ${detailOf(created)}`,
  );
  if (!contractId) throw new Error('no contract — cannot continue');

  // ── 2. Checkout: the real test-mode gateway order ──────────────────────
  const orderRes = await razorpay('create_order', client.token, {
    order_type: 'contract_escrow',
    contract_id: contractId,
    description: 'Rehearsal escrow',
  });
  orderId =
    orderRes.body?.data?.razorpay_order?.id ||
    orderRes.body?.data?.order?.razorpay_order_id ||
    orderRes.body?.data?.razorpay_order_id ||
    null;
  record(
    'checkout',
    'create_order returns a gateway order id',
    !!orderId,
    `order=${orderId ?? 'none'} HTTP ${orderRes.status} ${detailOf(orderRes)}`,
  );
  if (!orderId) throw new Error('no gateway order — the webhook has nothing to reconcile');

  const orderRow = await serviceRest(
    'GET',
    `razorpay_orders?razorpay_order_id=eq.${orderId}&select=id,amount,currency,status,contract_id`,
  );
  const dbOrder = Array.isArray(orderRow.body) ? orderRow.body[0] : null;
  // `razorpay_orders.amount` is RUPEES and covers the client-paid 5% on top of
  // the contract amount — the server derives it, the client never sends a price.
  record(
    'checkout',
    'order amount = contract + exactly 5% (server-derived)',
    Number(dbOrder?.amount) === GROSS_CHARGED,
    `db amount=${dbOrder?.amount} expected=${GROSS_CHARGED} (₹${RATE} + ₹${FEE}) currency=${dbOrder?.currency}`,
  );

  const clientWallet = await serviceRest(
    'GET',
    `wallets?user_id=eq.${client.id}&select=balance,escrow_balance`,
  );
  clientWalletEscrowBefore = Number(clientWallet.body?.[0]?.escrow_balance ?? 0);

  // ── 3. Control A: a forged signature must be refused ───────────────────
  const forgedBody = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: `pay_forged_${Date.now()}`, order_id: orderId, amount: GROSS_CHARGED * 100 } },
    },
  });
  const forged = await sendWebhook(forgedBody, `${WEBHOOK_SECRET}-wrong-on-purpose`);
  record(
    'control',
    'a wrongly signed event is rejected (the signature check is real)',
    forged.status === 401,
    `HTTP ${forged.status} ${detailOf(forged)}`,
  );

  // ── 4. Control B: a valid signature alone funds nothing ────────────────
  // Same correct signature, but an order id that is not in our ledger. If the
  // success branch could be reached by signature alone, this would fund
  // *something* — it must not touch our escrow.
  const ghostPayment = `pay_ghost_${Date.now()}`;
  const ghostOrder = `order_ghost_${Date.now()}`;
  eventIds.push(eventKey(ghostOrder, ghostPayment));
  const unknownOrderBody = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: ghostPayment, order_id: ghostOrder, amount: 100 } },
    },
  });
  const ghost = await sendWebhook(unknownOrderBody, WEBHOOK_SECRET);
  record(
    'control',
    'a correctly signed event for an unknown order is acknowledged without funding',
    ghost.status === 200 && ghost.body?.note === 'unknown_order',
    `HTTP ${ghost.status} note=${ghost.body?.note ?? '-'} ${detailOf(ghost)}`,
  );

  const escrowPending = await serviceRest(
    'GET',
    `escrow?contract_id=eq.${contractId}&select=status,amount,funded_at`,
  );
  record(
    'control',
    'escrow is still pending after both control events',
    escrowPending.body?.[0]?.status === 'pending',
    `escrow=${escrowPending.body?.[0]?.status ?? 'none'}`,
  );

  // ── 5. The signed success event — the real thing ───────────────────────
  paymentId = `pay_rehearsal_${Date.now()}`;
  eventIds.push(eventKey(orderId, paymentId));
  const capturedBody = JSON.stringify({
    event: 'payment.captured',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount: GROSS_CHARGED * 100, // paise, like the gateway sends
          currency: 'INR',
          method: 'card',
          email: client.email,
          contact: '+919999999999',
          status: 'captured',
        },
      },
      order: { entity: { id: orderId, amount: GROSS_CHARGED * 100, currency: 'INR' } },
    },
  });
  const captured = await sendWebhook(capturedBody, WEBHOOK_SECRET);
  if (captured.status === 401) {
    record(
      'webhook',
      'the deployed function accepts our signature',
      false,
      'HTTP 401 — RAZORPAY_WEBHOOK_SECRET does not match the deployed secret (Razorpay Dashboard → Settings → Webhooks). Nothing was funded.',
    );
    throw new Error('signature mismatch — rehearsal cannot continue');
  }
  record(
    'webhook',
    'signed payment.captured accepted (HTTP 200)',
    captured.status === 200,
    `HTTP ${captured.status} ${detailOf(captured)}`,
  );

  // ── 6. What the success branch must have written ───────────────────────
  const escrowAfter = await serviceRest(
    'GET',
    `escrow?contract_id=eq.${contractId}&select=status,amount,funded_at`,
  );
  const e = escrowAfter.body?.[0];
  record(
    'funding',
    'escrow is funded, stamped and unchanged in amount',
    e?.status === 'funded' && !!e?.funded_at && Number(e?.amount) === RATE,
    `status=${e?.status ?? 'none'} amount=${e?.amount ?? '-'} funded_at=${e?.funded_at ? 'set' : 'missing'}`,
  );

  const contractAfter = await serviceRest(
    'GET',
    `contracts?id=eq.${contractId}&select=status,escrow_funded,start_date,amount,platform_fee,freelancer_amount`,
  );
  const c = contractAfter.body?.[0];
  record(
    'funding',
    'contract is active + escrow_funded, with the stored 5% fee',
    c?.escrow_funded === true && c?.status === 'active' && !!c?.start_date,
    `status=${c?.status} escrow_funded=${c?.escrow_funded} start_date=${c?.start_date ?? 'null'} fee=${c?.platform_fee} freelancer=${c?.freelancer_amount}`,
  );

  const projectAfter = await serviceRest('GET', `projects?id=eq.${projectId}&select=status`);
  record(
    'funding',
    'project advanced to in_progress',
    projectAfter.body?.[0]?.status === 'in_progress',
    `project=${projectAfter.body?.[0]?.status ?? 'none'}`,
  );

  const walletAfterFund = await serviceRest(
    'GET',
    `wallets?user_id=eq.${client.id}&select=balance,escrow_balance`,
  );
  const escrowBalanceAfter = Number(walletAfterFund.body?.[0]?.escrow_balance ?? 0);
  record(
    'funding',
    'client wallet escrow_balance tracks the held escrow (invariant)',
    Math.abs(escrowBalanceAfter - (clientWalletEscrowBefore + RATE)) < 0.01,
    `escrow_balance=${escrowBalanceAfter.toFixed(2)} expected=${(clientWalletEscrowBefore + RATE).toFixed(2)}`,
  );

  const orderAfter = await serviceRest(
    'GET',
    `razorpay_orders?id=eq.${dbOrder?.id}&select=status,razorpay_payment_id,captured_at`,
  );
  const o = orderAfter.body?.[0];
  record(
    'reconcile',
    'order marked captured with the gateway payment id',
    o?.status === 'captured' && o?.razorpay_payment_id === paymentId && !!o?.captured_at,
    `status=${o?.status} payment_id=${o?.razorpay_payment_id === paymentId ? 'matches' : o?.razorpay_payment_id ?? 'none'} captured_at=${o?.captured_at ? 'set' : 'missing'}`,
  );

  const txns = await serviceRest(
    'GET',
    `razorpay_transactions?razorpay_order_id=eq.${dbOrder?.id}&select=transaction_type,amount,status,razorpay_payment_id`,
  );
  const txn = Array.isArray(txns.body) ? txns.body[0] : null;
  record(
    'reconcile',
    'one capture row recorded for the payment (no duplicates)',
    txns.body?.length === 1 && txn?.transaction_type === 'capture' && Number(txn?.amount) === GROSS_CHARGED,
    `rows=${txns.body?.length ?? 'n/a'} type=${txn?.transaction_type ?? '-'} amount=${txn?.amount ?? '-'}`,
  );

  const events = await serviceRest(
    'GET',
    `payment_webhook_events?event_id=eq.payment.captured|${orderId}|${paymentId}|&select=event_type,status`,
  );
  record(
    'reconcile',
    'the event itself is recorded once as processed',
    events.body?.length === 1 && events.body?.[0]?.status === 'processed',
    `rows=${events.body?.length ?? 'n/a'} status=${events.body?.[0]?.status ?? '-'}`,
  );

  const notifs = await serviceRest(
    'GET',
    `notifications?user_id=in.(${client.id},${freelancer.id})&select=user_id,type`,
  );
  const notifRows = Array.isArray(notifs.body) ? notifs.body : [];
  record(
    'notify',
    'both parties notified (client + freelancer)',
    notifRows.some((n) => n.user_id === client.id) &&
      notifRows.some((n) => n.user_id === freelancer.id),
    `rows=${notifRows.length} for client=${notifRows.filter((n) => n.user_id === client.id).length} freelancer=${notifRows.filter((n) => n.user_id === freelancer.id).length}`,
  );

  // ── 7. Control C: a replay must not double-fund ────────────────────────
  const replay = await sendWebhook(capturedBody, WEBHOOK_SECRET);
  const walletAfterReplay = await serviceRest(
    'GET',
    `wallets?user_id=eq.${client.id}&select=escrow_balance`,
  );
  const escrowBalanceReplay = Number(walletAfterReplay.body?.[0]?.escrow_balance ?? 0);
  record(
    'control',
    'an identical replay is ignored as a duplicate event',
    replay.status === 200 && replay.body?.ignored === true && replay.body?.reason === 'duplicate_event',
    `HTTP ${replay.status} ignored=${replay.body?.ignored ?? '-'} reason=${replay.body?.reason ?? '-'}`,
  );
  record(
    'control',
    'the replay did not fund twice',
    Math.abs(escrowBalanceReplay - escrowBalanceAfter) < 0.01,
    `escrow_balance=${escrowBalanceReplay.toFixed(2)} (unchanged from ${escrowBalanceAfter.toFixed(2)})`,
  );

  const txnsAfterReplay = await serviceRest(
    'GET',
    `razorpay_transactions?razorpay_order_id=eq.${dbOrder?.id}&select=id`,
  );
  record(
    'control',
    'the replay added no second capture row',
    txnsAfterReplay.body?.length === 1,
    `capture rows=${txnsAfterReplay.body?.length ?? 'n/a'}`,
  );

  // ── 8. The commission + invoice leg (booked at RELEASE) ────────────────
  // Funding holds the money; the 5% commission, the invoice and the ledger
  // entries are written when the escrow is released to the freelancer. This is
  // exactly where the runbook used to ask for them at the wrong moment.
  await serviceRest('PATCH', `contracts?id=eq.${contractId}`, {
    milestones: [
      {
        title: 'Rehearsal deliverable',
        amount: RATE,
        status: 'delivered',
        delivered_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
        auto_release_hours: 1,
      },
    ],
    status: 'active',
    delivered_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  });

  const released = await serviceRest('POST', 'rpc/auto_release_milestone', {
    p_contract_id: contractId,
    p_milestone_index: 0,
  });
  record(
    'release',
    'escrow released to the freelancer',
    released.body?.escrow_released === true,
    `escrow_released=${released.body?.escrow_released} HTTP ${released.status} ${detailOf(released)}`,
  );

  const revenue = await serviceRest(
    'GET',
    `platform_revenue?contract_id=eq.${contractId}&select=gross_amount,platform_fee,freelancer_amount,status,source,invoice_id`,
  );
  const r = Array.isArray(revenue.body) ? revenue.body[0] : null;
  record(
    'commission',
    'the 5% platform commission is booked on the released amount',
    Number(r?.platform_fee) === FEE && Number(r?.gross_amount) === RATE && r?.status === 'released',
    `fee=${r?.platform_fee} (expected exactly ${FEE} = 5% of ${RATE}) gross=${r?.gross_amount} status=${r?.status} source=${r?.source}`,
  );

  const invoice = await serviceRest(
    'GET',
    `invoices?contract_id=eq.${contractId}&select=invoice_number,subtotal,platform_fee,freelancer_amount,total,status,payment_method,currency`,
  );
  const inv = Array.isArray(invoice.body) ? invoice.body[0] : null;
  record(
    'invoice',
    'the invoice is issued for the true amount charged (contract + 5%)',
    !!inv && Number(inv?.subtotal) === RATE && Number(inv?.total) === GROSS_CHARGED && inv?.status === 'paid',
    `no=${inv?.invoice_number ?? '-'} subtotal=${inv?.subtotal ?? '-'} fee=${inv?.platform_fee ?? '-'} total=${inv?.total ?? '-'} (expected ${GROSS_CHARGED}) status=${inv?.status ?? '-'}`,
  );

  if (r?.invoice_id) {
    record(
      'invoice',
      'the revenue row points at the invoice it produced',
      inv !== null,
      `revenue.invoice_id=${r.invoice_id ? 'set' : 'missing'}`,
    );
  }

  // The three ledger rows do not share an entity id: the escrow debit and the
  // wallet credit point at the CONTRACT, the revenue credit points at the
  // INVOICE. Querying only by contract id finds two of three and reads as a
  // missing commission row — so collect both ids and match on either.
  const ledger = await serviceRest(
    'GET',
    `ledger_entries?or=(entity_id.eq.${contractId},entity_id.eq.${r?.invoice_id})&select=account,direction,amount,entity_type,entity_id`,
  );
  const ledgerRows = Array.isArray(ledger.body) ? ledger.body : [];
  ledgerEntityIds.push(contractId);
  if (r?.invoice_id) ledgerEntityIds.push(r.invoice_id);
  const has = (account, direction) =>
    ledgerRows.some((l) => l.account === account && l.direction === direction);
  record(
    'ledger',
    'double-entry ledger written (escrow debit, revenue credit, wallet credit)',
    has('escrow', 'debit') && has('platform_revenue', 'credit') && has('wallet', 'credit'),
    `rows=${ledgerRows.length} accounts=${[...new Set(ledgerRows.map((l) => `${l.account}:${l.direction}`))].join(',') || 'none'}`,
  );

  const fw = await serviceRest('GET', `wallets?user_id=eq.${freelancer.id}&select=balance`);
  record(
    'wallet',
    'freelancer wallet credited the full contract amount',
    Math.abs(Number(fw.body?.[0]?.balance ?? 0) - RATE) < 0.01,
    `balance=${Number(fw.body?.[0]?.balance ?? 0).toFixed(2)} expected=${RATE.toFixed(2)}`,
  );

  const cw = await serviceRest(
    'GET',
    `wallets?user_id=eq.${client.id}&select=balance,escrow_balance`,
  );
  record(
    'wallet',
    'client escrow_balance back to zero after the release (invariant holds)',
    Math.abs(Number(cw.body?.[0]?.escrow_balance ?? 0)) < 0.01,
    `escrow_balance=${Number(cw.body?.[0]?.escrow_balance ?? 0).toFixed(2)}`,
  );
} catch (err) {
  record('run', 'rehearsal executed without throwing', false, err.message);
} finally {
  if (KEEP) {
    console.log('\n--keep: nothing torn down. Left for an interactive follow-up:');
    for (const a of accounts) console.log(`   ${a.role} ${a.email} id=${a.id}`);
    console.log(`   contract=${contractId} order=${orderId ?? 'none'} payment=${paymentId ?? 'none'}`);
  } else {
    for (const a of accounts) {
      const notes = await teardown(a.id);
      record('teardown', `removed ${a.tag}`, notes.length === 0, notes.join('; ') || 'clean cascade');
    }
    if (contractId) {
      const left = await serviceRest('GET', `contracts?id=eq.${contractId}&select=id`);
      record(
        'teardown',
        'no throwaway contract rows left',
        (left.body?.length ?? 0) === 0,
        `contracts=${left.body?.length ?? 'n/a'}`,
      );
      const invLeft = await serviceRest('GET', `invoices?contract_id=eq.${contractId}&select=id`);
      const revLeft = await serviceRest(
        'GET',
        `platform_revenue?contract_id=eq.${contractId}&select=id`,
      );
      record(
        'teardown',
        'invoice + revenue rows cascaded with the contract',
        (invLeft.body?.length ?? 0) === 0 && (revLeft.body?.length ?? 0) === 0,
        `invoices=${invLeft.body?.length ?? 'n/a'} platform_revenue=${revLeft.body?.length ?? 'n/a'}`,
      );
    }
    if (ledgerEntityIds.length) {
      const removed = await serviceRest(
        'DELETE',
        `ledger_entries?entity_id=in.(${ledgerEntityIds.map((e) => `"${e}"`).join(',')})`,
      );
      record(
        'teardown',
        'throwaway ledger entries removed (they do not cascade with the account)',
        removed.ok,
        `rows targeted for entity ids of this contract HTTP ${removed.status}`,
      );
    }
    if (eventIds.length) {
      const removed = await serviceRest(
        'DELETE',
        `payment_webhook_events?event_id=in.(${eventIds.map((e) => `"${e}"`).join(',')})`,
      );
      record(
        'teardown',
        'probe webhook event rows removed (no audit noise left)',
        removed.ok,
        `rows targeted=${eventIds.length} HTTP ${removed.status}`,
      );
    }
    if (baseline) {
      const after = {};
      for (const t of TABLE_COUNTS) after[t] = await totalRows(t);
      const drifted = TABLE_COUNTS.filter((t) => baseline[t] !== after[t]);
      record(
        'teardown',
        'row counts are back to the baseline taken before the run',
        drifted.length === 0,
        drifted.length
          ? drifted.map((t) => `${t}: ${baseline[t]} → ${after[t]}`).join(' ')
          : TABLE_COUNTS.map((t) => `${t}=${after[t]}`).join(' '),
      );
    }
  }
}

const failed = results.filter((r) => !r.passed);
console.log(`\nSigned-webhook rehearsal: ${results.length} checks, ${failed.length} failure(s).`);
if (blockers.length) {
  console.log(`First failing step(s): ${blockers.join(' → ')}`);
  for (const f of failed.slice(0, 6)) console.log(`  STOP [${f.step}] ${f.label} — ${f.detail}`);
} else {
  console.log(
    'Money-in chain verified end to end: signed webhook → escrow funded → replay ignored → release → 5% commission + invoice + ledger + wallet.',
  );
}
process.exit(failed.length ? 1 : 0);
