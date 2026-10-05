// Growlancer logout + session-clearance E2E (Section-2 "Logout" checklist).
//
//   node scripts/e2e/logout-flow.mjs --base=http://127.0.0.1:4174 --role=freelancer
//
// Requires E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD env vars (see login.mjs),
// plus SUPABASE_URL (or VITE_SUPABASE_URL) and VITE_SUPABASE_ANON_KEY to
// exchange them for a session.
// Verifies:
//   1. a real session reaches the dashboard
//   2. logout click clears the session and lands on home/login
//   3. BROWSER BACK after logout does NOT resurrect the protected page
//      (no stale dashboard content renders; app shows logged-out surface)
//   4. direct URL re-entry to a protected route is blocked again
//
// Exits non-zero on any failure; writes an artifact MD.

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
const ROLE = args.role || 'freelancer';
const OUT_DIR = path.resolve('tests/e2e-artifacts');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

// What a logged-OUT visitor sees on the protected route. Freelancer/client
// fall back to the site-wide login modal ("Welcome back"); /admin has its own
// in-app gate ("Restricted Access — Authorized Personnel Only"). Either one
// means "not signed in" and is what we assert after logout.
const LOGGED_OUT_GUARD = /welcome back|restricted access|authorized personnel|log ?in|sign ?in/i;

const CFG = {
  freelancer: { email: process.env.E2E_FREELANCER_EMAIL, password: process.env.E2E_FREELANCER_PASSWORD, dash: '/dashboard' },
  client: { email: process.env.E2E_CLIENT_EMAIL, password: process.env.E2E_CLIENT_PASSWORD, dash: '/client' },
  admin: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD, dash: '/admin' },
}[ROLE];
if (!CFG) throw new Error(`Unknown role: ${ROLE}`);
if (!CFG.email || !CFG.password) {
  // FAIL CLOSED (the same rule login.mjs enforces with --require-all): a
  // logout-security pass that skips with exit 0 is indistinguishable from one
  // that passed, so it is worse than a red run. CI asserts these secrets in its
  // guard step before this script is reached, which means landing here is a
  // broken harness, not a missing product feature — and that must be loud.
  console.error(
    `::error::E2E_${ROLE.toUpperCase()}_EMAIL/_PASSWORD not set — the logout-security pass DID NOT RUN for ${ROLE}. ` +
      `Refusing to exit 0: a skipped guardrail is not a passing one.`,
  );
  process.exit(1);
}

/** supabase-js v2's default storage key for the configured project. */
function storageKeyFor(url) {
  return `sb-${new URL(url).host.split('.')[0]}-auth-token`;
}

/**
 * Exchange the test account's credentials for a real session. The product's
 * sign-in is GitHub/LinkedIn only — there is no form to fill — so the harness
 * performs the same credential exchange the app used to do and seeds the
 * result, which is exactly what supabase-js persists after a sign-in.
 */
async function fetchSession() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CFG.email, password: CFG.password }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body — the status below is the fallback */
  }
  if (!res.ok || !body?.access_token) {
    const detail =
      [body?.error_code || body?.error, body?.msg || body?.error_description]
        .filter(Boolean)
        .join(' — ') || `HTTP ${res.status}`;
    throw new Error(`${ROLE}: auth endpoint rejected the sign-in (${detail})`);
  }
  return body;
}

const results = [];
function record(step, pass, detail) {
  results.push({ step, pass, detail });
  console.log(`  ${pass ? '✓' : '✖'} ${step}${detail ? ` — ${detail}` : ''}`);
}

// Dismiss the cookie-consent banner if it is up. Called twice on purpose: on
// the first load it can be covered by the login modal's backdrop (the click is
// swallowed), so it is retried once the dashboard has painted.
async function dismissConsentBanner(page) {
  for (const name of [/accept all/i, /reject all/i]) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
      const clicked = await btn
        .click({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (clicked) {
        await page.waitForTimeout(300);
        return true;
      }
    }
  }
  return false;
}

async function main() {
  const exec = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!exec) throw new Error('No Chrome binary found');
  const browser = await chromium.launch({
    executablePath: exec,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  // 1. Establish a real session and land on the role's dashboard.
  const session = await fetchSession();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* storage unavailable — the checks below will fail loudly */
      }
    },
    [storageKeyFor(SUPABASE_URL), JSON.stringify(session)]
  );
  const page = await context.newPage();

  await page.goto(`${BASE}${CFG.dash}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await dismissConsentBanner(page);

  await page.waitForURL((u) => u.pathname.startsWith(CFG.dash), { timeout: 30000 })
    .then(() => record('session reaches dashboard', true, page.url()))
    .catch(async () => record('session reaches dashboard', false, `still at ${page.url()}`));

  if (!results[0].pass) {
    await browser.close();
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const f = path.join(OUT_DIR, `logout-flow-${ROLE}-FAIL.md`);
    fs.writeFileSync(f, `# Logout flow (${ROLE}) — FAILED at login step\n\nCredentials may be wrong or the test account is unverified.\n`);
    console.error(`artifact: ${f}`);
    process.exit(1);
  }

  // 2. Find and click logout (sidebar footer / account menu).
  // The consent banner is a fixed `z-50 bottom-0` bar that sits ON TOP of the
  // dashboard sidebar's bottom controls (Homepage / Logout), so it must be
  // dismissed before the click can land. That overlap is logged as a Low UI
  // observation in docs/UI-ELEMENT-AUDIT-REPORT.md §8 — the banner itself is
  // covered by the element audit and the dedicated spot-checks.
  await dismissConsentBanner(page);
  const logoutBtn = page.getByRole('button', { name: /log ?out/i }).first();
  const logoutVisible = await logoutBtn.isVisible().catch(() => false);
  if (logoutVisible) {
    await logoutBtn.scrollIntoViewIfNeeded().catch(() => {});
    await logoutBtn.click({ timeout: 15000 });
  } else {
    // Open the account/avatar menu first, then click Logout inside it.
    const avatar = page.locator('button:has(img), [aria-label*="menu" i], [aria-label*="account" i]').last();
    await avatar.click().catch(() => {});
    await page.getByRole('button', { name: /log ?out/i }).first().click();
  }

  // 3. Session cleared + a logged-out surface is shown. Depending on the role
  //    that is either a navigation away (/ or /login) or the route's own gate
  //    rendering in place (/admin keeps the URL) — poll, don't assume.
  //    ⚠️ A FAILED read (evaluate throws while the logout navigation is
  //    starting) is NOT evidence of logout — treating path:'' as logged-out
  //    made the poll exit before signOut finished, and every later step then
  //    raced the in-flight navigation (measured 2026-09-30: with a seeded
  //    session the click-to-navigate gap is milliseconds, so this fired on
  //    almost every run). Only a DEFINITIVE signal counts: a real navigation
  //    away from the dashboard, or the logged-out gate rendered on it.
  let landedLoggedOut = false;
  let landedWhere = '';
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !landedLoggedOut) {
    const s = await page
      .evaluate(() => ({ path: location.pathname, text: (document.body.innerText || '').slice(0, 800) }))
      .then((r) => r)
      .catch(() => null); // navigation in flight — keep polling, never conclude
    if (s) {
      landedWhere = `${s.path}`;
      const navigatedAway = s.path !== '' && !s.path.startsWith(CFG.dash);
      const gateOnDash = s.path.startsWith(CFG.dash) && LOGGED_OUT_GUARD.test(s.text);
      landedLoggedOut = navigatedAway || gateOnDash;
    }
    if (!landedLoggedOut) await page.waitForTimeout(500);
  }
  // The logout navigation (window.location.href = '/') may still be settling;
  // wait for the next document before reading storage, or the check reads the
  // pre-logout document and reports a session that is already being cleared.
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  record('logout lands on a logged-out surface', landedLoggedOut, landedWhere || page.url());

  // The contract is "no stored session remains" — assert that no auth-token key
  // still holds an access token. Key NAMES are reported for debugging; the
  // values are never printed (they contain the JWT).
  // Poll, don't sample once: the storage write races the logout navigation, and
  // a single read mid-navigation sees the PRE-logout document (measured
  // 2026-09-30 — the standalone probe showed storage is actually EMPTY after
  // logout; the failure was reading too early). The check is satisfied the
  // moment a read shows no live session, and the loop only exits early on that
  // positive proof — never on a read error.
  let liveSessions = [{ key: 'unread', hasAccessToken: true }];
  const storageDeadline = Date.now() + 15000;
  while (Date.now() < storageDeadline) {
    liveSessions = await page
      .evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.includes('auth-token'))
          .map((k) => {
            const raw = localStorage.getItem(k);
            let hasAccessToken = false;
            try {
              const parsed = JSON.parse(raw);
              hasAccessToken = Boolean(parsed && (parsed.access_token || parsed.currentSession));
            } catch {
              hasAccessToken = Boolean(raw && raw.length > 40);
            }
            return { key: k, hasAccessToken };
          })
      )
      .catch(() => [{ key: 'unread', hasAccessToken: true }]);
    if (liveSessions.length === 0) break;
    await page.waitForTimeout(500);
  }
  record(
    'no stored session survives logout',
    liveSessions.length === 0,
    liveSessions.length === 0
      ? 'auth-token keys hold no session'
      : `keys still holding a session: ${liveSessions.map((l) => l.key).join(', ')}`
  );

  // 4. Browser BACK must not resurrect the dashboard.
  await page.goBack().catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800); // allow any redirect/ProtectedRoute to run

  const afterBack = await page.evaluate(() => ({
    path: location.pathname,
    text: (document.body.innerText || '').slice(0, 400),
  }));
  const guardShown = LOGGED_OUT_GUARD.test(afterBack.text);
  const protectedResurrected = afterBack.path.startsWith(CFG.dash) && !guardShown;
  record('browser-back after logout does NOT render protected content', !protectedResurrected, `path=${afterBack.path} guardShown=${guardShown}`);

  // 5. Direct URL re-entry is blocked again. The block lands through
  //    ProtectedRoute after auth init resolves (up to ~5s on a cold start),
  //    so poll for the definitive signal instead of a fixed sleep.
  await page.goto(`${BASE}${CFG.dash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 15000 }).catch(() => {});
  let reentryBlocked = false;
  let reentryState = '';
  // A cold load on a congested runner can sit on the boot overlay (SPA fallback
  // serves homepage HTML, then #root is cleared until React mounts) far longer
  // than the guard needs to paint once it actually boots. Un-booted or empty
  // time must not eat the guard window — extend it (bounded) instead of
  // failing on a page that never got its chance to render. Real failures
  // (dashboard text visible without the guard) never extend anything.
  const REENTRY_HARD_CAP = Date.now() + 60000;
  let reentryDeadline = Math.min(Date.now() + 15000, REENTRY_HARD_CAP);
  while (Date.now() < reentryDeadline && !reentryBlocked) {
    const s = await page
      .evaluate(() => ({
        path: location.pathname,
        text: (document.body.innerText || '').slice(0, 600),
        booting: !!document.getElementById('boot-overlay'),
      }))
      .catch(() => null);
    if (s) {
      const bodySnippet = s.text ? s.text.replace(/\s+/g, ' ').slice(0, 120) : 'empty';
      reentryState = `path=${s.path} boot=${s.booting ? 'visible' : 'gone'} body="${bodySnippet}"`;
      reentryBlocked = LOGGED_OUT_GUARD.test(s.text) || (s.path !== '' && !s.path.startsWith(CFG.dash));
      if (!reentryBlocked && (s.booting || !s.text)) {
        reentryDeadline = Math.min(Date.now() + 15000, REENTRY_HARD_CAP);
      }
    }
    if (!reentryBlocked) await page.waitForTimeout(500);
  }
  record('direct protected-URL re-entry blocked after logout', reentryBlocked, reentryState || 'unreadable');

  await browser.close();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const f = path.join(OUT_DIR, `logout-flow-${ROLE}-${stamp}.md`);
  const passed = results.filter((r) => r.pass).length;
  fs.writeFileSync(f, `# Logout flow E2E — ${ROLE}\n\n${passed}/${results.length} checks passed\n\n${results.map((r) => `- ${r.pass ? '✓' : '✖'} ${r.step}${r.detail ? ` — ${r.detail}` : ''}`).join('\n')}\n`);
  console.log(`\n${passed}/${results.length} checks passed — artifact: ${f}`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
