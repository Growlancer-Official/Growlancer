// Drives ONE complete Razorpay payment chain on a throwaway contract and
// reports exactly which step stops it:
//
//   checkout (create_order) → payment authorization → webhook → escrow funding
//   → milestone release → payout
//
// Safety:
//   * It first asks the deployed `razorpay` function (action `test_auth`) what
//     credentials it holds, and ABORTS unless they are TEST keys. A live-key run
//     could move real money, so it refuses rather than guesses.
//   * Two throwaway accounts are created and fully cascade-deleted at the end
//     (unless --keep is passed, which is only for an interactive follow-up).
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local),
//      VITE_SUPABASE_ANON_KEY (.env). Values are never printed.

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

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('Missing SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY — aborting.');
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
const FEE = Math.round(RATE * 0.05 * 100) / 100; // flat 5%, client pays on top
const results = [];
const blockers = [];

function record(step, label, passed, detail) {
  results.push({ step, label, passed, detail });
  console.log(`  ${passed ? 'ok  ' : 'STOP'} [${step}] ${label} — ${detail}`);
  if (!passed && !blockers.includes(step)) blockers.push(step);
}

async function parse(res) {
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body, raw: text.slice(0, 300) };
}
const request = async (url, init) => parse(await fetch(url, init));

const rest = (method, pathAndQuery, token, body) =>
  request(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { ...userHeaders(token), Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const serviceRest = (method, pathAndQuery, body) =>
  request(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { ...SERVICE_HEADERS, Prefer: 'return=representation' },
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
  const email = `chain.${tag}.${Date.now()}@growlancer-test.com`;
  const password = process.env.E2E_CHAIN_PASSWORD || strongPassword();
  const id = await adminCreateUser(email, password);
  if (!id) throw new Error(`could not create auth user ${tag}`);
  const token = await signIn(email, password);
  if (!token) throw new Error(`could not sign in ${tag}`);
  await rest('POST', 'rpc/create_user_profile', token, {
    p_id: id,
    p_email: email,
    p_name: `Chain ${tag}`,
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
  if (res.body && res.body.success === false) notes.push(`cascade: ${JSON.stringify(res.body.errors).slice(0, 160)}`);
  const list = await request(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    method: 'GET',
    headers: SERVICE_HEADERS,
  });
  const users = Array.isArray(list.body) ? list.body : list.body?.users || [];
  if (users.some((u) => u.id === userId)) {
    await request(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: SERVICE_HEADERS });
    notes.push('auth row needed the explicit admin delete');
  }
  return notes;
}

const accounts = [];
let contractId = null;
let orderId = null;

try {
  // ── 0. Credentials: which mode is the deployed gateway in? ─────────────
  // test_auth reports the mode and an 8-char PUBLIC key-id prefix; it rejects
  // anon callers at the gateway, so it goes through the service key.
  const auth = await serviceEdge('razorpay', { action: 'test_auth' });
  const mode = auth.body?.data?.key_id_mode;
  const authOk = auth.body?.data?.ok === true;
  record(
    'credentials',
    'deployed Razorpay credentials authenticate',
    authOk,
    `HTTP ${auth.status} ok=${auth.body?.data?.ok} mode=${mode} ${detailOf(auth)}`,
  );

  if (mode !== 'test') {
    console.error(
      `\nREFUSING TO CONTINUE: credentials are '${mode}', not 'test'. A live run could move real money.`,
    );
    process.exit(2);
  }

  // ── 1. Throwaway accounts + a real contract ────────────────────────────
  const client = await makeAccount('client', 'client');
  accounts.push(client);
  const freelancer = await makeAccount('freelancer', 'freelancer');
  accounts.push(freelancer);
  console.log(`\n  throwaway: ${client.email}\n  throwaway: ${freelancer.email}\n`);

  const project = await serviceRest('POST', 'projects', {
    client_id: client.id,
    title: `Chain probe ${Date.now()}`,
    description: 'Throwaway contract for the Razorpay chain probe',
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
    'throwaway contract created',
    !!contractId,
    `contract=${contractId ?? 'none'} HTTP ${created.status} ${detailOf(created)}`,
  );
  if (!contractId) throw new Error('no contract — cannot continue');

  // ── 2. CHECKOUT: create the Razorpay order ─────────────────────────────
  const orderRes = await razorpay('create_order', client.token, {
    order_type: 'contract_escrow',
    contract_id: contractId,
    description: 'Chain probe escrow',
  });
  // The function returns { data: { order: <our row>, razorpay_order: <gateway>,
  // razorpay_key_id, amount, currency } } — the id is on the gateway object.
  orderId =
    orderRes.body?.data?.razorpay_order?.id ||
    orderRes.body?.data?.order?.razorpay_order_id ||
    orderRes.body?.data?.razorpay_order_id ||
    null;
  record(
    'checkout',
    'create_order returns a Razorpay order',
    !!orderId,
    `order=${orderId ?? 'none'} key=${orderRes.body?.data?.razorpay_key_id ? 'present' : 'absent'} HTTP ${orderRes.status} ${detailOf(orderRes)}`,
  );

  if (orderId) {
    const row = await serviceRest(
      'GET',
      `razorpay_orders?razorpay_order_id=eq.${orderId}&select=amount,currency,status,order_type`,
    );
    const o = Array.isArray(row.body) ? row.body[0] : null;
    // `razorpay_orders.amount` stores RUPEES (the gateway order itself is in
    // paise); the client never sends a price, the function derives it.
    record(
      'checkout',
      'server-derived amount = contract + 5% commission (client never sends a price)',
      Number(o?.amount) === RATE + FEE,
      `db amount=${o?.amount} expected=${RATE + FEE} (₹${RATE} + ₹${FEE} fee) currency=${o?.currency}`,
    );
  }

  // ── 3. PAYMENT AUTHORIZATION — the interactive step ────────────────────
  // A client cannot fabricate a payment: verify_payment checks Razorpay's HMAC
  // over `order_id|payment_id` with the KEY secret, which is server-side only.
  const forged = await razorpay('verify_payment', client.token, {
    razorpay_order_id: orderId ?? 'order_forged',
    razorpay_payment_id: 'pay_forged',
    razorpay_signature: 'deadbeef',
  });
  record(
    'authorization',
    'a forged payment signature is refused (client cannot self-authorize)',
    forged.body?.success !== true,
    `HTTP ${forged.status} ${detailOf(forged)}`,
  );
  record(
    'authorization',
    'payment authorized by Razorpay (test card in the hosted checkout)',
    false,
    'BLOCKED: the authorization only happens inside Razorpay\'s hosted checkout — an interactive card form no script can complete. Nothing downstream can be reached from here.',
  );

  // ── 4. WEBHOOK → escrow funding ────────────────────────────────────────
  const webhookBody = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_forged', order_id: orderId, amount: RATE * 100 } } },
  });
  const webhook = await request(`${SUPABASE_URL}/functions/v1/razorpay-webhook`, {
    method: 'POST',
    headers: { ...anonHeaders, 'x-razorpay-signature': 'deadbeef' },
    body: webhookBody,
  });
  record(
    'webhook',
    'an unsigned / mis-signed webhook is rejected (fail-closed)',
    !webhook.ok,
    `HTTP ${webhook.status} ${detailOf(webhook)}`,
  );

  const escrowAfterWebhook = await serviceRest(
    'GET',
    `escrow?contract_id=eq.${contractId}&select=status,amount`,
  );
  record(
    'webhook',
    'escrow NOT funded by the forged webhook',
    escrowAfterWebhook.body?.[0]?.status === 'pending',
    `escrow=${escrowAfterWebhook.body?.[0]?.status ?? 'none'}`,
  );

  // ── 5. ESCROW FUNDING (wallet path, NOT the gateway path) ──────────────
  // The gateway path needs step 3, so drive funding the way a wallet top-up
  // does, purely so the downstream legs below can still be exercised.
  const topUp = await serviceRest('POST', 'rpc/update_wallet_balance', {
    p_user_id: client.id,
    p_amount: RATE * 2,
  });
  record(
    'funding (wallet path)',
    'client wallet credited by service role (simulated completed top-up)',
    topUp.ok && topUp.body?.success === true,
    `HTTP ${topUp.status} ${detailOf(topUp)}`,
  );
  const funded = await rest('POST', 'rpc/fund_escrow_from_wallet', client.token, {
    p_contract_id: contractId,
  });
  record(
    'funding (wallet path)',
    'escrow funded so the release/payout legs can be driven',
    funded.body?.success === true,
    `HTTP ${funded.status} ${detailOf(funded)}`,
  );

  // ── 6. MILESTONE RELEASE ───────────────────────────────────────────────
  await serviceRest('PATCH', `contracts?id=eq.${contractId}`, {
    milestones: [
      { title: 'Chain deliverable', amount: RATE, status: 'delivered', delivered_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(), auto_release_hours: 1 },
    ],
    status: 'active',
    delivered_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  });
  const walletBefore = Number(
    (await rest('POST', 'rpc/get_wallet_balance', freelancer.token, { p_user_id: freelancer.id }))?.body?.balance ?? 0,
  );
  const released = await serviceRest('POST', 'rpc/auto_release_milestone', {
    p_contract_id: contractId,
    p_milestone_index: 0,
  });
  const walletAfter = Number(
    (await rest('POST', 'rpc/get_wallet_balance', freelancer.token, { p_user_id: freelancer.id }))?.body?.balance ?? 0,
  );
  record(
    'release',
    'milestone release credits the freelancer',
    released.body?.escrow_released === true && Math.abs(walletAfter - walletBefore - RATE) < 0.01,
    `escrow_released=${released.body?.escrow_released} credited=${(walletAfter - walletBefore).toFixed(2)} HTTP ${released.status}`,
  );

  // ── 7. PAYOUT ──────────────────────────────────────────────────────────
  // `details` is NOT NULL without a default, and the app mirrors the flat
  // fields into it (src/lib/withdrawal.ts addPayoutMethod) — do the same.
  const method = await serviceRest('POST', 'payout_methods', {
    user_id: freelancer.id,
    type: 'upi',
    upi_id: 'success@razorpay', // RazorpayX test-mode magic VPA: always succeeds
    account_holder_name: 'Chain Probe',
    email: freelancer.email,
    details: { upi_id: 'success@razorpay', email: freelancer.email, account_holder_name: 'Chain Probe' },
    is_default: true,
  });
  const methodId = method.body?.[0]?.id;
  record(
    'payout',
    'payout method row created for the freelancer',
    !!methodId,
    `payout_method=${methodId ?? 'none'} HTTP ${method.status} ${detailOf(method)}`,
  );
  const fund = await razorpay('create_fund_account', freelancer.token, {
    payout_method_id: methodId,
    name: 'Chain Probe',
    email: freelancer.email,
    phone: '+919999999999',
  });
  const fundAccountId = fund.body?.data?.fund_account_id;
  record(
    'payout',
    'RazorpayX fund account created (test mode)',
    !!fundAccountId,
    `fund_account=${fundAccountId ?? 'none'} HTTP ${fund.status} ${detailOf(fund)}`,
  );

  const withdrawal = await edge('withdrawal', freelancer.token, {
    amount: 1000,
    withdrawal_method: 'razorpay_payout',
    payout_method_id: methodId,
    payout_mode: 'IMPS',
  });
  record(
    'payout',
    'withdrawal reaches the RazorpayX payout API (not merely queued)',
    withdrawal.body?.payout_completed === true || !!withdrawal.body?.provider_payout_id,
    `HTTP ${withdrawal.status} queued=${withdrawal.body?.queued ?? false} payout_completed=${withdrawal.body?.payout_completed ?? false} ${detailOf(withdrawal)}`,
  );

  // Column names matter here: the payout id is `razorpay_payout_id` and the
  // provider error is `failure_reason` — selecting a non-existent column
  // returns a 400 whose body is an error object, which reads as "no row".
  const wdRow = await serviceRest(
    'GET',
    `withdrawals?user_id=eq.${freelancer.id}&select=status,amount,fee,net_amount,failure_reason,razorpay_payout_id&order=created_at.desc&limit=1`,
  );
  const w = Array.isArray(wdRow.body) ? wdRow.body[0] : null;
  record(
    'payout',
    'the withdrawal row records the provider outcome',
    !!w,
    `status=${w?.status ?? 'none'} amount=${w?.amount ?? '-'} fee=${w?.fee ?? '-'} net=${w?.net_amount ?? '-'} razorpay_payout_id=${w?.razorpay_payout_id ?? '-'} HTTP ${wdRow.status}`,
  );
  console.log(`  note [payout] provider error: ${w?.failure_reason ?? '(none recorded)'}`);

  const wb = await rest('POST', 'rpc/get_wallet_balance', freelancer.token, {
    p_user_id: freelancer.id,
  });
  console.log(
    `  note [payout] wallet after withdrawal: balance=${wb.body?.balance ?? '-'} pending=${wb.body?.pending_balance ?? '-'} (funds must be held, not lost)`,
  );
} catch (err) {
  record('run', 'chain executed without throwing', false, err.message);
} finally {
  if (KEEP) {
    console.log('\n--keep: nothing torn down. Accounts left for an interactive follow-up:');
    for (const a of accounts) console.log(`   ${a.role} ${a.email} id=${a.id}`);
    console.log(`   contract=${contractId} order=${orderId ?? 'none'}`);
  } else {
    for (const a of accounts) {
      const notes = await teardown(a.id);
      record('teardown', `removed ${a.tag}`, notes.length === 0, notes.join('; ') || 'clean cascade');
    }
    const left = await serviceRest('GET', `contracts?id=eq.${contractId}&select=id`);
    record(
      'teardown',
      'no throwaway contract rows left',
      (left.body?.length ?? 0) === 0,
      `contracts=${left.body?.length ?? 'n/a'}`,
    );
  }
}

console.log(`\nChain probe: ${results.length} checks, ${results.filter((r) => !r.passed).length} stop(s).`);
if (blockers.length) {
  console.log(`First blocking step(s): ${blockers.join(' → ')}`);
} else {
  console.log('No blocking step observed.');
}
