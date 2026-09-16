// Growlancer logout + session-clearance E2E (Section-2 "Logout" checklist).
//
//   node scripts/e2e/logout-flow.mjs --base=http://127.0.0.1:4174 --role=freelancer
//
// Requires E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD env vars (see login.mjs).
// Verifies:
//   1. login reaches the dashboard
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

const CFG = {
  freelancer: { email: process.env.E2E_FREELANCER_EMAIL, password: process.env.E2E_FREELANCER_PASSWORD, dash: '/dashboard', marker: 'Dashboard' },
  client: { email: process.env.E2E_CLIENT_EMAIL, password: process.env.E2E_CLIENT_PASSWORD, dash: '/client', marker: 'Client' },
}[ROLE];
if (!CFG) throw new Error(`Unknown role: ${ROLE}`);
if (!CFG.email || !CFG.password) {
  console.error(`⊘ E2E_${ROLE.toUpperCase()}_EMAIL/_PASSWORD not set — cannot run logout flow. Skipping (exit 0).`);
  process.exit(0);
}

const results = [];
function record(step, pass, detail) {
  results.push({ step, pass, detail });
  console.log(`  ${pass ? '✓' : '✖'} ${step}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const exec = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!exec) throw new Error('No Chrome binary found');
  const browser = await chromium.launch({
    executablePath: exec,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // 1. Login
  await page.goto(`${BASE}/?modal=login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.locator('input[type="email"]').first().fill(CFG.email);
  await page.locator('input[type="password"]').first().fill(CFG.password);
  await page.getByRole('button', { name: /^log in$/i }).first().click();

  await page.waitForURL((u) => u.pathname.startsWith(CFG.dash), { timeout: 30000 })
    .then(() => record('login reaches dashboard', true, page.url()))
    .catch(async () => record('login reaches dashboard', false, `still at ${page.url()}`));

  if (!results[0].pass) {
    await browser.close();
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const f = path.join(OUT_DIR, `logout-flow-${ROLE}-FAIL.md`);
    fs.writeFileSync(f, `# Logout flow (${ROLE}) — FAILED at login step\n\nCredentials may be wrong or the test account is unverified.\n`);
    console.error(`artifact: ${f}`);
    process.exit(1);
  }

  // 2. Find and click logout (sidebar footer / account menu).
  const logoutBtn = page.getByRole('button', { name: /log ?out/i }).first();
  const logoutVisible = await logoutBtn.isVisible().catch(() => false);
  if (logoutVisible) {
    await logoutBtn.click();
  } else {
    // Open the account/avatar menu first, then click Logout inside it.
    const avatar = page.locator('button:has(img), [aria-label*="menu" i], [aria-label*="account" i]').last();
    await avatar.click().catch(() => {});
    await page.getByRole('button', { name: /log ?out/i }).first().click();
  }

  // 3. Session cleared + redirected to logged-out surface
  await page.waitForURL((u) => u.pathname === '/' || u.pathname.includes('login'), { timeout: 15000 })
    .then(() => record('logout redirects to logged-out surface', true, page.url()))
    .catch(() => record('logout redirects to logged-out surface', false, `still at ${page.url()}`));

  const authKeysAfterLogout = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.includes('auth-token')).length
  );
  record('supabase auth-token cleared from storage', authKeysAfterLogout === 0, `keys: ${authKeysAfterLogout}`);

  // 4. Browser BACK must not resurrect the dashboard.
  await page.goBack().catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800); // allow any redirect/ProtectedRoute to run

  const afterBack = await page.evaluate(() => ({
    path: location.pathname,
    text: (document.body.innerText || '').slice(0, 400),
    hasLoginModal: (document.body.innerText || '').includes('Welcome back'),
  }));
  const protectedResurrected =
    afterBack.path.startsWith(CFG.dash) &&
    !afterBack.hasLoginModal &&
    !/log in|sign in|welcome back/i.test(afterBack.text);
  record('browser-back after logout does NOT render protected content', !protectedResurrected, `path=${afterBack.path} loginModal=${afterBack.hasLoginModal}`);

  // 5. Direct URL re-entry is blocked again.
  await page.goto(`${BASE}${CFG.dash}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const reentry = await page.evaluate(() => ({
    path: location.pathname,
    hasLoginModal: (document.body.innerText || '').includes('Welcome back'),
  }));
  const blocked = reentry.hasLoginModal || !reentry.path.startsWith(CFG.dash);
  record('direct protected-URL re-entry blocked after logout', blocked, `path=${reentry.path} loginModal=${reentry.hasLoginModal}`);

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
