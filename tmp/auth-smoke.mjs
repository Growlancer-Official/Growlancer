import { chromium } from 'playwright-core';
import fs from 'node:fs';
const candidates = [
  'C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const exec = candidates.find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exec, headless: true });
for (const [role, route] of [['client', '/client'], ['freelancer', '/dashboard']]) {
  const ctx = await browser.newContext({ storageState: `.e2e/${role}.json`, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await page.goto('http://127.0.0.1:4175' + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  console.log(role, '→', new URL(page.url()).pathname, '| h1:', (await page.locator('h1').first().innerText().catch(() => 'NONE')).slice(0, 70), '| pageerrors:', errs.length);
  await ctx.close();
}
await browser.close();
