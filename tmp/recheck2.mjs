import { chromium } from 'playwright-core';
import fs from 'node:fs';
const exec = [
  `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => p && fs.existsSync(p));
if (!exec) { console.error('no browser found'); process.exit(1); }
const routes = [
  ['admin', '/admin/contracts'], ['admin', '/admin/payments'], ['admin', '/admin/withdrawals'],
  ['freelancer', '/dashboard/wallet'], ['client', '/client/workspace'],
];
const browser = await chromium.launch({ executablePath: exec, headless: true });
for (const [role, route] of routes) {
  const ctx = await browser.newContext({ storageState: `.e2e/${role}.json`, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 140)));
  const failed = [];
  page.on('requestfailed', r => failed.push(`${r.url().slice(0, 100)} :: ${r.failure()?.errorText}`));
  await page.goto('http://127.0.0.1:4175' + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const notFound = await page.evaluate(() => /Page Not Found|404/.test(document.body.innerText));
  console.log(`\n== ${role} ${route} == notFound=${notFound} errs=${errs.length} reqFailed=${failed.length}`);
  errs.slice(0, 4).forEach(e => console.log('  ERR:', e.replace(/\n/g, ' ')));
  failed.slice(0, 4).forEach(f => console.log('  REQFAIL:', f));
  await ctx.close();
}
await browser.close();
