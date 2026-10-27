// Strict proof for the reported defect: "login karne par pehle LinkedIn/GitHub
// par jata hai" — a user who already signed up must reach the dashboard with
// ZERO requests to the OAuth providers and ZERO flash of the Login button.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const SLOW_MS = 2000; // widen the restore window so a regression is visible
const EXEC = [
  'C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: EXEC, headless: true });

// 2s of artificial latency per Supabase call means a signed-in restore is
// inherently ~10-12s here; the budget only has to catch a real hang.
async function run({ label, url, timeoutMs = 30000 }) {
  const ctx = await browser.newContext({
    storageState: `.e2e/client.json`,
    viewport: { width: 1440, height: 900 },
  });
  // Throttle Supabase so the restore window is long enough to catch a flash.
  await ctx.route('**/*.supabase.co/**', async (route) => {
    await new Promise((r) => setTimeout(r, SLOW_MS));
    await route.continue().catch(() => {});
  });

  const providerHits = [];
  const authHits = [];
  ctx.on('request', (req) => {
    const u = req.url();
    if (/github\.com|linkedin\.com|linkedin\.cn/i.test(u)) providerHits.push(u);
    if (/\/auth\/v1\/authorize/i.test(u)) authHits.push(u);
  });

  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });

  let loginFlashed = false;
  let providerTextFlashed = false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      path: location.pathname,
      header: document.querySelector('header')?.innerText || '',
      body: document.body.innerText,
    }));
    if (/\bLogin\b/.test(state.header)) loginFlashed = true;
    if (/Continue with GitHub|Continue with LinkedIn/.test(state.body)) providerTextFlashed = true;
    if (/\bDashboard\b/.test(state.header)) break;
    if (state.path !== '/' && state.path !== '/onboarding') break;
    await page.waitForTimeout(100);
  }

  const header = await page.evaluate(() => ({
    path: location.pathname,
    text: document.querySelector('header')?.innerText || '',
  }));
  check(`${label}: no request to github.com/linkedin.com`, providerHits.length === 0, providerHits.slice(0, 2).join(' '));
  check(`${label}: no OAuth authorize request`, authHits.length === 0);
  check(`${label}: provider choices never rendered`, !providerTextFlashed);
  check(`${label}: the Login button never flashed for a returning user`, !loginFlashed);

  const cta = page.locator('header a', { hasText: 'Dashboard' }).first();
  if (await cta.count()) {
    await cta.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  const final = await page.evaluate(() => location.pathname);
  check(`${label}: ended inside the app`, /^\/(client|dashboard|onboarding)/.test(final), `final ${final}`);
  check(`${label}: still no provider request after using the app`, providerHits.length === 0 && authHits.length === 0);
  check(`${label}: resolved in under 25s on a throttled network`, Date.now() - t0 < 25000, `${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await ctx.close();
}

// 1. Homepage visit as a returning signed-in client (the reported flow).
await run({ label: 'homepage', url: '/' });
// 2. A stale ?modal=login link (bookmark / ProtectedRoute bounce).
await run({ label: 'deep link', url: '/?modal=login' });
// 3. A protected page opened directly.
await run({ label: 'protected page', url: '/client' });

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed, ${fails.length} failed`);
fs.writeFileSync('tmp/verify-no-provider-bounce.json', JSON.stringify(results, null, 2));
process.exit(fails.length ? 2 : 0);
