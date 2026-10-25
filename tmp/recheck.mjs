import { chromium } from 'playwright-core';
import fs from 'node:fs';

const exec = [
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const CASES = [
  ['freelancer', '/dashboard/projects'],
  ['freelancer', '/dashboard'],
  ['client', '/client/reviews'],
  ['client', '/client/tickets'],
  ['admin', '/admin/users'],
  ['admin', '/admin/projects'],
  ['admin', '/admin/finance'],
  ['admin', '/admin/reports'],
  ['admin', '/admin/subscriptions'],
];

const browser = await chromium.launch({ executablePath: exec, headless: true });
for (const [role, route] of CASES) {
  const ctx = await browser.newContext({ storageState: `.e2e/${role}.json`, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 160)));
  page.on('requestfailed', (r) => {
    if (r.url().includes('functions/v1/')) errors.push('REQFAIL ' + (r.failure()?.errorText || '') + ' ' + r.url().split('/v1/')[1]);
  });
  await page.goto('http://127.0.0.1:4175' + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => ({
    path: location.pathname,
    notFound: /Page not found/i.test(document.body.innerText),
    len: document.body.innerText.trim().length,
  }));
  console.log((errors.length ? 'ERR' : 'ok ').padEnd(4), role.padEnd(10), route, '->', info.path, 'notFound=' + info.notFound, 'text=' + info.len, errors[0] || '');
  await ctx.close();
}
await browser.close();
