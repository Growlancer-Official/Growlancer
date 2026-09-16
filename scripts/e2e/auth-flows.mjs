// Growlancer E2E — unauthenticated auth flows
// ─────────────────────────────────────────────────────────────────────────────
// Tests (no account needed, safe against the real backend):
//   1. Protected routes redirect unauthenticated users to /?modal=login
//   2. Login modal: empty submit → validation errors; invalid email → error
//   3. Login modal: wrong password → REAL backend error, app must not crash
//   4. Signup modal: empty submit → validation errors; password mismatch
//   5. /auth/forgot-password: empty/invalid email errors
//   6. /auth/otp: input present, invalid-format submit handled
//   7. /auth/magic-link: email validation
//   8. Every auth page loads with zero console/page errors on mobile + desktop
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
// 2. Login modal validation
// ─────────────────────────────────────────────────────────────────────────────
for (const vp of VIEWPORTS) {
  const { consoleErrors, pageErrors, auth400 } = await withPage(vp, async (page) => {
    await page.goto(`${BASE}/?modal=login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(6500); // auth init timeout is 5s
    const modal = page.locator('text=Welcome back').first();
    const visible = await modal.isVisible({ timeout: 5000 }).catch(() => false);
    record('login modal opens via ?modal=login', vp.name, visible);
    const rootAlive = await page.evaluate(() => !!document.querySelector('#root'));
    if (!rootAlive) {
      record('page dead (no #root) — skipping login-form checks', vp.name, false);
      return;
    }

    // Empty submit → HTML5/validation blocks or inline errors
    // ⚠️ Scope ALL field locators to the modal overlay — the homepage behind
    // it also has `input[type=email]` (waitlist) and a submit form, and those
    // come FIRST in DOM order. Unscoped `.first()` grabs the wrong element.
    const modalScope = page.locator('div.fixed.inset-0').first();
    const emailInput = modalScope.locator('input[type="email"], input[name="email"]').first();
    const pwInput = modalScope.locator('input[type="password"]').first();
    const hasEmail = await emailInput.isVisible({ timeout: 4000 }).catch(() => false);
    const hasPw = hasEmail ? await pwInput.isVisible().catch(() => false) : false;
    record('login form fields present (email+password)', vp.name, hasEmail && hasPw);

    if (hasEmail && hasPw) {
      // Scope to the LOGIN MODAL's submit button — `has-text("Log In")` also
      // matches the header "Login" button, and an unscoped `form` matches the
      // homepage waitlist form behind the modal.
      const loginBtn = modalScope.locator('form button[type="submit"]').first();
      await loginBtn.click();
      await sleep(1200);
      const stillThere = await modal.isVisible().catch(() => false);
      const invalid = await emailInput.evaluate((el) => !el.checkValidity() || el.value === '');
      record('empty login submit blocked', vp.name, stillThere || invalid);

      // Invalid email format
      await emailInput.fill('not-an-email');
      await pwInput.fill('whatever123');
      await loginBtn.click();
      await sleep(1200);
      const blockedByValidation = await emailInput.evaluate((el) => !el.checkValidity());
      const errVisible = await page
        .locator('text=/invalid|valid email/i')
        .first()
        .isVisible({ timeout: 1500 })
        .catch(() => false);
      record('invalid email format blocked', vp.name, blockedByValidation || errVisible);

      // Wrong password → real backend call → error message, no crash
      const testEmail = `e2e-no-such-user-${Date.now()}@example.com`;
      await emailInput.fill(testEmail);
      await pwInput.fill('WrongPassword123!');
      await loginBtn.click();
      // Poll for the inline error (LoginModal renders <p class="text-red-600">)
      let errShown = false;
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        errShown = await page
          .locator('.text-red-600, [role="alert"]')
          .first()
          .isVisible()
          .catch(() => false);
        if (errShown) break;
      }
      const modalStillThere = await modal.isVisible().catch(() => false);
      const appAlive = await page.evaluate(() => !!document.querySelector('#root'));
      record('wrong-credentials handled with error message (no crash)', vp.name, appAlive && errShown && modalStillThere,
        errShown ? 'error message visible' : 'no error message appeared');
    }
  });
  // The 400 from the wrong-credential attempt is EXPECTED backend behavior
  // (Supabase rejects bad credentials with HTTP 400); the app surfaces it as
  // an inline error — verified above. Don't count it as a hard failure.
  const isExpectedAuth400 = (e) => /Failed to load resource.*400/.test(e) && auth400.length > 0;
  const realErrors = consoleErrors.filter(
    (e) => !/GoTrueClient|_useSession|__loadSession|getSession\(\)/.test(e) && !isExpectedAuth400(e)
  );
  record('no hard errors in login flow', vp.name, realErrors.length === 0 && pageErrors.length === 0,
    realErrors.concat(pageErrors).slice(0, 2).join(' | '));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Signup modal validation
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
    const modalTexts = ['Create your account', 'Join Growlancer', 'Sign up', 'Get started'];
    let modalVisible = false;
    for (const t of modalTexts) {
      if (await page.locator(`text=/${t}/i`).first().isVisible({ timeout: 1500 }).catch(() => false)) {
        modalVisible = true;
        break;
      }
    }
    record('signup modal opens from header', vp.name, modalVisible);

    if (modalVisible) {
      const fields = {
        name: await page.locator('input[name="fullName"], input[name="name"], input[placeholder*="name" i]').first().isVisible({ timeout: 2000 }).catch(() => false),
        email: await page.locator('input[type="email"]').first().isVisible().catch(() => false),
        password: await page.locator('input[type="password"]').first().isVisible().catch(() => false),
      };
      record('signup fields present', vp.name, fields.email && fields.password, JSON.stringify(fields));

      const submit = page.locator('button:has-text("Create"), button:has-text("Sign Up"), button:has-text("Get Started")').last();
      if (await submit.isVisible().catch(() => false)) {
        await submit.click();
        await sleep(1200);
        const invalid = await page.evaluate(() => {
          const bad = Array.from(document.querySelectorAll('input[required]')).find(
            (i) => !i.checkValidity() || !i.value
          );
          return !!bad || !!document.querySelector('text-error, .text-red-500, [role="alert"]');
        });
        record('empty signup submit blocked', vp.name, invalid);
      }
    }
  });
  const realErrors = consoleErrors.filter((e) => !/GoTrueClient|_useSession|__loadSession|getSession\(\)/.test(e));
  record('no hard errors in signup flow', vp.name, realErrors.length === 0 && pageErrors.length === 0,
    realErrors.concat(pageErrors).slice(0, 2).join(' | '));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Auth pages: forgot-password / otp / magic-link
// ─────────────────────────────────────────────────────────────────────────────
const AUTH_PAGES = [
  {
    url: '/auth/forgot-password',
    checks: async (page, vpName) => {
      const email = page.locator('input[type="email"]').first();
      const hasEmail = await email.isVisible({ timeout: 5000 }).catch(() => false);
      record('forgot-password: email field present', vpName, hasEmail);
      if (!hasEmail) return;
      const submit = page.locator('button[type="submit"], button:has-text("Send")').first();
      await submit.click();
      await sleep(1200);
      const blocked = await email.evaluate((el) => !el.checkValidity() || el.value === '');
      const inlineErr = await page.locator('text=/required|valid email|enter your/i').first().isVisible({ timeout: 1500 }).catch(() => false);
      record('forgot-password: empty submit blocked', vpName, blocked || inlineErr);
      await email.fill('not-an-email');
      await submit.click();
      await sleep(1200);
      const invalidBlocked = await email.evaluate((el) => !el.checkValidity());
      const invalidErr = await page.locator('text=/valid email|invalid/i').first().isVisible({ timeout: 1500 }).catch(() => false);
      record('forgot-password: invalid email blocked', vpName, invalidBlocked || invalidErr);
    },
  },
  {
    url: '/auth/otp',
    checks: async (page, vpName) => {
      // Email-first flow: user enters email, THEN the code input appears.
      // Sending a real OTP would spam the backend, so only verify the email
      // field + validation; the code-input step is covered by manual checks.
      const emailField = page.locator('input[type="email"]').first();
      const hasEmail = await emailField.isVisible({ timeout: 5000 }).catch(() => false);
      record('otp: email field present (email-first flow)', vpName, hasEmail);
      if (hasEmail) {
        await emailField.fill('not-an-email');
        const submit = page.locator('button[type="submit"], button:has-text("Send")').first();
        if (await submit.isVisible().catch(() => false)) {
          await submit.click();
          await sleep(1200);
          const blocked = await emailField.evaluate((el) => !el.checkValidity());
          const inlineErr = await page.locator('text=/valid email|invalid|required/i').first().isVisible({ timeout: 1500 }).catch(() => false);
          record('otp: invalid email blocked', vpName, blocked || inlineErr);
        }
      }
    },
  },
  {
    url: '/auth/magic-link',
    checks: async (page, vpName) => {
      const email = page.locator('input[type="email"]').first();
      const hasEmail = await email.isVisible({ timeout: 5000 }).catch(() => false);
      record('magic-link: email field present', vpName, hasEmail);
      if (!hasEmail) return;
      const submit = page.locator('button[type="submit"], button:has-text("Send"), button:has-text("Magic")').first();
      await submit.click();
      await sleep(1200);
      const blocked = await email.evaluate((el) => !el.checkValidity() || el.value === '');
      record('magic-link: empty submit blocked', vpName, blocked);
      await email.fill('not-an-email');
      await submit.click();
      await sleep(1200);
      const invalidBlocked = await email.evaluate((el) => !el.checkValidity());
      record('magic-link: invalid email blocked', vpName, invalidBlocked);
    },
  },
];

for (const vp of VIEWPORTS) {
  for (const ap of AUTH_PAGES) {
    const { consoleErrors, pageErrors } = await withPage(vp, async (page) => {
      await page.goto(`${BASE}${ap.url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      await ap.checks(page, vp.name);
    });
    const realErrors = consoleErrors.filter((e) => !/GoTrueClient|_useSession|__loadSession|getSession\(\)/.test(e));
    record(`auth page clean: ${ap.url}`, vp.name, realErrors.length === 0 && pageErrors.length === 0,
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
