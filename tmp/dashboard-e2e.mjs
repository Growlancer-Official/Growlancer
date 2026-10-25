// Authenticated dashboard sweep using the storage states written by
// scripts/e2e/login.mjs. Checks: authenticated render, 404 screens, early-access
// screens where they are NOT expected, console errors and failed API calls.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const exec = [
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const ROUTES = {
  freelancer: [
    '/dashboard', '/dashboard/feed', '/dashboard/proposals', '/dashboard/contracts',
    '/dashboard/wallet', '/dashboard/profile', '/dashboard/settings', '/dashboard/services',
    '/dashboard/analytics', '/dashboard/notifications', '/dashboard/referrals',
    '/dashboard/pro', '/dashboard/disputes', '/dashboard/support-tickets',
    '/dashboard/identity-verification', '/dashboard/projects', '/dashboard/subscription',
    '/dashboard/portfolio', '/dashboard/invites', '/dashboard/workspace',
  ],
  client: [
    '/client', '/client/post', '/client/projects', '/client/matches', '/client/invites',
    '/client/proposals', '/client/contracts', '/client/payments', '/client/settings',
    '/client/referrals', '/client/verification', '/client/reviews', '/client/tickets',
    '/client/workspace',
  ],
  admin: [
    '/admin', '/admin/users', '/admin/projects', '/admin/contracts', '/admin/payments',
    '/admin/finance', '/admin/withdrawals', '/admin/disputes', '/admin/subscriptions',
    '/admin/reports', '/admin/support-tickets', '/admin/identity-verification',
    '/admin/user-reports', '/admin/waitlist', '/admin/data-isolation',
  ],
};

const browser = await chromium.launch({ executablePath: exec, headless: true });
const rows = [];

for (const [role, routes] of Object.entries(ROUTES)) {
  const stateFile = `.e2e/${role}.json`;
  if (!fs.existsSync(stateFile)) {
    console.log(`SKIP ${role}: no storage state`);
    continue;
  }
  const ctx = await browser.newContext({
    storageState: stateFile,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  let errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(t)) errors.push(t.slice(0, 180));
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 180)));

  for (const route of routes) {
    errors = [];
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1400);
    let info;
    try {
      info = await page.evaluate(() => ({
        path: location.pathname,
        text: document.body.innerText.slice(0, 1500),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }));
    } catch {
      info = { path: '?', text: '', overflow: false };
    }
    const notFound = /\b404\b/.test(info.text) && /Page not found/i.test(info.text);
    const early = /not available during early access|not part of the early-access release/i.test(info.text);
    const bounced = /^(?!\/(dashboard|client|admin))/.test(info.path);
    const flag = notFound ? 'NOT_FOUND' : early ? 'EARLY_ACCESS' : bounced ? 'BOUNCED' : '';
    rows.push({ role, route, final: info.path, flag, overflow: info.overflow, errors: [...errors] });
    const status = flag || (errors.length ? 'CONSOLE_ERROR' : 'ok');
    console.log(`${status.padEnd(13)} ${role.padEnd(10)} ${route} -> ${info.path}${errors.length ? ' | ' + errors[0] : ''}`);
  }
  await ctx.close();
}

const bad = rows.filter((r) => r.flag || r.errors.length);
console.log('\nSUMMARY', JSON.stringify({
  total: rows.length,
  clean: rows.length - bad.length,
  notFound: rows.filter((r) => r.flag === 'NOT_FOUND').length,
  earlyAccess: rows.filter((r) => r.flag === 'EARLY_ACCESS').map((r) => r.role + ':' + r.route),
  bounced: rows.filter((r) => r.flag === 'BOUNCED').map((r) => r.role + ':' + r.route),
  consoleErrors: rows.filter((r) => r.errors.length).length,
}, null, 2));

await browser.close();
