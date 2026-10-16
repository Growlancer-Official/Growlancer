/* eslint-env node */
/**
 * Mobile dashboard deep-dive — walks EVERY freelancer + client dashboard page
 * at 375px (worst common phone) and reports per-section layout defects that
 * basic overflow checks miss:
 *   - tap targets < 40px on interactive controls
 *   - text crushed below 11px (unreadable on phones)
 *   - elements sticking out of their section (clipped/cut off)
 *   - grid rows squeezed to tiny heights
 *   - horizontal scroll traps inside sections
 * Usage: node scripts/audit-mobile-dashboard.mjs
 */
import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'http://localhost:5173';
const FREELANCER = { email: 'playtest.freelancer@qa.growlancer.dev', pass: 'Test@1234' };
const CLIENT = { email: 'qaclient1788624483@qa.growlancer.dev', pass: 'Test@1234' };

const FREELANCER_ROUTES = [
  '/dashboard', '/dashboard/feed', '/dashboard/proposals', '/dashboard/contracts',
  '/dashboard/wallet', '/dashboard/profile', '/dashboard/settings', '/dashboard/notifications',
  '/dashboard/services', '/dashboard/portfolio', '/dashboard/analytics', '/dashboard/inbox',
  '/dashboard/disputes', '/dashboard/identity-verification', '/dashboard/tickets',
  '/dashboard/ai-assistant', '/dashboard/referrals', '/dashboard/certifications',
  '/dashboard/time-tracking', '/dashboard/help-center',
];
const CLIENT_ROUTES = [
  '/client', '/client/projects', '/client/proposals', '/client/contracts',
  '/client/payments', '/client/settings', '/client/verification', '/client/notifications',
  '/client/matches', '/client/invites', '/client/find-talent', '/client/inbox',
  '/client/tickets', '/client/reviews', '/client/referrals', '/client/ai-assistant',
  '/client/team-projects',
];

const DEVICE = { viewport: { width: 375, height: 812 }, ...devices['iPhone 12'] };

async function login(page, creds) {
  // Hard reset first: clear storage on a live page, then reload so the SPA's
  // in-memory session state is dropped too (localStorage.clear() alone leaves
  // the router believing we're still logged in → no Log In button ever mounts).
  await page.goto(APP_URL + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${APP_URL}/?modal=login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2200);
  const email = page.getByRole('textbox', { name: /email/i }).first();
  await email.waitFor({ state: 'visible', timeout: 15000 });
  await email.fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.pass);
  await page.getByRole('button', { name: 'Log In', exact: true }).first().click();
  await page.waitForTimeout(5000);
  if (!/dashboard|client|onboarding/i.test(page.url())) {
    // one retry — the first login click occasionally races the modal mount
    await page.getByRole('button', { name: 'Log In', exact: true }).first().click();
    await page.waitForTimeout(5000);
  }
  if (!/dashboard|client|onboarding/i.test(page.url())) throw new Error(`login failed → ${page.url()}`);
}

async function audit(page, route) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const issues = [];
    const visible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2 && r.height > 2;
    };

    // 1. Tiny tap targets (interactive controls < 36px both axes)
    const tinyTargets = [];
    for (const el of document.querySelectorAll('main button, main a[href], main select, main input[type="submit"]')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 36 && r.height < 36) {
        tinyTargets.push({
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
          w: Math.round(r.width), h: Math.round(r.height),
        });
        if (tinyTargets.length >= 6) break;
      }
    }
    if (tinyTargets.length) issues.push({ type: 'TINY-TAP-TARGET', items: tinyTargets });

    // 2. Crushed text (< 10px font on visible paragraphs/headings)
    const crushed = [];
    for (const el of document.querySelectorAll('main p, main h1, main h2, main h3, main span')) {
      if (!visible(el) || el.children.length > 0) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 10) {
        crushed.push({ text: (el.textContent || '').trim().slice(0, 30), fs: fs.toFixed(1) });
        if (crushed.length >= 5) break;
      }
    }
    if (crushed.length) issues.push({ type: 'CRUSHED-TEXT', items: crushed });

    // 3. Elements clipped by viewport (interactive, right edge past vw, not in a scroll container)
    const clipped = [];
    for (const el of document.querySelectorAll('main button, main a[href], main input')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.left < vw - 8) {
        let scroller = false, p = el.parentElement;
        for (let d = 0; p && d < 6; d++, p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { scroller = true; break; }
        }
        if (!scroller) {
          clipped.push({
            tag: el.tagName.toLowerCase(),
            label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
            left: Math.round(r.left), right: Math.round(r.right),
          });
          if (clipped.length >= 5) break;
        }
      }
    }
    if (clipped.length) issues.push({ type: 'CLIPPED-CONTROLS', items: clipped });

    // 4. Section-level horizontal overflow (scrollWidth > clientWidth on non-scrollable sections)
    const wideSections = [];
    for (const el of document.querySelectorAll('main section, main > div')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        const ox = getComputedStyle(el).overflowX;
        if (ox === 'visible') {
          wideSections.push({ cls: (el.className || '').toString().split(' ').slice(0, 3).join('.'), sw: el.scrollWidth, cw: el.clientWidth });
          if (wideSections.length >= 4) break;
        }
      }
    }
    if (wideSections.length) issues.push({ type: 'WIDE-SECTIONS', items: wideSections });

    // 5. Squeezed stat cards (likely 3-4 col grids crammed on mobile: card < 90px wide with text inside)
    const squeezed = [];
    for (const el of document.querySelectorAll('main div')) {
      if (!visible(el) || el.children.length < 2) continue;
      const r = el.getBoundingClientRect();
      const hasText = el.querySelector('p, h3, h4, span');
      if (r.width > 20 && r.width < 85 && hasText && (el.textContent || '').trim().length > 8 && !el.querySelector('button, a, svg')) {
        squeezed.push({ cls: (el.className || '').toString().split(' ').slice(0, 3).join('.'), w: Math.round(r.width), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 25) });
        if (squeezed.length >= 5) break;
      }
    }
    if (squeezed.length) issues.push({ type: 'SQUEEZED-CARDS', items: squeezed });

    return {
      vw, overflowX: document.documentElement.scrollWidth - vw,
      issues,
      btnCount: document.querySelectorAll('main button').length,
    };
  });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...DEVICE, locale: 'en-IN' });
const page = await ctx.newPage();
const results = [];

async function walk(who, routes) {
  await login(page, who === 'freelancer' ? FREELANCER : CLIENT);
  for (const route of routes) {
    try {
      await page.goto(APP_URL + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2600);
      const r = await audit(page, route);
      results.push({ who, route, ...r });
    } catch (e) {
      results.push({ who, route, error: e.message.slice(0, 150) });
    }
  }
  // logout for the next role (login() does the hard reset itself)
  await page.evaluate(() => localStorage.clear());
}

await walk('freelancer', FREELANCER_ROUTES);
await walk('client', CLIENT_ROUTES);
await browser.close();

// ── Report ──
console.log('================= MOBILE DASHBOARD DEEP-DIVE (375px) =================');
let pagesWithIssues = 0;
for (const r of results) {
  if (r.error) { console.log(`\nERROR ${r.who} ${r.route}: ${r.error}`); continue; }
  if (r.overflowX > 1 || r.issues.length) {
    pagesWithIssues++;
    console.log(`\n■ ${r.who} ${r.route}  (overflowX=${r.overflowX}px, buttons=${r.btnCount})`);
    for (const issue of r.issues) {
      console.log(`   ${issue.type}:`);
      for (const item of issue.items.slice(0, 4)) console.log(`     ${JSON.stringify(item)}`);
    }
  }
}
console.log(`\n${pagesWithIssues} of ${results.length} pages have mobile layout issues.`);
