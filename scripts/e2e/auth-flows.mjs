// Growlancer E2E — unauthenticated auth flows
// ─────────────────────────────────────────────────────────────────────────────
// Tests (no account needed, safe against the real backend):
//   1. Protected routes redirect unauthenticated users to /?modal=login
//   2. Login modal: GitHub + LinkedIn present, enabled, and NO password form
//   3. Signup modal: role choice + providers; no email/password form;
//      provider click without a role is refused inline
//   4. Remaining auth pages + removed-route deep links degrade gracefully
//   5. Every auth page loads with zero console/page errors on mobile + desktop
//
// Usage:
//   node scripts/e2e/auth-flows.mjs --base=http://localhost:4173
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.join('=') || 'true'];
  })
);
const BASE = args.base || 'http://localhost:5173';
const OUT_DIR = path.resolve('tests/e2e-artifacts');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CANDIDATES = [
  process.env.E2E_CHROME_PATH,
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const exec = CANDIDATES.find((p) => fs.existsSync(p));
if (!exec) throw new Error('No Chrome binary found');

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 740 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

const results = [];
let passCount = 0;
let failCount = 0;

function record(step, viewport, ok, detail) {
  results.push({ step, viewport, ok, detail });
  if (ok) passCount++;
  else failCount++;
  console.log(`${ok ? '✓' : '✗'} [${viewport}] ${step}${detail ? ` — ${detail}` : ''}`);
}

async function withPage(vp, fn) {
  const browser = await chromium.launch({ executablePath: exec, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.width < 700,
    hasTouch: vp.width < 700,
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const auth400 = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
  page.on('response', (r) => {
    if (r.status() === 400 && /supabase\.co\/(auth\/v1\/token|auth\/v1\/otp)/.test(r.url())) {
      auth400.push(r.url());
    }
  });
  try {
    await fn(page);
  } finally {
    await ctx.close();
    await browser.close();
  }
  return { consoleErrors, pageErrors, auth400 };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Dismiss the cookie-consent banner if present (it's fixed-bottom z-50 and
 *  intercepts clicks on page controls until accepted/rejected). Also a real
 *  test: the banner must be dismissible. */
async function dismissCookieBanner(page) {
  const btn = page
    .locator(
      'div.fixed.bottom-0 button:has-text("Accept"), div.fixed.bottom-0 button:has-text("accept"), div.fixed.bottom-0 button:has-text("Reject"), div.fixed.bottom-0 button[aria-label*="Accept" i], div.fixed.bottom-0 button[aria-label*="close" i]'
    )
    .first();
  if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
    await btn.click({ timeout: 4000 });
    await sleep(600);
    const gone = !(await btn.isVisible().catch(() => false));
    return gone;
  }
  return 'not-present';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Protected-route redirects
// ─────────────────────────────────────────────────────────────────────────────
const PROTECTED = ['/dashboard', '/client', '/client/post', '/admin', '/client/payments'];

for (const vp of VIEWPORTS) {
  for (const route of PROTECTED) {
    const { consoleErrors, pageErrors } = await withPage(vp, async (page) => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // AuthContext init has a 5s timeout; ProtectedRoute only redirects after
      // loading resolves — wait long enough for that to complete.
      await page.waitForURL(/modal=login/, { timeout: 12000 }).catch(() => {});
      await sleep(1500);
      const url = page.url();
      if (route === '/admin') {
        // /admin is guarded server-side (profiles.role='admin') and renders the
        // dedicated AdminLoginPage — NOT the ?modal=login redirect.
        const adminLogin = await page
          .locator('input[aria-label="Admin password"], input[type="password"]')
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        record('admin route shows AdminLoginPage (stays on /admin)', vp.name, adminLogin, `url: ${url}`);
      } else {
        // MainLayout strips ?modal=login via history.replaceState immediately
        // after opening the modal, so "landed on / with the modal open" is the
        // success condition — the raw URL param check alone always loses.
        const modalNowVisible = await page
          .locator('text=Welcome back')
          .first()
          .isVisible({ timeout: 4000 })
          .catch(() => false);
        const redirected = url.includes('modal=login') || (url.replace(/\?.*$/, '') === `${BASE}/` && modalNowVisible);
        record(`redirect ${route} → login modal`, vp.name, redirected, `landed: ${url}`);
        record(`login modal shown for ${route}`, vp.name, modalNowVisible);
      }
    });
    const realErrors = consoleErrors.filter((e) => !/GoTrueClient|_useSession|__loadSession|getSession\(\)/.test(e));
    record(`no hard errors on ${route}`, vp.name, realErrors.length === 0 && pageErrors.length === 0,
      realErrors.concat(pageErrors).slice(0, 2).join(' | '));
  }
}
// ─────────────────────────────────────────────────────────────────────────────
// 2. Login modal — OAuth-only surface
// ─────────────────────────────────────────────────────────────────────────────
for (const vp of VIEWPORTS) {
  const { consoleErrors, pageErrors } = await withPage(vp, async (page) => {
    await page.goto(`${BASE}/?modal=login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(6500); // auth init timeout is 5s
    const modal = page.locator('text=Welcome back').first();
    const visible = await modal.isVisible({ timeout: 5000 }).catch(() => false);
    record('login modal opens via ?modal=login', vp.name, visible);
    if (!visible) return;

    // ⚠️ Scope ALL locators to the modal overlay — the homepage behind it
    // also has an email input (waitlist) that comes FIRST in DOM order.
    const modalScope = page.locator('div.fixed.inset-0').first();
    record('GitHub provider button present', vp.name,
      await modalScope.locator('button:has-text("Continue with GitHub")').first().isVisible({ timeout: 4000 }).catch(() => false));
    record('LinkedIn provider button present', vp.name,
      await modalScope.locator('button:has-text("Continue with LinkedIn")').first().isVisible({ timeout: 4000 }).catch(() => false));
    // The email/password form is gone BY DESIGN — assert it stays gone,
    // otherwise an accidental regression would reintroduce the phishing
    // surface the OAuth-only flow removed.
    record('no password field in the login modal', vp.name,
      !(await modalScope.locator('input[type="password"]').first().isVisible().catch(() => false)));

    // Both providers must be live and clickable (a permanently disabled
    // button would lock every user out). Clicking is deliberately avoided:
    // it would navigate away to the provider.
    for (const name of ['Continue with GitHub', 'Continue with LinkedIn']) {
      const btn = modalScope.getByRole('button', { name }).first();
      record(`${name} is enabled`, vp.name, await btn.isEnabled().catch(() => false));
    }
  });
  const realErrors = consoleErrors.filter((e) => !/GoTrueClient|_useSession|__loadSession|getSession\(\)/.test(e));
  record('no hard errors in login flow', vp.name, realErrors.length === 0 && pageErrors.length === 0,
    realErrors.concat(pageErrors).slice(0, 2).join(' | '));
}
// ─────────────────────────────────────────────────────────────────────────────
// 3. Signup modal — role choice + OAuth, no form to fill
// ─────────────────────────────────────────────────────────────────────────────
for (const vp of VIEWPORTS) {
  const { consoleErrors, pageErrors } = await withPage(vp, async (page) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(6500); // auth init timeout is 5s
    const dismissed = await dismissCookieBanner(page);
    if (dismissed === false) record('cookie banner dismissible', vp.name, false, 'banner visible but dismiss click failed');
    else record('cookie banner dismissible (or absent)', vp.name, true, dismissed === true ? 'dismissed via Accept' : 'not present');
    const signupBtn = page.locator('button:has-text("Signup"), button:has-text("Sign Up")').first();
    await signupBtn.click();
    await sleep(1500);
    const modalVisible = await page.locator('text=Create your account').first().isVisible({ timeout: 3000 }).catch(() => false);
    record('signup modal opens from header', vp.name, modalVisible);
    if (!modalVisible) return;

    const modalScope = page.locator('div.fixed.inset-0').first();
    record('role choice present (Freelance / Hire Talent)', vp.name,
      (await modalScope.locator('text=Freelance').first().isVisible().catch(() => false)) &&
      (await modalScope.locator('text=Hire Talent').first().isVisible().catch(() => false)));
    record('GitHub + LinkedIn buttons present', vp.name,
      (await modalScope.locator('button:has-text("Continue with GitHub")').first().isVisible().catch(() => false)) &&
      (await modalScope.locator('button:has-text("Continue with LinkedIn")').first().isVisible().catch(() => false)));
    // No email/password/name/phone form — the profile comes from the provider.
    record('no password field in the signup modal', vp.name,
      !(await modalScope.locator('input[type="password"]').first().isVisible().catch(() => false)));
    record('no email field in the signup modal', vp.name,
      !(await modalScope.locator('input[type="email"]').first().isVisible().catch(() => false)));

    // A provider click without a role must be refused inline — and must NOT
    // navigate away to the provider.
    await modalScope.locator('button:has-text("Continue with GitHub")').first().click();
    await sleep(800);
    const roleError = await modalScope.locator('text=/choose Freelance or Hire Talent/i').first().isVisible({ timeout: 2500 }).catch(() => false);
    record('provider click without a role is blocked', vp.name, roleError && page.url().startsWith(BASE), `url: ${page.url()}`);
  });
  const realErrors = consoleErrors.filter((e) => !/GoTrueClient|_useSession|__loadSession|getSession\(\)/.test(e));
  record('no hard errors in signup flow', vp.name, realErrors.length === 0 && pageErrors.length === 0,
    realErrors.concat(pageErrors).slice(0, 2).join(' | '));
}
// ─────────────────────────────────────────────────────────────────────────────
// 4. Remaining auth pages (email-confirm / verify-email) + removed-route degrade
// ─────────────────────────────────────────────────────────────────────────────
// The email/password pages (forgot-password / reset-password / magic-link /
// otp) were REMOVED — GitHub/LinkedIn is the only auth. Old deep links (from
// bookmarks or stale emails) must render the app gracefully, never crash.
const AUTH_PAGES = [
  '/auth/email-confirm',
  '/auth/verify-email',
  '/auth/forgot-password', // removed route — must degrade gracefully
];

for (const vp of VIEWPORTS) {
  for (const route of AUTH_PAGES) {
    const { consoleErrors, pageErrors } = await withPage(vp, async (page) => {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      const appAlive = await page.evaluate(() => !!document.querySelector('#root'));
      record(`page renders app shell: ${route}`, vp.name, appAlive);
    });
    const realErrors = consoleErrors.filter((e) => !/GoTrueClient|_useSession|__loadSession|getSession\(\)/.test(e));
    record(`auth page clean: ${route}`, vp.name, realErrors.length === 0 && pageErrors.length === 0,
      realErrors.concat(pageErrors).slice(0, 2).join(' | '));
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const failures = results.filter((r) => !r.ok);
const lines = [
  '# Growlancer E2E — auth flows',
  `Base: ${BASE}`,
  `Pass: ${passCount} · Fail: ${failCount} · Total: ${results.length}`,
  '',
  failures.length ? '## Failures' : '## All checks passed',
  ...failures.map((f) => `- [${f.viewport}] ${f.step}${f.detail ? ` — ${f.detail}` : ''}`),
  '',
  '## Full results',
  ...results.map((r) => `- ${r.ok ? '✓' : '✗'} [${r.viewport}] ${r.step}${r.detail ? ` — ${r.detail}` : ''}`),
];
fs.writeFileSync(path.join(OUT_DIR, `auth-flows-${ts}.md`), lines.join('\n'));
fs.writeFileSync(path.join(OUT_DIR, `auth-flows-${ts}.json`), JSON.stringify(results, null, 2));
console.log(`\n=== Auth flows: ${passCount} pass / ${failCount} fail ===`);
console.log(`Report: tests/e2e-artifacts/auth-flows-${ts}.md`);
process.exit(failCount > 0 ? 1 : 0);
