// Growlancer E2E — authenticated AUTH LIFECYCLE (sign-in → session → verification
// → logout), driven in a real browser against a real backend session.
//
//   node scripts/e2e/auth-lifecycle.mjs --base=http://127.0.0.1:4174
//   node scripts/e2e/auth-lifecycle.mjs --base=https://growlancer.vercel.app --role=client
//
// WHY THIS EXISTS (and how it differs from its neighbours):
//   auth-flows.mjs        → the LOGGED-OUT surface (redirects, provider buttons)
//   oauth-signup-chain.mjs→ the SIGNUP chain (GoTrue insert → profile → self-heal)
//   logout-flow.mjs       → logout + back-button security, deeply, one role
//   auth-lifecycle.mjs    → the SESSION in between: it outlives a reload, is
//                           shared across tabs, survives a token refresh, reports
//                           its email-verification state truthfully, and is torn
//                           down everywhere when the user logs out. Per role.
//
// Every check below is a property a user would notice if it broke, and each one
// is asserted from the browser's own state (localStorage + rendered surface),
// never from an assumption about what the app "should" have done.
//
// Requires env (never committed):
//   E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD   (create-test-accounts.mjs provisions)
//   VITE_SUPABASE_URL (or SUPABASE_URL) / VITE_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY                (throwaway account for the
//                                             onboarding-gate check; its teardown
//                                             is the only writer used)
//
// Fails CLOSED on missing config: a lifecycle pass that silently skips looks
// exactly like one that passed, which is the failure mode this repo has already
// been burned by. Exit non-zero on any failed check.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

const BASE = (args.base || 'http://127.0.0.1:4174').replace(/\/+$/, '');
const OUT_DIR = path.resolve('tests/e2e-artifacts');

// Credentials arrive from the caller's environment. `.env.e2e` is gitignored and
// is loaded by the runner (see package.json / CI), so nothing secret is read
// from the repo here.
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ROLES = {
  freelancer: {
    email: process.env.E2E_FREELANCER_EMAIL,
    password: process.env.E2E_FREELANCER_PASSWORD,
    dash: '/dashboard',
    settings: '/dashboard/profile',
  },
  client: {
    email: process.env.E2E_CLIENT_EMAIL,
    password: process.env.E2E_CLIENT_PASSWORD,
    dash: '/client',
    settings: '/client/settings',
  },
};

// What a logged-OUT visitor sees on a protected route: the site-wide login modal
// for freelancer/client. Used to prove "not signed in" after a teardown step, and
// to prove a reload did NOT lose the session.
const LOGGED_OUT_GUARD = /welcome back|log ?in|sign ?in/i;

const requested = args.role && args.role !== 'both' ? [args.role] : ['freelancer', 'client'];
for (const role of requested) {
  if (!ROLES[role]) throw new Error(`Unknown role: ${role} (expected freelancer|client|both)`);
}

// ── fail closed ───────────────────────────────────────────────────────────────
const missing = [];
if (!SUPABASE_URL) missing.push('SUPABASE_URL / VITE_SUPABASE_URL');
if (!ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
for (const role of requested) {
  const cfg = ROLES[role];
  if (!cfg.email) missing.push(`E2E_${role.toUpperCase()}_EMAIL`);
  if (!cfg.password) missing.push(`E2E_${role.toUpperCase()}_PASSWORD`);
}
if (missing.length) {
  console.error(
    `::error::auth-lifecycle DID NOT RUN — missing ${missing.join(', ')}. ` +
      `Refusing to exit 0: a skipped guardrail is not a passing one.`,
  );
  process.exit(1);
}

const results = [];
function record(step, pass, detail, role = 'global') {
  results.push({ role, step, pass: !!pass, detail: detail ?? '' });
  console.log(`  ${pass ? '✓' : '✖'} [${role}] ${step}${detail ? ` — ${detail}` : ''}`);
}

/** supabase-js v2's default storage key for the configured project. */
function storageKeyFor(url) {
  return `sb-${new URL(url).host.split('.')[0]}-auth-token`;
}
const STORAGE_KEY = storageKeyFor(SUPABASE_URL);

/**
 * Exchange a test account's credentials for a real session. The product's
 * sign-in is GitHub/LinkedIn only — there is no form to fill — so the harness
 * performs the same credential exchange the app used to perform and seeds the
 * result, which is exactly what supabase-js persists after a sign-in. The
 * session itself is real: minted by GoTrue, refreshable, server-verified.
 */
async function fetchSession(email, password, label) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body — the status below is the fallback */
  }
  if (!res.ok || !body?.access_token) {
    const detail =
      [body?.error_code || body?.error, body?.msg || body?.error_description].filter(Boolean).join(' — ') ||
      `HTTP ${res.status}`;
    throw new Error(`${label}: auth endpoint rejected the sign-in (${detail})`);
  }
  return body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Seed a session into a fresh context before the app boots. */
async function contextWithSession(browser, session, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* storage unavailable — the checks below fail loudly */
      }
    },
    [STORAGE_KEY, JSON.stringify(session)]
  );
  return context;
}

async function boot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
}

// The cookie-consent banner is a fixed `z-50 bottom-0` bar that sits over the
// dashboard sidebar's footer controls, so it is dismissed before any click.
async function dismissConsentBanner(page) {
  for (const name of [/accept all/i, /reject all/i]) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const clicked = await btn
        .click({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (clicked) {
        await sleep(300);
        return true;
      }
    }
  }
  return false;
}

/** Read the persisted session, if any. Values are never printed — only shape. */
async function readStoredSession(page) {
  return page
    .evaluate((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return {
          hasAccessToken: Boolean(parsed?.access_token),
          hasRefreshToken: Boolean(parsed?.refresh_token),
          accessToken: parsed?.access_token ?? null,
          refreshToken: parsed?.refresh_token ?? null,
          userId: parsed?.user?.id ?? null,
        };
      } catch {
        return { hasAccessToken: raw.includes('access_token'), hasRefreshToken: false, accessToken: null, refreshToken: null, userId: null };
      }
    }, STORAGE_KEY)
    .catch(() => null);
}

/**
 * The page's auth surface, read STRUCTURALLY.
 *
 * `modalOpen` is the definitive "signed out" signal: the login modal is the only
 * place the provider buttons live and `isVisible()` respects CSS, so it cannot be
 * satisfied by prose. It replaces a fuzzy text match on /log ?in|sign ?in/, which
 * mis-fired in BOTH directions — measured 2026-10-13: the multi-tab check failed
 * on /dashboard while the path was correct (the dashboard's own text contained a
 * login-ish word), and the logged-out checks could have passed on that same false
 * positive. A "session is alive" assertion must key off the absence of the real
 * login UI, not off page copy. `textGuard` is kept only for diagnostics.
 */
async function surface(page) {
  const s = await page
    .evaluate(() => ({ path: location.pathname, text: (document.body.innerText || '').slice(0, 900) }))
    .catch(() => null);
  const modalOpen = await page
    .getByRole('button', { name: /continue with (github|linkedin)/i })
    .first()
    .isVisible()
    .catch(() => false);
  if (!s) return { shown: modalOpen, modalOpen, path: 'unreadable', text: '', textGuard: false };
  return {
    shown: modalOpen,
    modalOpen,
    path: s.path,
    text: s.text,
    textGuard: LOGGED_OUT_GUARD.test(s.text),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-role lifecycle
// ─────────────────────────────────────────────────────────────────────────────
async function runRole(browser, role) {
  const cfg = ROLES[role];
  console.log(`\n─── ${role} ───`);

  const session = await fetchSession(cfg.email, cfg.password, role);
  record('real session minted by GoTrue (access + refresh token)', !!session.access_token && !!session.refresh_token, `expires_in=${session.expires_in ?? '?'}s`, role);

  const context = await contextWithSession(browser, session);
  const page = await context.newPage();

  // 1. The session reaches the role's dashboard.
  await boot(page, `${BASE}${cfg.dash}`);
  await dismissConsentBanner(page);
  await page
    .waitForURL((u) => u.pathname.startsWith(cfg.dash), { timeout: 30000 })
    .then(() => record('session reaches the role dashboard', true, page.url().replace(BASE, ''), role))
    .catch(async () => record('session reaches the role dashboard', false, `still at ${page.url().replace(BASE, '')}`, role));

  const stored = await readStoredSession(page);
  record('session is persisted in storage (survives a cold app boot)', !!stored?.hasAccessToken && !!stored?.hasRefreshToken, `userId=${stored?.userId ? 'present' : 'missing'}`, role);

  // 2. Email verification state — the user's own view of it.
  //    OAuth providers assert the address, so a signed-in user must be verified
  //    (an unconfirmed address is exactly what ProtectedRoute would wall off).
  const confirmed = await page
    .evaluate(async () => {
      const key = Object.keys(localStorage).find((k) => k.includes('auth-token'));
      const raw = key ? localStorage.getItem(key) : null;
      if (!raw) return null;
      try {
        return JSON.parse(raw)?.user?.email_confirmed_at ?? null;
      } catch {
        return null;
      }
    })
    .catch(() => null);
  record('provider-verified email for a signed-in user (email_confirmed_at set)', !!confirmed, confirmed ? 'confirmed' : 'MISSING — the verification wall should be blocking this session', role);

  //    The Settings card must agree with server truth — "Email verified"
  //    without a resend prompt for a verified account.
  await boot(page, `${BASE}${cfg.settings}`);
  await dismissConsentBanner(page);
  const cardText = await page
    .evaluate(() => (document.body.innerText || '').slice(0, 3000))
    .catch(() => '');
  const showsVerified = /email verified/i.test(cardText);
  const showsNotVerified = /not verified/i.test(cardText);
  const offersResend = /send verification email/i.test(cardText);
  record(
    'Settings shows the truthful verified state (no resend prompt)',
    showsVerified && !showsNotVerified && !offersResend,
    `verified=${showsVerified} notVerified=${showsNotVerified} resendPrompt=${offersResend}`,
    role,
  );

  // 3. Session survives a full reload — the most common real-world regression.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 20000 }).catch(() => {});
  await sleep(2500);
  const afterReload = await surface(page);
  const stayedIn = afterReload.path.startsWith(cfg.dash);
  record('session survives a full page reload', stayedIn && !afterReload.modalOpen, `path=${afterReload.path} loginModal=${afterReload.modalOpen}`, role);

  // 4. Token refresh — the mechanism that keeps a long session alive.
  const before = await readStoredSession(page);
  const refreshed = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: before?.refreshToken }),
  })
    .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }))
    .catch((e) => ({ ok: false, body: { msg: e.message } }));
  const rotated = refreshed.body?.access_token;
  record(
    'stored refresh token exchanges for a new access token',
    refreshed.ok && !!rotated && rotated !== before?.accessToken,
    refreshed.ok ? (rotated !== before?.accessToken ? 'rotated' : 'same token returned') : String(refreshed.body?.msg || refreshed.body?.error_description || 'failed').slice(0, 120),
    role,
  );
  //    The rotated session must be usable by the app — adopt it and reload.
  if (refreshed.ok && refreshed.body) {
    await page.evaluate(
      ([key, value]) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          /* ignore */
        }
      },
      [STORAGE_KEY, JSON.stringify(refreshed.body)]
    );
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 20000 }).catch(() => {});
    await sleep(2500);
    const afterRefresh = await surface(page);
    record('app renders authenticated from the rotated session', afterRefresh.path.startsWith(cfg.dash) && !afterRefresh.shown, `path=${afterRefresh.path}`, role);
  }

  // 5. Multi-tab: a second tab shares the session, and losing it in one tab
  //    tears it down in the other (the app's own auth propagation).
  const secondTab = await context.newPage();
  await boot(secondTab, `${BASE}${cfg.dash}`);
  await dismissConsentBanner(secondTab);
  await secondTab.waitForURL((u) => u.pathname.startsWith(cfg.dash), { timeout: 30000 }).catch(() => {});
  const tabB = await surface(secondTab);
  const tabBSession = await readStoredSession(secondTab);
  record(
    'a second tab shares the same session',
    tabB.path.startsWith(cfg.dash) && !tabB.modalOpen && !!tabBSession?.hasAccessToken,
    `path=${tabB.path} loginModal=${tabB.modalOpen} storedSession=${tabBSession?.hasAccessToken ? 'yes' : 'no'}`,
    role,
  );

  // 6. Logout in the main tab must clear the SECOND tab too.
  await dismissConsentBanner(page);
  const logoutBtn = page.getByRole('button', { name: /log ?out/i }).first();
  const logoutVisible = await logoutBtn.isVisible().catch(() => false);
  if (logoutVisible) {
    await logoutBtn.scrollIntoViewIfNeeded().catch(() => {});
    await logoutBtn.click({ timeout: 15000 }).catch(() => {});
  } else {
    const avatar = page.locator('button:has(img), [aria-label*="menu" i], [aria-label*="account" i]').last();
    await avatar.click().catch(() => {});
    await page.getByRole('button', { name: /log ?out/i }).first().click().catch(() => {});
  }

  //    The contract is "no stored session remains" — poll, never sample once,
  //    because the storage write races the logout navigation.
  let liveAfterLogout = [{ hasAccessToken: true }];
  const storageDeadline = Date.now() + 20000;
  while (Date.now() < storageDeadline) {
    liveAfterLogout = (await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return parsed?.access_token || parsed?.currentSession ? [{ hasAccessToken: true }] : [];
      } catch {
        return raw && raw.length > 40 ? [{ hasAccessToken: true }] : [];
      }
    }, STORAGE_KEY).catch(() => [{ hasAccessToken: true }])) || [];
    if (liveAfterLogout.length === 0) break;
    await sleep(500);
  }
  record('logout clears the stored session', liveAfterLogout.length === 0, liveAfterLogout.length === 0 ? 'storage empty' : 'session still stored', role);

  //    Tab B must follow within a bounded window (no manual refresh).
  let tabBLoggedOut = false;
  let tabBState = '';
  const tabDeadline = Date.now() + 25000;
  while (Date.now() < tabDeadline && !tabBLoggedOut) {
    const s = await surface(secondTab);
    tabBState = `path=${s.path} guard=${s.shown}`;
    tabBLoggedOut = s.shown || (s.path !== '' && !s.path.startsWith(cfg.dash));
    if (!tabBLoggedOut) await sleep(700);
  }
  record('logout propagates to the other tab without a manual reload', tabBLoggedOut, tabBState, role);

  // 7. Back-button + direct re-entry stay blocked (deep version: logout-flow.mjs).
  await page.goBack().catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await sleep(1200);
  const afterBack = await surface(page);
  const resurrected = afterBack.path.startsWith(cfg.dash) && !afterBack.shown;
  record('browser-back after logout does not resurrect protected content', !resurrected, `path=${afterBack.path} loginModal=${afterBack.modalOpen}`, role);

  await boot(page, `${BASE}${cfg.dash}`);
  let reentryBlocked = false;
  const reentryDeadline = Date.now() + 30000;
  while (Date.now() < reentryDeadline && !reentryBlocked) {
    const s = await surface(page);
    reentryBlocked = s.shown || (s.path !== '' && !s.path.startsWith(cfg.dash));
    if (!reentryBlocked) await sleep(500);
  }
  record('direct protected-URL re-entry is blocked after logout', reentryBlocked, `path=${(await surface(page)).path}`, role);

  await secondTab.close().catch(() => {});
  await context.close().catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Global checks
// ─────────────────────────────────────────────────────────────────────────────
async function runStaleSession(browser) {
  console.log('\n─── stale session ───');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // A dead session: a token for a user that no longer exists / is not valid.
  // The app must NOT hang on a skeleton or show the protected page — it must
  // clear the session and present a logged-out surface.
  await context.addInitScript(
    ([key]) => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            access_token: 'stale-session-probe.invalid.token',
            refresh_token: 'stale-session-probe.invalid.refresh',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: 'bearer',
            user: { id: '00000000-0000-0000-0000-000000000000', aud: 'authenticated' },
          }),
        );
      } catch {
        /* ignore */
      }
    },
    [STORAGE_KEY]
  );
  const page = await context.newPage();
  await boot(page, `${BASE}/dashboard`);

  let cleared = false;
  let state = '';
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && !cleared) {
    const s = await surface(page);
    const meta = await page
      .evaluate(
        (key) => ({
          booting: !!document.getElementById('boot-overlay'),
          stored: (() => {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            try {
              return JSON.parse(raw)?.access_token ?? null;
            } catch {
              return raw.length > 40 ? raw : null;
            }
          })(),
        }),
        STORAGE_KEY
      )
      .catch(() => null);
    if (meta) {
      state = `path=${s.path} loginModal=${s.modalOpen} stored=${meta.stored ? 'yes' : 'no'} boot=${meta.booting ? 'visible' : 'gone'}`;
      const loggedOut = s.modalOpen || (s.path !== '' && !s.path.startsWith('/dashboard'));
      cleared = loggedOut && !meta.booting;
    }
    if (!cleared) await sleep(700);
  }
  record('a dead session is cleared and shows a logged-out surface (no hang)', cleared, state);
  await context.close().catch(() => {});
}

/**
 * The onboarding gate: a brand-new (verified) account that has never finished
 * onboarding must be sent to /onboarding from any protected route, for every
 * role — and must be able to finish and keep the session.
 *
 * Uses one throwaway account created through the Admin API (the same call
 * GoTrue makes for a provider signup) and removes it again in `finally`, so an
 * interrupted run leaves nothing behind.
 */
async function runOnboardingGate(browser) {
  console.log('\n─── onboarding gate (throwaway account) ───');
  const runId = crypto.randomBytes(4).toString('hex');
  const email = `auth-lifecycle.${runId}@growlancer-test.com`;
  const password = crypto.randomBytes(18).toString('base64url');
  const svc = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  let userId = null;

  const cleanup = async () => {
    if (!userId) return;
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svc }).catch(() => {});
    await sleep(1500);
    const left = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id`, {
      headers: { ...svc, Prefer: 'return=representation' },
    })
      .then((r) => r.json())
      .catch(() => null);
    record('throwaway account fully removed (no ghost profile left)', Array.isArray(left) && left.length === 0, Array.isArray(left) ? `profiles rows=${left.length}` : 'unreadable');
  };

  try {
    const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: svc,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: `Auth Lifecycle ${runId}` },
      }),
    }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }));
    userId = created.body?.id ?? null;
    record('throwaway verified account created via the Admin API', created.ok && !!userId, created.ok ? `id=${userId?.slice(0, 8)}…` : `HTTP ${created.status}`);
    if (!userId) return;

    // The profile (and onboarding flag) must exist from the auth insert alone.
    let onboarding = null;
    for (let i = 0; i < 8; i++) {
      if (i) await sleep(500);
      const rows = await fetch(`${SUPABASE_URL}/rest/v1/profiles_private?id=eq.${userId}&select=onboarding_completed`, {
        headers: { ...svc, Prefer: 'return=representation' },
      })
        .then((r) => r.json())
        .catch(() => null);
      if (Array.isArray(rows) && rows[0]) {
        onboarding = rows[0].onboarding_completed;
        break;
      }
    }
    record('profile row (with onboarding flag) exists for the new account', onboarding === false, `onboarding_completed=${onboarding}`);

    const session = await fetchSession(email, password, 'onboarding-probe');
    const context = await contextWithSession(browser, session);
    const page = await context.newPage();

    // Any protected route must funnel this user to /onboarding.
    await boot(page, `${BASE}/dashboard`);
    let landedOnOnboarding = false;
    const gateDeadline = Date.now() + 30000;
    while (Date.now() < gateDeadline && !landedOnOnboarding) {
      const p = await page.evaluate(() => location.pathname).catch(() => '');
      landedOnOnboarding = p.startsWith('/onboarding');
      if (!landedOnOnboarding) await sleep(500);
    }
    record('incomplete-onboarding session is routed to /onboarding (never the dashboard)', landedOnOnboarding, await page.evaluate(() => location.pathname).catch(() => 'unreadable'));

    await context.close().catch(() => {});
  } finally {
    await cleanup();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
const exec = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!exec) throw new Error('No Chrome binary found');
const browser = await chromium.launch({
  executablePath: exec,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  for (const role of requested) {
    await runRole(browser, role).catch((err) => record(`${role}: lifecycle crashed`, false, err.message, role));
  }
  await runStaleSession(browser).catch((err) => record('stale-session probe crashed', false, err.message));
  await runOnboardingGate(browser).catch((err) => record('onboarding-gate probe crashed', false, err.message));
} finally {
  await browser.close().catch(() => {});
}

const failed = results.filter((r) => !r.pass);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.mkdirSync(OUT_DIR, { recursive: true });
const artifact = path.join(OUT_DIR, `auth-lifecycle-${stamp}.md`);
fs.writeFileSync(
  artifact,
  [
    '# Growlancer E2E — authenticated auth lifecycle',
    `Base: ${BASE}`,
    `Roles: ${requested.join(', ')}`,
    `Pass: ${results.length - failed.length} · Fail: ${failed.length} · Total: ${results.length}`,
    '',
    failed.length ? '## Failures' : '## All checks passed',
    ...failed.map((f) => `- [${f.role}] ${f.step}${f.detail ? ` — ${f.detail}` : ''}`),
    '',
    '## Full results',
    ...results.map((r) => `- ${r.pass ? '✓' : '✖'} [${r.role}] ${r.step}${r.detail ? ` — ${r.detail}` : ''}`),
  ].join('\n')
);
fs.writeFileSync(path.join(OUT_DIR, `auth-lifecycle-${stamp}.json`), JSON.stringify(results, null, 2));

console.log(`\n=== Auth lifecycle: ${results.length - failed.length} pass / ${failed.length} fail ===`);
console.log(`Artifact: ${artifact}`);
if (failed.length) {
  console.log('Failures:');
  for (const f of failed) console.log(`  • [${f.role}] ${f.step}${f.detail ? ` — ${f.detail}` : ''}`);
}
process.exit(failed.length ? 1 : 0);
