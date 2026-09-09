/* eslint-env node */
/**
 * Mobile E2E playtest — drives the real app in Chromium with mobile device
 * emulation (touch, mobile UA, narrow viewports) and reports layout/a11y/auth
 * defects that desktop-only testing misses.
 *
 * Usage: node scripts/playtest-mobile.mjs
 *
 * Reports per page: horizontal overflow, off-screen elements, console errors,
 * and flow outcomes (login, logout, badge visibility, nav).
 */
import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.playtest-shots');
fs.mkdirSync(SHOTS, { recursive: true });

// Load the app URL the same way the frontend does (.env.local)
const envPath = path.join(ROOT, '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
const urlMatch = envText.match(/^VITE_SUPABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
if (!urlMatch) throw new Error('VITE_SUPABASE_URL not found in .env.local');
const APP_URL = `http://localhost:5173`; // local dev server

const FREELANCER = { email: 'playtest.freelancer@qa.growlancer.dev', pass: 'Test@1234' };
const CLIENT = { email: 'qaclient1788624483@qa.growlancer.dev', pass: 'Test@1234' };

const DEVICES = [
  { name: 'iphone12', viewport: { width: 390, height: 844 }, ...devices['iPhone 12'] },
  { name: 'small-iphone', viewport: { width: 375, height: 667 }, ...devices['iPhone SE'] },
  { name: 'android', viewport: { width: 360, height: 800 }, ...devices['Pixel 5'] },
];

const report = [];

function layoutCheck(page, label) {
  return page.evaluate((lbl) => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth - window.innerWidth;
    const offenders = [];
    if (overflowX > 1) {
      // Find elements sticking out past the right edge
      const all = document.querySelectorAll('body *');
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > window.innerWidth + 1 && !el.closest('[data-no-report]')) {
          const cls = (el.className && typeof el.className === 'string' ? el.className : '').split(' ').slice(0, 3).join('.');
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: cls || '',
            right: Math.round(r.right),
            left: Math.round(r.left),
            width: Math.round(r.width),
          });
          if (offenders.length >= 8) break;
        }
      }
    }
    // Tap-target sanity on visible buttons/links
    const smallTargets = [];
    const vis = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    for (const el of document.querySelectorAll('button, a')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 && r.height < 40) {
        smallTargets.push(`${el.tagName.toLowerCase()}:${(el.textContent || '').trim().slice(0, 25) || (el.getAttribute('aria-label') || '').slice(0, 25)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        if (smallTargets.length >= 5) break;
      }
    }
    return { lbl, url: location.pathname, innerW: window.innerWidth, scrollW: doc.scrollWidth, overflowX, offenders, smallTargets };
  }, label);
}

async function step(ctx, label, fn) {
  const { page, name } = ctx;
  try {
    await fn();
  } catch (e) {
    report.push({ device: name, label, status: 'ERROR', error: e.message.slice(0, 300) });
    await page.screenshot({ path: path.join(SHOTS, `${name}-${label.replace(/\W+/g, '_')}.png`), fullPage: false });
    return;
  }
}

async function runDevice(name, deviceOpts) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...deviceOpts, locale: 'en-IN' });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message.slice(0, 200)));

  const ctx = { page, name, consoleErrors };

  // ── 1. Home page ───────────────────────────────────────────────
  await step(ctx, 'home', async () => {
    await page.goto(APP_URL + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    const check = await layoutCheck(page, 'home');
    report.push({ device: name, label: 'home', status: 'OK', ...check });
    await page.screenshot({ path: path.join(SHOTS, `${name}-home.png`) });
    // Toggle menu opens?
    const toggle = page.locator('button[aria-label="Toggle menu"]').first();
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(600);
      const menuPanel = page.locator('div.fixed.inset-x-0.top-16').first();
      const navVisible = await menuPanel.isVisible().catch(() => false);
      report.push({ device: name, label: 'home-nav-toggle', status: navVisible ? 'OK' : 'FAIL', note: navVisible ? 'menu opened' : 'menu did not open' });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    } else {
      report.push({ device: name, label: 'home-nav-toggle', status: 'NA', note: 'no toggle menu button visible' });
    }
  });

  // ── 2. Login (freelancer) ──────────────────────────────────────
  await step(ctx, 'freelancer-login', async () => {
    await page.goto(APP_URL + '/?modal=login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2200);
    const check = await layoutCheck(page, 'freelancer-login');
    report.push({ device: name, label: 'freelancer-login', status: 'OK', ...check });
    const email = page.getByRole('textbox', { name: /email/i }).first();
    const pass = page.locator('input[type="password"]').first();
    const submit = page.getByRole('button', { name: 'Log In', exact: true }).first();
    if (!(await email.isVisible())) throw new Error('email field not visible (modal may be broken on mobile)');
    await email.fill(FREELANCER.email);
    await pass.fill(FREELANCER.pass);
    await page.screenshot({ path: path.join(SHOTS, `${name}-login-filled.png`) });
    await submit.click();
    await page.waitForTimeout(5000);
    const url = page.url();
    const authed = url.includes('/dashboard') || url.includes('/onboarding') || url.includes('/client');
    report.push({ device: name, label: 'freelancer-login-submit', status: authed ? 'OK' : 'FAIL', note: `landed on ${url}` });
    if (!authed) {
      await page.screenshot({ path: path.join(SHOTS, `${name}-login-fail.png`) });
      throw new Error('login did not complete');
    }
    await page.screenshot({ path: path.join(SHOTS, `${name}-after-login.png`) });
  });

  // ── 3. Freelancer dashboard ────────────────────────────────────
  await step(ctx, 'freelancer-dashboard', async () => {
    await page.goto(APP_URL + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const check = await layoutCheck(page, 'freelancer-dashboard');
    report.push({ device: name, label: 'freelancer-dashboard', status: 'OK', ...check });
    await page.screenshot({ path: path.join(SHOTS, `${name}-dashboard.png`) });
    // Mobile nav: open the sidebar and check it works + verify badge area
    const openNav = page.locator('button[aria-label="Open navigation"]').first();
    if (await openNav.isVisible()) {
      await openNav.click();
      await page.waitForTimeout(600);
      const nav = page.locator('nav').first();
      const navBox = await nav.boundingBox().catch(() => null);
      const navOk = navBox ? navBox.width < 330 : false; // drawer, not full-width
      report.push({ device: name, label: 'freelancer-drawer', status: navOk ? 'OK' : 'WARN', note: navBox ? `drawer width ${Math.round(navBox.width)}px` : 'drawer not found' });
      await page.screenshot({ path: path.join(SHOTS, `${name}-drawer.png`) });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    } else {
      report.push({ device: name, label: 'freelancer-drawer', status: 'NA', note: 'no open-nav button' });
    }
  });

  // ── 4. Verification page (badge) ───────────────────────────────
  await step(ctx, 'verification-page', async () => {
    await page.goto(APP_URL + '/dashboard/verification', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const check = await layoutCheck(page, 'verification-page');
    const text = await page.locator('main').innerText().catch(() => '');
    report.push({
      device: name, label: 'verification-page', status: 'OK', ...check,
      notes: {
        kycStatus: (text.match(/(Verified|Not Verified|Pending|In Review|Unverified)/i) || ['?'])[0],
        hasVerifyCta: /verify|submit|start/i.test(text),
      },
    });
    await page.screenshot({ path: path.join(SHOTS, `${name}-verification.png`) });
  });

  // ── 5. Contracts page ──────────────────────────────────────────
  await step(ctx, 'freelancer-contracts', async () => {
    await page.goto(APP_URL + '/dashboard/contracts', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const check = await layoutCheck(page, 'freelancer-contracts');
    report.push({ device: name, label: 'freelancer-contracts', status: 'OK', ...check });
    await page.screenshot({ path: path.join(SHOTS, `${name}-contracts.png`) });
  });

  // ── 6. Logout + client login ───────────────────────────────────
  await step(ctx, 'logout', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.goto(APP_URL + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const loggedOut = await page.locator('button[aria-label="Toggle menu"]').first().isVisible()
      && await page.locator('button:has-text("Signup")').first().isVisible();
    report.push({ device: name, label: 'logout', status: loggedOut ? 'OK' : 'WARN', note: loggedOut ? 'session cleared' : 'still logged in?' });
  });

  await step(ctx, 'client-login', async () => {
    await page.goto(APP_URL + '/?modal=login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2200);
    const email = page.getByRole('textbox', { name: /email/i }).first();
    const pass = page.locator('input[type="password"]').first();
    const submit = page.getByRole('button', { name: 'Log In', exact: true }).first();
    if (!(await email.isVisible())) throw new Error('login modal not visible on mobile');
    await email.fill(CLIENT.email);
    await pass.fill(CLIENT.pass);
    await submit.click();
    await page.waitForTimeout(5000);
    const url = page.url();
    const authed = url.includes('/client') || url.includes('/dashboard') || url.includes('/onboarding');
    report.push({ device: name, label: 'client-login-submit', status: authed ? 'OK' : 'FAIL', note: `landed on ${url}` });
    if (!authed) throw new Error('client login failed');
    await page.waitForTimeout(1500);
    const check = await layoutCheck(page, 'client-dashboard');
    report.push({ device: name, label: 'client-dashboard', status: 'OK', ...check });
    await page.screenshot({ path: path.join(SHOTS, `${name}-client-dashboard.png`) });
    // Open the client drawer and check the "Find Talent" / verification entries
    const openNav = page.locator('button[aria-label="Open navigation"]').first();
    if (await openNav.isVisible()) {
      await openNav.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SHOTS, `${name}-client-drawer.png`) });
      await page.keyboard.press('Escape');
    }
  });

  report.push({ device: name, label: 'console-errors', status: consoleErrors.length ? 'WARN' : 'OK', errors: consoleErrors.slice(0, 10) });
  await browser.close();
}

for (const d of DEVICES) {
  console.log(`\n=== ${d.name} (${d.viewport.width}x${d.viewport.height}) ===`);
  await runDevice(d.name, d);
}

// ── Summary ─────────────────────────────────────────────────────
console.log('\n\n=================== MOBILE PLAYTEST REPORT ===================');
let fails = 0, warns = 0;
for (const r of report) {
  if (r.status === 'FAIL') fails++;
  if (r.status === 'WARN') warns++;
  const line = JSON.stringify(r);
  console.log(`[${r.device}] ${r.status.padEnd(4)} ${r.label}`);
  if (r.status !== 'OK') console.log('   ' + line.slice(0, 500));
  else if (r.overflowX > 1) console.log(`   OVERFLOW ${r.overflowX}px → ${line.slice(0, 400)}`);
}
console.log(`\nFailures: ${fails}  Warnings: ${warns}  Screenshots: ${SHOTS}`);
process.exit(fails > 0 ? 1 : 0);