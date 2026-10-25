import { chromium } from 'playwright-core';
import fs from 'node:fs';

const exec = [
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const browser = await chromium.launch({ executablePath: exec, headless: true });
const ctx = await browser.newContext({ storageState: '.e2e/admin.json', viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('request', (r) => {
  if (r.url().includes('/functions/v1/')) console.log('REQ', r.method(), r.url().slice(0, 140));
});
page.on('response', async (r) => {
  if (r.url().includes('/functions/v1/')) {
    console.log('RES', r.status(), r.url().slice(0, 140), 'acao=', r.headers()['access-control-allow-origin']);
  }
});
page.on('requestfailed', (r) => {
  if (r.url().includes('/functions/v1/')) console.log('FAILED', r.failure()?.errorText, r.url().slice(0, 140));
});
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300));
});

await page.goto('http://127.0.0.1:4175/admin/finance', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
console.log('TEXT', (await page.evaluate(() => document.body.innerText)).slice(0, 500));
await browser.close();
