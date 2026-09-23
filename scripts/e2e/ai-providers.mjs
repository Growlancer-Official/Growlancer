// Are Growlancer's AI features actually calling a model in production, or
// silently returning deterministic results?
//
// Why this exists: the three AI functions fail in *three different* ways, and
// two of them are invisible from the outside.
//
//   ai-assistant   no key → 500 { error: 'AI service is not configured' }
//                  key rejected by the gateway → 500 { error: <gateway message> }
//                  working → 200 SSE with real generated text + the model name
//   ai-writer      no key → 500 'AI service is not configured'
//                  key rejected → 502 'AI generation failed. Please try again.'
//                  working → 200 { success, text }
//   ai-matching    no key → 200 { success: true, ai_enhanced: false }   ← SILENT
//                  key rejected → 200 { ai_enhanced: false }           ← SILENT
//                  working → 200 { ai_enhanced: true, matches[].ai_score: <n> }
//
// `ai-matching` is the dangerous one: it is built to always work, so a missing
// or dead credential degrades the product to deterministic scoring with a 200
// and a green-looking response. This script separates "no key configured" from
// "key configured but the gateway rejects it" from "genuinely working", using a
// real account, a real JWT and the real HTTP edge — the same way a browser asks.
//
// ai-matching needs something to rank: a caller-owned project AND at least one
// freelancer who clears the deterministic filters (otherwise
// `if (!AI_API_KEY || candidates.length === 0) return null` makes ai_enhanced
// false for a reason that has nothing to do with credentials). So this seeds a
// throwaway client, a throwaway freelancer whose category and skills match the
// project, and the project itself.
//
// Usage:
//   node scripts/e2e/ai-providers.mjs
//
// Requires (never committed, never printed):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — env first (CI), then .env.local.
//   VITE_SUPABASE_ANON_KEY                  — env first, then .env.
//
// Exit code: 0 only if all three functions provably produced model output.
// Anything else (unconfigured, gateway rejection, silent fallback) is 1, because
// every one of those states is a real gap between what the product claims and
// what it does.
//
// Both throwaway accounts are deleted in a `finally` via the same full-cascade
// path a real account deletion uses, so an interrupted run leaves nothing.

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

function strongPassword() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function request(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body, raw: text.slice(0, 400) };
}

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
async function edge(name, token, body, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      ...(token ? userHeaders(token) : { apikey: ANON_KEY, 'Content-Type': 'application/json' }),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: res.status, ok: res.ok, body: parsed, raw: text.slice(0, 600) };
}

async function adminCreateUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: SERVICE_HEADERS,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.id) throw new Error(`admin create failed for ${email}: ${res.status}`);
  return body.id;
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return body?.access_token ?? null;
}

/** One throwaway account: auth row, session, and its own profile row. */
async function makeAccount(tag, role) {
  const email = `e2e.ai.${tag}.${Date.now()}@growlancer-test.com`;
  const password = strongPassword();
  const id = await adminCreateUser(email, password);
  const token = await signIn(email, password);
  if (!token) throw new Error(`could not sign in ${tag}`);
  // Parameter names must match the RPC signature exactly — a mismatch is
  // answered with 404 (function not found), not a helpful error, and silently
  // ignoring it is how the profile row goes missing and every later insert
  // fails on a foreign key. Check it.
  const profile = await rest('POST', 'rpc/create_user_profile', token, {
    p_id: id,
    p_email: email,
    p_name: `AI Probe ${tag}`,
    p_role: role,
    p_referral_code: null,
  });
  if (!profile.ok) {
    throw new Error(
      `create_user_profile failed for ${tag}: HTTP ${profile.status} ${profile.raw.slice(0, 200)}`,
    );
  }
  return { tag, id, email, password, token };
}

/** Full-cascade delete, exactly like a real account deletion. */
async function teardown(userId) {
  const notes = [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_user_all_data`, {
    method: 'POST',
    headers: SERVICE_HEADERS,
    body: JSON.stringify({ p_user_id: userId }),
  });
  if (!res.ok) notes.push(`delete_user_all_data HTTP ${res.status}`);
  else {
    const body = await res.json().catch(() => null);
    if (body && body.success === false) {
      notes.push(`cascade errors: ${JSON.stringify(body.errors).slice(0, 200)}`);
    }
  }
  // The cascade removes the auth row too; this is the belt-and-braces sweep.
  const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: SERVICE_HEADERS,
  });
  if (!del.ok && del.status !== 404) notes.push(`auth delete HTTP ${del.status}`);
  return notes;
}

// ─── Result bookkeeping ──────────────────────────────────────────────────────

const verdicts = [];
const OK_STATES = new Set(['working', 'enforced']);
const STATE_LABEL = {
  working: 'WORKING',
  not_configured: 'NOT CONFIGURED',
  gateway_error: 'GATEWAY ERROR',
  silent_fallback: 'SILENT FALLBACK',
  inconclusive: 'INCONCLUSIVE',
  enforced: 'ENFORCED',
  not_enforced: 'NOT ENFORCED',
};
function verdict(feature, state, detail, ok = OK_STATES.has(state)) {
  verdicts.push({ feature, state, detail, ok });
  console.log(`  → ${feature}: ${STATE_LABEL[state]} — ${detail}`);
}

// ─── Probes ──────────────────────────────────────────────────────────────────

/**
 * ai-assistant, streaming: the SSE stream relays the model name once, which is
 * the strongest available proof that a real model answered (not a canned reply).
 */
async function probeAssistant(account) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
    method: 'POST',
    headers: { ...userHeaders(account.token), Accept: 'text/event-stream' },
    body: JSON.stringify({
      user_role: 'client',
      messages: [{ role: 'user', content: 'Reply with exactly one word: PONG' }],
      context: {},
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    let message = text.slice(0, 200);
    try {
      message = JSON.parse(text)?.error ?? message;
    } catch {
      /* keep the raw slice */
    }
    if (res.status === 500 && /not configured/i.test(message)) {
      return verdict(
        'ai-assistant',
        'not_configured',
        `HTTP 500 "${message}" — AI_API_KEY is absent, so the feature refuses to run (fails closed, no silent degradation)`,
      );
    }
    return verdict(
      'ai-assistant',
      'gateway_error',
      `HTTP ${res.status} "${message}" — a key IS configured (otherwise the 500 would say so) but the gateway rejected the call`,
    );
  }

  let model = null;
  let generated = '';
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const evt = JSON.parse(payload);
      if (evt.model) model = evt.model;
      if (evt.text) generated += evt.text;
    } catch {
      /* malformed SSE frames are ignored by the function itself too */
    }
  }

  if (generated.trim()) {
    return verdict(
      'ai-assistant',
      'working',
      `real model output in a live SSE stream${model ? ` (model="${model}")` : ''}: "${generated.trim().slice(0, 60)}"`,
    );
  }
  return verdict(
    'ai-assistant',
    'gateway_error',
    `HTTP 200 but the stream carried no text${model ? ` (model="${model}")` : ''} — empty generation, raw="${text.slice(0, 160)}"`,
  );
}

/** ai-writer: 500 = no key, 502 = gateway rejected, 200 + text = working. */
async function probeWriter(account) {
  const res = await edge('ai-writer', account.token, {
    field: 'project_title',
    input: 'need a landing page for a small bakery',
    context: { category: 'Web Development', skills: ['React'] },
  });

  if (res.status === 200 && res.body?.text) {
    return verdict(
      'ai-writer',
      'working',
      `generated real text ("${String(res.body.text).trim().slice(0, 60)}")`,
    );
  }
  const message = res.body?.error ?? res.raw.slice(0, 200);
  if (res.status === 500 && /not configured/i.test(String(message))) {
    return verdict(
      'ai-writer',
      'not_configured',
      `HTTP 500 "${message}" — AI_API_KEY is absent; fails closed`,
    );
  }
  if (res.status === 502) {
    return verdict(
      'ai-writer',
      'gateway_error',
      `HTTP 502 "${message}" — a key IS configured (a missing one returns 500 "not configured") but the gateway call failed`,
    );
  }
  return verdict('ai-writer', 'gateway_error', `HTTP ${res.status} "${message}"`);
}

/**
 * Auth boundary — a negative control on the probe itself.
 *
 * "All three working" is only meaningful if the probe is really reaching the
 * live functions. Each one requires a JWT, so an anonymous call must be refused
 * with 401: if these came back 200 the probe would be talking to a cached or
 * public path and its whole verdict would be worthless.
 */
async function probeAuthBoundary() {
  const calls = await Promise.all([
    edge('ai-assistant', undefined, { user_role: 'client', messages: [{ role: 'user', content: 'hi' }] }),
    edge('ai-writer', undefined, { field: 'project_title', input: 'x' }),
    edge('ai-matching', undefined, { project_id: '00000000-0000-0000-0000-000000000000' }),
  ]);
  const names = ['ai-assistant', 'ai-writer', 'ai-matching'];
  const leaked = names.filter((_, i) => calls[i].status !== 401);
  if (leaked.length) {
    verdict(
      'auth boundary',
      'not_enforced',
      `${leaked.join(', ')} answered an unauthenticated call with ${leaked
        .map((n) => `${n}=${calls[names.indexOf(n)].status}`)
        .join(', ')} instead of 401 — probe results cannot be trusted either`,
    );
  } else {
    verdict('auth boundary', 'enforced', 'all three refuse an anonymous caller with 401');
  }
}

/**
 * Does a signed-in NON-owner get to run AI matching on someone else's project?
 *
 * `ai-matching` authenticates the caller but never checks that the project is
 * theirs. It costs real AI spend per call and writes ai_matches rows for that
 * project. Reported as evidence, not asserted away — whether it should be
 * owner-only is a product decision (a client's own page is the only caller).
 */
async function probeNonOwnerMatching(account, projectId) {
  const res = await edge('ai-matching', account.token, { project_id: projectId });
  if (res.status === 200 && res.body?.success) {
    verdict(
      'non-owner matching',
      'not_enforced',
      `a signed-in user who is NOT the project's client got 200 success (ai_enhanced=${res.body.ai_enhanced}, ${res.body.matches?.length ?? 0} match(es)) — real AI spend and ai_matches rows for someone else's project`,
    );
  } else {
    verdict(
      'non-owner matching',
      'enforced',
      `refused for a non-owner: HTTP ${res.status} "${res.body?.error ?? res.raw.slice(0, 100)}"`,
    );
  }
}

/**
 * ai-matching: the only one that can fail silently — it must always return 200
 * so matching never breaks. `ai_enhanced` is the whole answer.
 */
async function probeMatching(account, projectId, expectedCandidates) {
  const res = await edge('ai-matching', account.token, { project_id: projectId });

  if (res.status !== 200 || !res.body?.success) {
    return verdict(
      'ai-matching',
      'gateway_error',
      `HTTP ${res.status} "${res.body?.error ?? res.raw.slice(0, 160)}"`,
    );
  }

  const matches = Array.isArray(res.body.matches) ? res.body.matches : [];
  if (matches.length === 0) {
    return verdict(
      'ai-matching',
      'inconclusive',
      'project returned 0 matches, so the AI pass was never reached (candidates.length === 0). This is a gap in the probe seeding, NOT a verdict on the credentials.',
    );
  }
  if (res.body.ai_enhanced === true) {
    const scored = matches.filter((m) => typeof m.ai_score === 'number');
    const sample = scored[0];
    return verdict(
      'ai-matching',
      'working',
      `ai_enhanced=true, ${scored.length}/${matches.length} candidates carry a model ai_score` +
        (sample ? ` (e.g. ai_score=${sample.ai_score}, reason="${String(sample.match_reason ?? '').slice(0, 50)}")` : ''),
    );
  }
  return verdict(
    'ai-matching',
    'silent_fallback',
    `HTTP 200, ai_enhanced=false with ${matches.length} candidate(s) ranking fine — deterministic scoring only. ` +
      `Either AI_API_KEY is absent or the gateway rejected the call; the response looks identical either way. ` +
      `The other two probes above say which (expected ${expectedCandidates} matching candidate(s) seeded).`,
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

const TAG = Math.random().toString(36).slice(2, 8);
let client = null;
let freelancer = null;
let projectId = null;

try {
  console.log(`\nAI provider probe — ${SUPABASE_URL} (project ${SUPABASE_URL.split('//')[1]?.split('.')[0]})\n`);

  console.log('Seeding a throwaway client + a matching freelancer + a project…');
  client = await makeAccount(`client${TAG}`, 'client');
  freelancer = await makeAccount(`free${TAG}`, 'freelancer');

  const CATEGORY = 'Web Development';
  const SKILLS = ['React', 'TypeScript', 'Tailwind'];

  const fp = await serviceRest('POST', 'freelancer_profiles', {
    user_id: freelancer.id,
    bio: 'Probe profile for AI verification — React and TypeScript specialist.',
    skills: SKILLS,
    categories: [CATEGORY],
    hourly_rate: 1500,
    availability: true,
    experience: 6,
    completion_rate: 100,
    reputation_score: 100,
  });
  if (!fp.ok) throw new Error(`freelancer_profiles insert failed: ${fp.status} ${fp.raw}`);

  const proj = await serviceRest('POST', 'projects', {
    client_id: client.id,
    title: 'Probe project — React dashboard for logistics',
    description:
      'Build a real-time logistics dashboard in React with TypeScript and Tailwind, including charts and role-based views.',
    category: CATEGORY,
    skills_required: SKILLS,
    budget_min: 20000,
    budget_max: 60000,
    experience_level: 'intermediate',
  });
  if (!proj.ok) throw new Error(`projects insert failed: ${proj.status} ${proj.raw}`);
  projectId = proj.body?.[0]?.id;
  if (!projectId) throw new Error('project id missing from insert response');

  console.log('  seeded: 1 client, 1 freelancer (category+skills match), 1 project\n');

  console.log('Probing live edge functions with the client\'s own JWT…');
  await probeAssistant(client);
  await probeWriter(client);
  await probeMatching(client, projectId, 1);

  console.log('\nBoundary checks…');
  await probeAuthBoundary();
  await probeNonOwnerMatching(freelancer, projectId);
} catch (err) {
  console.error(`\nprobe failed: ${err?.message || err}`);
  verdicts.push({ feature: 'probe', state: 'inconclusive', detail: String(err?.message || err) });
  process.exitCode = 1;
} finally {
  console.log('\nTeardown…');
  const notes = [];
  for (const acct of [client, freelancer]) {
    if (!acct) continue;
    const n = await teardown(acct.id);
    notes.push(`${acct.tag}: ${n.length ? n.join('; ') : 'clean'}`);
  }
  console.log(`  ${notes.join(' | ')}`);

  // Prove the cascade really took the seeded rows with it.
  try {
    const leftovers = [];
    if (projectId) {
      const p = await serviceRest('GET', `projects?id=eq.${projectId}&select=id`);
      if (Array.isArray(p.body) && p.body.length) leftovers.push('project');
    }
    if (freelancer) {
      const f = await serviceRest('GET', `freelancer_profiles?user_id=eq.${freelancer.id}&select=id`);
      if (Array.isArray(f.body) && f.body.length) leftovers.push('freelancer_profile');
    }
    console.log(leftovers.length ? `  ⚠ leftovers: ${leftovers.join(', ')}` : '  no leftovers');
  } catch (err) {
    console.log(`  leftover check failed: ${err?.message || err}`);
  }

  const bad = verdicts.filter((v) => !v.ok);
  console.log('\n─── summary ───');
  for (const v of verdicts) console.log(`  ${v.feature}: ${v.state}`);
  console.log(
    bad.length
      ? `\n${bad.length} of ${verdicts.length} checks need attention. Exit 1.\n`
      : '\nAll three AI functions provably produced model output, and the boundaries hold. Exit 0.\n',
  );
  if (bad.length) process.exitCode = 1;
}
