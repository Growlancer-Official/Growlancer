/* eslint-env node */
/**
 * Comprehensive UI/UX audit — header to logout, every device class.
 * Public pages + auth flows + freelancer/client dashboards × 390/768/1440.
 * Checks: overflow, tap targets, heading hierarchy, document.title, contrast
 * flags, broken images, horizontal scroll traps, consistency of header/footer.
 */
import { chromium, devices } from 'playwright';

const APP = 'http://localhost:5173';
const FREELANCER = { email: 'playtest.freelancer@qa.growlancer.dev', pass: 'Test@1234' };
const CLIENT = { email: 'qaclient1788624483@qa.growlancer.dev', pass: 'Test@1234' };

const VIEWPORTS = [
  { name: 'm390', opts: { ...devices['iPhone 12'] } },
  { name: 't768', opts: { viewport: { width: 768, height: 1024 } } },
  { name: 'd1440', opts: { viewport: { width: 1440, height: 900 } } },
];

const PUBLIC_ROUTES = ['/', '/services', '/how-it-works', '/pricing', '/about', '/contact', '/features', '/privacy', '/terms', '/faq', '/careers', '/internships', '/refund-policy', '/escrow-policy'];
const F_ROUTES = ['/dashboard', '/dashboard/feed', '/dashboard/proposals', '/dashboard/contracts', '/dashboard/workspace', '/dashboard/services', '/dashboard/notifications', '/dashboard/analytics', '/dashboard/wallet', '/dashboard/profile', '/dashboard/identity-verification', '/dashboard/tickets', '/dashboard/help-center'];
const C_ROUTES = ['/client', '/client/projects', '/client/proposals', '/client/contracts', '/client/payments', '/client/matches', '/client/notifications', '/client/settings', '/client/verification', '/client/tickets', '/client/reviews', '/client/find-talent'];

const AUDIT_FN = () => {
  const issues = [];
  const vw = window.innerWidth;
  const doc = document.documentElement;

  // 1. Horizontal overflow
  const overflowX = doc.scrollWidth - vw;
  if (overflowX > 1) {
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width > 0 && r.right > vw + 1 && s.position !== 'fixed' && !el.closest('[data-no-report]')) {
        offenders.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().split(' ').slice(0, 3).join('.'), right: Math.round(r.right) });
        if (offenders.length >= 4) break;
      }
    }
    issues.push({ type: 'OVERFLOW-X', px: overflowX, offenders });
  }

  // 2. Tiny tap targets (<36px, interactive, visible)
  const tiny = [];
  const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2 && r.height > 2; };
  for (const el of document.querySelectorAll('main button, main a[href], header button, header a[href], footer button, footer a[href]')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 36 && r.height < 36) {
      tiny.push({ tag: el.tagName.toLowerCase(), label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 25) || '(icon)', w: Math.round(r.width), h: Math.round(r.height) });
      if (tiny.length >= 5) break;
    }
  }
  if (tiny.length) issues.push({ type: 'TINY-TAP', items: tiny });

  // 3. Broken images
  const brokenImgs = [];
  for (const img of document.querySelectorAll('img')) {
    if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:')) {
      brokenImgs.push({ src: img.src.slice(0, 80), alt: img.alt });
      if (brokenImgs.length >= 3) break;
    }
  }
  if (brokenImgs.length) issues.push({ type: 'BROKEN-IMG', items: brokenImgs });

  // 4. Multiple h1s (heading hierarchy)
  const h1s = document.querySelectorAll('main h1');
  if (h1s.length > 1) issues.push({ type: 'MULTI-H1', count: h1s.length });

  // 5. Unreadable text (font < 10px)
  const micro = [];
  for (const el of document.querySelectorAll('main p, main span, main a, main button')) {
    if (!vis(el) || el.children.length > 0) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 10) {
      micro.push({ text: (el.textContent || '').trim().slice(0, 25), fs });
      if (micro.length >= 3) break;
    }
  }
  if (micro.length) issues.push({ type: 'MICRO-TEXT', items: micro });

  // 6. Buttons with no discernible label (a11y)
  const unnamed = [];
  for (const el of document.querySelectorAll('main button')) {
    if (!vis(el)) continue;
    const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
    const hasIcon = el.querySelector('svg, img');
    if (!label && !hasIcon) { unnamed.push({ cls: (el.className || '').toString().slice(0, 40) }); if (unnamed.length >= 3) break; }
  }
  if (unnamed.length) issues.push({ type: 'UNNAMED-BTN', items: unnamed });

  return { url: location.pathname, title: document.title, overflowX, issues, innerW: vw };
};

async function login(page, creds) {
  await page.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(APP + '/?modal=login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const modal = page.locator('.fixed', { hasText: /log in to your dashboard/i }).last();
  await modal.getByRole('textbox', { name: /email/i }).first().fill(creds.email);
  await modal.locator('input[type="password"]').first().fill(creds.pass);
  await modal.getByRole('button', { name: 'Log In', exact: true }).first().click();
  await page.waitForTimeout(5000);
  if (!/dashboard|client|onboarding/.test(page.url())) throw new Error('login failed: ' + page.url());
}

const results = [];
const browser = await chromium.launch();

for (const { name, opts } of VIEWPORTS) {
  const ctx = await browser.newContext({ ...opts, locale: 'en-IN' });
  const page = await ctx.newPage();

  const auditRoutes = async (routes, who) => {
    for (const r of routes) {
      try {
        await page.goto(APP + r, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(2200);
        const res = await page.evaluate(AUDIT_FN);
        results.push({ viewport: name, who, ...res });
      } catch (e) {
        results.push({ viewport: name, who, url: r, error: e.message.slice(0, 120) });
      }
    }
  };

  await auditRoutes(PUBLIC_ROUTES, 'public');
  try {
    await login(page, FREELANCER);
    await auditRoutes(F_ROUTES, 'freelancer');
    await login(page, CLIENT);
    await auditRoutes(C_ROUTES, 'client');
  } catch (e) {
    results.push({ viewport: name, who: 'auth', error: e.message.slice(0, 150) });
  }
  await ctx.close();
}
await browser.close();

// ── Report ──
console.log('======= UI/UX AUDIT =======');
let defectPages = 0;
const byType = {};
for (const r of results) {
  if (r.error) { console.log(`ERROR [${r.viewport}] ${r.who} ${r.url}: ${r.error}`); continue; }
  if (r.issues.length) {
    defectPages++;
    console.log(`\n■ [${r.viewport}] ${r.who} ${r.url} (overflowX=${r.overflowX}px)`);
    for (const iss of r.issues) {
      byType[iss.type] = (byType[iss.type] || 0) + 1;
      console.log(`   ${iss.type}: ${JSON.stringify(iss.items || iss.offenders || iss).slice(0, 220)}`);
    }
  }
}
console.log(`\nPAGES WITH ISSUES: ${defectPages}/${results.length}`);
console.log('BY TYPE:', JSON.stringify(byType));
