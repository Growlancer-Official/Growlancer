// Throwaway audit crawl: renders the built site and reports, for every internal
// link reachable from the home page, the final URL and whether a 404 or an
// "early access" unavailable screen is shown.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const CANDIDATES = [
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const exec = CANDIDATES.find((p) => p && fs.existsSync(p));

const browser = await chromium.launch({ executablePath: exec, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const links = new Set();
page.on('pageerror', (e) => console.log('PAGEERROR', page.url(), e.message));
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
for (const a of await page.$$eval('a[href]', (els) => els.map((e) => e.getAttribute('href')))) {
  if (a && a.startsWith('/') && !a.startsWith('//')) links.add(a.split('#')[0]);
}

const skip = /^\/(assets|videos|_vercel)\//;
const rows = [];
for (const href of [...links].sort()) {
  if (skip.test(href)) continue;
  await page.goto(BASE + href, { waitUntil: 'networkidle' }).catch(() => {});
  const info = await page.evaluate(() => ({
    path: location.pathname,
    title: document.title,
    text: document.body.innerText,
  }));
  const notFound = /Page not found/i.test(info.text) && /\b404\b/.test(info.text);
  const earlyAccess = /not available during early access|not part of the early-access release/i.test(info.text);
  const loginModal = /Welcome back/i.test(info.text);
  rows.push({ href, final: info.path, notFound, earlyAccess, loginModal });
}

for (const r of rows) {
  const flags = [r.notFound && '404', r.earlyAccess && 'EARLY_ACCESS', r.loginModal && 'LOGIN_MODAL']
    .filter(Boolean)
    .join(' ');
  console.log(`${flags || 'ok'} ${r.href} -> ${r.final}`);
}

console.log('\nBROKEN:', rows.filter((r) => r.notFound).map((r) => r.href).join(', ') || 'none');
console.log('EARLY_ACCESS:', rows.filter((r) => r.earlyAccess).map((r) => r.href).join(', ') || 'none');

await browser.close();
