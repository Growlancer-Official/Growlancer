// Growlancer E2E login helper — creates Playwright storage-states for
// authenticated audit runs.
//
//   node scripts/e2e/login.mjs --base=http://127.0.0.1:4174 --role=freelancer
//   node scripts/e2e/login.mjs --role=client --role2=admin
//
// ⚠️ The PRODUCT no longer has an email/password form — GitHub/LinkedIn is the
// only sign-in. It would be dishonest to drive a form that users cannot see, so
// this helper now performs the same credential exchange the app does, straight
// against GoTrue (`POST /auth/v1/token?grant_type=password`), and seeds the
// resulting session into the browser's localStorage before the app boots. That
// is exactly what `supabase.auth.signInWithPassword` would persist — the audits
// then run against a session that is real, refreshable and server-verified.
//
// Test accounts keep their email+password: `create-test-accounts.mjs` creates
// them through the admin API (which does not go through the UI either).
//
// Credentials come from env (never hardcode, never commit):
//   E2E_FREELANCER_EMAIL / E2E_FREELANCER_PASSWORD
//   E2E_CLIENT_EMAIL     / E2E_CLIENT_PASSWORD
//   E2E_ADMIN_EMAIL      / E2E_ADMIN_PASSWORD
// plus the public backend coordinates:
//   SUPABASE_URL (or VITE_SUPABASE_URL) / VITE_SUPABASE_ANON_KEY
//
// Writes .e2e/<role>.json (gitignored) usable as --storage for
// element-audit.mjs / device-audit.mjs.
//
// --require-all: strict mode for CI. A role whose credentials are missing, or
// that fails to log in, fails the run instead of being skipped. Without it a
// half-configured environment produces "some roles logged in" and exit 0, which
// is how an authenticated audit ends up reported as green while never having
// rendered a single logged-in page.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const CHROME_CANDIDATES = [
  process.env.E2E_CHROME_PATH,
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium_headless_shell-1243\\chrome-headless-shell-win64\\chrome-headless-shell.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.join('=') || 'true'];
  })
);

const BASE = args.base || 'http://127.0.0.1:4174';
const OUT_DIR = path.resolve('.e2e');
// CI sets this: an inactive authenticated pass must never look like a green one.
const REQUIRE_ALL = args['require-all'] === 'true';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const ROLES = {
  freelancer: { email: process.env.E2E_FREELANCER_EMAIL, password: process.env.E2E_FREELANCER_PASSWORD, landing: '/dashboard' },
  client: { email: process.env.E2E_CLIENT_EMAIL, password: process.env.E2E_CLIENT_PASSWORD, landing: '/client' },
  admin: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD, landing: '/admin' },
};

/** supabase-js v2's default storage key for the configured project. */
function storageKeyFor(url) {
  return `sb-${new URL(url).host.split('.')[0]}-auth-token`;
}

/**
 * Exchange the test account's credentials for a real session — the same call
 * the app's password flow used to make. Failures carry GoTrue's own reason
 * (`error_code` + `error_description`/`msg`) so a stale CI secret is named
 * instead of guessed at.
 */
async function fetchSession(role) {
  const cfg = ROLES[role];
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body — fall back to the status below */
  }
  if (!res.ok || !body?.access_token) {
    const detail =
      [body?.error_code || body?.error, body?.msg || body?.error_description]
        .filter(Boolean)
        .join(' — ') || `HTTP ${res.status}`;
    throw new Error(
      `${role}: auth endpoint rejected the sign-in (${detail}) — the E2E_${role.toUpperCase()}_* secrets are stale; re-run create-test-accounts.mjs --push-secrets`
    );
  }
  return body;
}

async function attemptLogin(browser, role) {
  const cfg = ROLES[role];

  // Session first (outside the browser): a dead credential fails here with a
  // named reason instead of masquerading as a slow redirect.
  const session = await fetchSession(role);

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Seed the persisted session BEFORE the app boots — this is the same
  // localStorage entry supabase-js writes after a successful sign-in.
  await context.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* storage unavailable — the audit below will fail loudly */
      }
    },
    [storageKeyFor(SUPABASE_URL), JSON.stringify(session)]
  );
  const page = await context.newPage();

  await page.goto(`${BASE}${cfg.landing}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // Wait for an authenticated marker. The real ground truth is the Supabase
  // session in localStorage (that is what the storage state needs), so a live
  // session counts as success even if the SPA redirect is slow — a CI runner is
  // much slower than a local machine and used to fail here while the token was
  // already stored. A session with no navigation gets one nudge.
  const landing = cfg.landing;

  const hasSession = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'));
    const raw = key ? localStorage.getItem(key) : null;
    if (!raw) return false;
    try { return !!JSON.parse(raw)?.access_token; } catch { return raw.includes('access_token'); }
  }).catch(() => false);

  const onAuthenticatedRoute = () => page.evaluate(() => {
    const url = location.pathname;
    return url.startsWith('/dashboard') || url.startsWith('/client') || url.startsWith('/admin');
  }).catch(() => false);

  // The admin CONSOLE — not the admin login screen. AdminAuthGuard renders
  // AdminLoginPage for anyone unauthorized, so `/admin` by itself proves
  // nothing: a signed-in non-admin sits on a login form, and an element audit
  // of that page reports the logged-out surface as green. Identified by the
  // login form's own input rather than by prose in the page.
  const onAdminConsole = () => page.evaluate(() => {
    if (!location.pathname.startsWith('/admin')) return false;
    return !document.querySelector('input[aria-label="Admin password"]');
  }).catch(() => false);

  const deadline = Date.now() + 60000;
  let ok = false;
  let sawSession = false;
  let sawRoute = false;
  while (Date.now() < deadline && !ok) {
    sawSession = (await hasSession()) || sawSession;
    sawRoute = (await (role === 'admin' ? onAdminConsole() : onAuthenticatedRoute())) || sawRoute;
    // Admin: a stored session is not enough — only the console counts.
    ok = role === 'admin' ? sawRoute : sawSession || sawRoute;
    if (!ok) await page.waitForTimeout(500);
  }

  if (!ok) {
    const seen = await page.evaluate(() => location.pathname + location.search).catch(() => 'unknown');
    await context.close();
    throw new Error(role === 'admin'
      ? `${role}: the admin console never rendered after 60s (url=${seen}) — check that the account has is_admin=true (create-test-accounts.mjs verifies it) and that /admin is not showing the login screen`
      : `${role}: no authenticated session after 60s (url=${seen}) — check credentials/test-account state`);
  }

  // A session is enough for the audit (it navigates to every route itself), but
  // log the slow case so a stalling redirect is still visible in CI.
  if (sawSession && !sawRoute) {
    console.log(`⚠ ${role}: session was stored before ${landing} finished rendering — continuing`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${role}.json`);
  const state = await context.storageState();
  // Guard against writing an empty session: if the Supabase token never landed
  // in storage, every downstream --storage run would silently audit the
  // logged-out surface instead of failing loudly here.
  const hasToken = state.origins.some((o) =>
    o.localStorage.some((e) => e.name.includes('auth-token') && e.value.includes('access_token'))
  );
  if (!hasToken) {
    await context.close();
    throw new Error(`${role}: login looked successful but no auth token was persisted — refusing to write a useless storage state`);
  }
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  await context.close();
  console.log(`✔ ${role} session seeded → ${file}`);
  return file;
}

/**
 * Auth can fail transiently on a CI runner (cold environment, shared-IP rate
 * limiting on the auth endpoint) — one flaky attempt used to drop a role and
 * leave the authenticated half of the audit running logged-out. Retry the
 * whole flow in a fresh context before declaring the role unusable.
 */
async function loginRole(browser, role) {
  const cfg = ROLES[role];
  if (!cfg) throw new Error(`Unknown role: ${role}`);
  if (!cfg.email || !cfg.password) {
    const names = `E2E_${role.toUpperCase()}_EMAIL / E2E_${role.toUpperCase()}_PASSWORD`;
    const message = `${role}: ${names} not set`;
    if (REQUIRE_ALL) {
      // Fail-closed: the caller asked for every role explicitly, so "not set"
      // is a misconfiguration to fix, not a condition to tolerate.
      throw new Error(`${message} — --require-all was requested, refusing to skip this role`);
    }
    console.log(`⊘ ${message} — skipping (this is expected until test accounts exist)`);
    return null;
  }
  if (!SUPABASE_URL || !ANON_KEY) {
    const message = `${role}: SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — cannot exchange credentials for a session`;
    if (REQUIRE_ALL) throw new Error(`${message} — --require-all was requested, refusing to skip this role`);
    console.log(`⊘ ${message} — skipping`);
    return null;
  }

  const ATTEMPTS = Number(process.env.E2E_LOGIN_ATTEMPTS || 3);
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await attemptLogin(browser, role);
    } catch (err) {
      lastError = err;
      console.error(`↻ ${role}: attempt ${attempt}/${ATTEMPTS} failed — ${err.message}`);
      if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 10000));
    }
  }
  throw lastError;
}

async function main() {
  const exec = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!exec) throw new Error('No Chrome binary found');
  const browser = await chromium.launch({
    executablePath: exec,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const wanted = Object.keys(ROLES).filter((r) => args[r] || args.role === r || args.all === 'true');
  const written = [];
  for (const role of wanted) {
    try {
      const file = await loginRole(browser, role);
      if (file) written.push(file);
    } catch (err) {
      console.error(`✖ ${role}: ${err.message}`);
      process.exitCode = 1;
    }
  }
  await browser.close();
  console.log(written.length ? `\nstorage states: ${written.join(', ')}` : '\nno storage states written (set the E2E_*_EMAIL/_PASSWORD env vars first)');

  // Strict mode: the authenticated audit consumes exactly one storage state per
  // role. If any is missing the audit would silently render logged-out pages and
  // still report green, so refuse to hand over a partial set.
  if (REQUIRE_ALL) {
    if (wanted.length === 0) {
      console.error('::error::--require-all was set but no role was requested (expected --all).');
      process.exitCode = 1;
      return;
    }
    const missing = wanted.filter((r) => !written.some((f) => path.basename(f, '.json') === r));
    if (missing.length) {
      console.error(
        `::error::--require-all could not log in: ${missing.join(', ')}. Storage states written: ${written.length}/${wanted.length}. The authenticated audit would otherwise run logged out and report a false green.`
      );
      process.exitCode = 1;
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
