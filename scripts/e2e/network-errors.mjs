// Lists EVERY 4xx/5xx response (and failed request) a page makes — unfiltered.
// Used to identify the exact URLs behind "Failed to load resource: 404" console
// errors, which the main audit intentionally filters (favicon, analytics…).
//
// Usage: node scripts/e2e/network-errors.mjs --url=/report --base=http://localhost:4173

import fs from 'node:fs';
import { chromium } from 'playwright-core';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.join('=') || 'true'];
  })
);

const CANDIDATES = [
  process.env.E2E_CHROME_PATH,
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const exec = CANDIDATES.find((p) => fs.existsSync(p));
if (!exec) throw new Error('No Chrome found');

const base = args.base || 'http://localhost:5173';
const url = args.url || '/';

const browser = await chromium.launch({ executablePath: exec, headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();

const seen = new Map();
page.on('response', (r) => {
  if (r.status() >= 400) seen.set(`${r.status()} ${r.url()}`, (seen.get(`${r.status()} ${r.url()}`) || 0) + 1);
});
page.on('requestfailed', (r) => {
  seen.set(`ERR ${r.failure()?.errorText} ${r.url()}`, (seen.get(`ERR ${r.failure()?.errorText} ${r.url()}`) || 0) + 1);
});

await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(1500);

console.log(`\n${base}${url}`);
for (const [k, n] of seen) console.log(`  ${n}× ${k}`);
if (!seen.size) console.log('  (no 4xx/5xx)');

await browser.close();
