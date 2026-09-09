/* eslint-env node */
/**
 * Desktop width-consistency audit — measures the content column of every main
 * route at 1280 / 1440 / 1920px and reports horizontal overflow offenders and
 * pages whose container widths deviate from the site-wide norm.
 *
 * Usage: node scripts/audit-desktop.mjs
 * Requires the dev server on localhost:5173 and the QA test accounts.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://localhost:5173';

const FREELANCER = { email: 'playtest.freelancer@qa.growlancer.dev', pass: 'Test@1234' };
const CLIENT = { email: 'qaclient1788624483@qa.growlancer.dev', pass: 'Test@1234' };

const PUBLIC = [
  '/', '/how-it-works', '/features', '/categories', '/pricing', '/about',
  '/philosophy', '/contact', '/careers', '/internships', '/help-center',
  '/safety', '/guidelines', '/status', '/terms', '/privacy', '/escrow-policy',
  '/cookies', '/freelancers', '/services', '/contests',
];
const FREELANCER_ROUTES = [
  '/dashboard', '/dashboard/feed', '/dashboard/invites', '/dashboard/proposals',
  '/dashboard/contracts', '/dashboard/wallet', '/dashboard/profile',
  '/dashboard/settings', '/dashboard/referrals', '/dashboard/pro',
  '/dashboard/portfolio', '/dashboard/analytics', '/dashboard/inbox',
  '/dashboard/disputes', '/dashboard/identity-verification', '/dashboard/services',
  '/dashboard/ai-subscription', '/dashboard/ai-assistant', '/dashboard/tickets',
  '/dashboard/certifications', '/dashboard/time-tracking',
];
const CLIENT_ROUTES = [
  '/client', '/client/projects', '/client/matches', '/client/find-talent',
  '/client/invites', '/client/proposals', '/client/contracts', '/client/inbox',
  '/client/payments', '/client/settings', '/client/verification', '/client/referrals',
  '/client/ai-assistant', '/client/tickets', '/client/reviews', '/client/contests',
  '/client/team-projects', '/client/team-projects/create',
];
const WIDTHS = [1280, 1440, 1920];

const results = []; // { width, route, mainW, colW, colMaxW, overflow, offenders[] }

async function measure(page, route) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const main = document.querySelector('main');
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 2 && r.left < vw - 4) {
        // Skip decorative absolutely-positioned blobs and anything clipped by an
        // overflow-x: auto/hidden ancestor (internal scrollers are fine).
        let clipped = false, abs = getComputedStyle(el).position === 'absolute';
        let p = el.parentElement;
        for (let d = 0; p && d < 8; d++, p = p.parentElement) {
          const po = getComputedStyle(p).overflowX;
          if (po === 'auto' || po === 'hidden' || po === 'scroll') { clipped = true; break; }
        }
        if (abs || clipped) continue;
        const cls = (typeof el.className === 'string' ? el.className : '');
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: cls.split(' ').slice(0, 3).join('.') || '',
          left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
        });
        if (offenders.length >= 6) break;
      }
    }
    // Find the real content column: deepest descendant of the widest main-child
    // that carries a max-width (e.g. max-w-7xl / max-w-[100rem]) — this is what
    // determines "chota/bada" page consistency, not the full-bleed section.
    let colW = 0, colMaxW = '';
    if (main) {
      const kids = [...main.children]
        .map(el => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0)
        .sort((a, b) => b.r.width - a.r.width);
      const widest = kids[0];
      if (widest) {
        // Walk down the widest content chain (skipping page toolbars) looking
        // for a max-width-constrained element — that is the page's real column.
        const isToolbar = (el) => ['header', 'nav', 'aside', 'footer'].includes(el.tagName.toLowerCase());
        let node = widest.el;
        if (isToolbar(node)) {
          node = [...node.parentElement.children]
            .map(el2 => ({ el: el2, r: el2.getBoundingClientRect() }))
            .filter((k) => k.r.width > 0 && !isToolbar(k.el))
            .sort((a, b) => b.r.width - a.r.width)[0]?.el ?? null;
        }
        for (let depth = 0; depth < 6 && node; depth++) {
          const cs = getComputedStyle(node);
          if (cs.maxWidth !== 'none') {
            const r = node.getBoundingClientRect();
            colW = Math.round(r.width);
            colMaxW = cs.maxWidth;
            break;
          }
          const kids2 = [...node.children]
            .map(el3 => ({ el: el3, r: el3.getBoundingClientRect() }))
            .filter((k) => k.r.width > 0 && !isToolbar(k.el))
            .sort((a, b) => b.r.width - a.r.width);
          node = kids2[0]?.el ?? null;
        }
        if (!colW) colW = Math.round(widest.r.width);
      }
    }
    return {
      vw,
      mainW: main ? Math.round(main.getBoundingClientRect().width) : 0,
      colW, colMaxW,
      overflow: document.documentElement.scrollWidth - vw,
      offenders,
    };
  });
}

async function login(page, creds) {
  await page.goto(`${APP_URL}/?modal=login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2200);
  const email = page.getByRole('textbox', { name: /email/i }).first();
  await email.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (!(await email.isVisible())) throw new Error('login modal not visible');
  await email.fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.pass);
  await page.getByRole('button', { name: 'Log In', exact: true }).first().click();
  await page.waitForTimeout(5000);
  if (!/dashboard|client|onboarding/i.test(page.url())) throw new Error(`login failed → ${page.url()}`);
}

const browser = await chromium.launch();

for (const width of WIDTHS) {
  // Public pages
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-IN' });
  const page = await ctx.newPage();
  for (const route of PUBLIC) {
    try {
      await page.goto(APP_URL + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1800);
      results.push({ width, route, ...(await measure(page, route)) });
    } catch (e) {
      results.push({ width, route, error: e.message.slice(0, 120) });
    }
  }
  await ctx.close();

  // Freelancer routes
  const fctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-IN' });
  const fpage = await fctx.newPage();
  try {
    await login(fpage, FREELANCER);
    for (const route of FREELANCER_ROUTES) {
      try {
        await fpage.goto(APP_URL + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await fpage.waitForTimeout(1800);
        results.push({ width, route, ...(await measure(fpage, route)) });
      } catch (e) {
        results.push({ width, route, error: e.message.slice(0, 120) });
      }
    }
  } catch (e) {
    console.log(`freelancer login failed at ${width}: ${e.message}`);
  }
  await fctx.close();

  // Client routes
  const cctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-IN' });
  const cpage = await cctx.newPage();
  try {
    await login(cpage, CLIENT);
    for (const route of CLIENT_ROUTES) {
      try {
        await cpage.goto(APP_URL + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await cpage.waitForTimeout(1800);
        results.push({ width, route, ...(await measure(cpage, route)) });
      } catch (e) {
        results.push({ width, route, error: e.message.slice(0, 120) });
      }
    }
  } catch (e) {
    console.log(`client login failed at ${width}: ${e.message}`);
  }
  await cctx.close();
}

await browser.close();

// ── Analysis ─────────────────────────────────────────────────────
const widthNorm = {}; // width -> most common content-column max-width
for (const width of WIDTHS) {
  const mws = results.filter(r => r.width === width && r.colMaxW && r.colMaxW !== 'none').map(r => r.colMaxW);
  const counts = {};
  for (const m of mws) counts[m] = (counts[m] || 0) + 1;
  widthNorm[width] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
}

console.log('\n=================== DESKTOP WIDTH AUDIT ===================');
for (const width of WIDTHS) {
  console.log(`\n--- ${width}px (norm column ≈ ${widthNorm[width] ? widthNorm[width][0] + 'px' : '?'}) ---`);
  for (const r of results.filter(x => x.width === width)) {
    if (r.error) { console.log(`  ERROR ${r.route}: ${r.error}`); continue; }
    const norm = widthNorm[width]?.[0];
    const flags = [];
    if (r.offenders.length) flags.push(`OVERFLOW:${r.offenders[0].left}→${r.offenders[0].right}px (${r.offenders[0].tag} ${r.offenders[0].cls})`);
    if (norm && r.colMaxW && r.colMaxW !== 'none' && r.colMaxW !== norm) flags.push(`DEV-maxW:${r.colMaxW} (norm ${norm})`);
    if (norm && !r.colMaxW && r.colW > 0) flags.push(`NO-maxW (norm ${norm})`);
    if (r.colW === 0) flags.push('NO-CONTENT');
    const maxw = r.colMaxW && r.colMaxW !== 'none' ? r.colMaxW : '';
    if (flags.length) console.log(`  ${r.route.padEnd(34)} col=${r.colW}px${maxw ? ` (${maxw})` : ''} ${flags.join(' | ')}`);
    else if (maxw) console.log(`  ${r.route.padEnd(34)} col=${r.colW}px (${maxw})`);
  }
}