// Narrower repro: what the returning user actually sees, second by second,
// when the session takes a couple of seconds to restore on a real network.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = [
  'C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));

const SLOW_MS = Number(process.env.SLOW_MS || 2000);
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ storageState: '.e2e/client.json', viewport: { width: 1440, height: 900 } });
await ctx.route('**/*.supabase.co/**', async (route) => {
  await new Promise((r) => setTimeout(r, SLOW_MS));
  await route.continue().catch(() => {});
});
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

const timeline = [];
let clicked = false;
for (let i = 0; i < 60; i++) {
  const state = await page.evaluate(() => {
    const header = document.querySelector('header');
    const text = header ? header.innerText : '';
    return {
      path: location.pathname,
      login: /\bLogin\b/.test(text),
      dashboard: /\bDashboard\b/.test(text),
    };
  });
  const at = Date.now() - t0;
  const key = `${state.path} login=${state.login} dashboard=${state.dashboard}`;
  if (timeline[timeline.length - 1]?.key !== key) timeline.push({ at, key });
  if (state.login && !clicked) {
    clicked = true;
    await page.locator('header button', { hasText: 'Login' }).first().click().catch(() => {});
    await page.waitForTimeout(400);
    const body = await page.evaluate(() => document.body.innerText);
    timeline.push({
      at: Date.now() - t0,
      key: 'after Login click',
      modalOffersProviders: /Continue with GitHub/.test(body),
      modalRestoring: /Taking you to your dashboard/.test(body),
      welcoming: /Welcome back/.test(body),
    });
  }
  await page.waitForTimeout(100);
}

console.log(JSON.stringify(timeline, null, 2));
fs.writeFileSync('tmp/repro-timeline.json', JSON.stringify(timeline, null, 2));
await browser.close();
