// Growlancer E2E login helper — creates Playwright storage-states for
// authenticated audit runs.
//
//   node scripts/e2e/login.mjs --base=http://127.0.0.1:4174 --role=freelancer
//   node scripts/e2e/login.mjs --role=client --role2=admin
//
// Credentials come from env (never hardcode, never commit):
//   E2E_FREELANCER_EMAIL / E2E_FREELANCER_PASSWORD
//   E2E_CLIENT_EMAIL     / E2E_CLIENT_PASSWORD
//   E2E_ADMIN_EMAIL      / E2E_ADMIN_PASSWORD
//
// Writes .e2e/<role>.json (gitignored) usable as --storage for
// element-audit.mjs / device-audit.mjs.

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

const ROLES = {
  freelancer: { email: process.env.E2E_FREELANCER_EMAIL, password: process.env.E2E_FREELANCER_PASSWORD, start: '/?modal=login' },
  client: { email: process.env.E2E_CLIENT_EMAIL, password: process.env.E2E_CLIENT_PASSWORD, start: '/?modal=login' },
  admin: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD, start: '/admin' },
};

async function loginRole(browser, role) {
  const cfg = ROLES[role];
  if (!cfg) throw new Error(`Unknown role: ${role}`);
  if (!cfg.email || !cfg.password) {
    console.log(`⊘ ${role}: E2E_${role.toUpperCase()}_EMAIL / _PASSWORD not set — skipping (this is expected until test accounts exist)`);
    return null;
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto(`${BASE}${cfg.start}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  if (role === 'admin') {
    await page.locator('input[type="email"], input[aria-label*="email" i]').first().fill(cfg.email);
    await page.locator('input[type="password"]').first().fill(cfg.password);
    await page.getByRole('button', { name: /access admin|sign in|log in/i }).first().click();
  } else {
    // Login modal on the homepage. Scope strictly to the modal form: a bare
    // getByRole('button', /^log in$/i) also matches the header's "Log in"
    // button, which re-opens the modal instead of submitting it.
    const form = page.locator('form').filter({ has: page.locator('input[type="password"]') }).first();
    await form.locator('input[type="email"]').first().fill(cfg.email);
    await form.locator('input[type="password"]').first().fill(cfg.password);
    await form.locator('button[type="submit"]').first().click();
  }

  // Wait for an authenticated marker. The real ground truth is the Supabase
  // session landing in localStorage (that is what the storage state needs), so
  // a live session counts as success even if the SPA redirect is slow — a CI
  // runner is much slower than a local machine and used to fail here while the
  // token was already stored. A session with no navigation gets one nudge.
  const landing = role === 'admin' ? '/admin' : role === 'client' ? '/client' : '/dashboard';

  const hasSession = () => page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('auth-token'));
    const raw = key ? localStorage.getItem(key) : null;
    if (!raw) return false;
    try { return !!JSON.parse(raw)?.access_token; } catch { return raw.includes('access_token'); }
  }).catch(() => false);

  const onAuthenticatedRoute = () => page.evaluate(() => {
    const url = location.pathname;
    const text = document.body.innerText || '';
    return url.startsWith('/dashboard') || url.startsWith('/client') || (url.startsWith('/admin') && !/admin login/i.test(text));
  }).catch(() => false);

  const deadline = Date.now() + 60000;
  let ok = false;
  let sawSession = false;
  let sawRoute = false;
  while (Date.now() < deadline && !ok) {
    sawSession = (await hasSession()) || sawSession;
    sawRoute = (await onAuthenticatedRoute()) || sawRoute;
    ok = sawSession || sawRoute;
    if (!ok) await page.waitForTimeout(500);
  }

  if (!ok) {
    await context.close();
    throw new Error(`${role}: no authenticated session after 60s — check credentials/test-account state`);
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
  console.log(`✔ ${role} logged in → ${file}`);
  return file;
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
}

main().catch((err) => { console.error(err); process.exit(1); });
