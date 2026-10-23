/* One-off: visually verify badge tooltips no longer overflow at 1920px. */
import { chromium } from 'playwright';

const APP_URL = 'http://localhost:5174';
const FREELANCER = { email: 'playtest.freelancer@qa.growlancer.dev', pass: 'Test@1234' };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 900 }, locale: 'en-IN' });
const page = await ctx.newPage();

await page.goto(`${APP_URL}/?modal=login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2200);
const email = page.getByRole('textbox', { name: /email/i }).first();
await email.waitFor({ state: 'visible', timeout: 15000 });
// Dismiss any overlay/interstitial (e.g. cookie banner or stale backdrop) intercepting clicks
  for (const sel of ['button:has-text("Accept")', 'button:has-text("Got it")', 'button:has-text("OK")']) {
    const b = page.locator(sel).first();
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 2000 }).catch(() => {}); }
  }
  await email.fill(FREELANCER.email);await page.locator('input[type="password"]').first().fill(FREELANCER.pass);
  await page.locator('input[type="password"]').first().press('Enter');
await page.waitForTimeout(3500);

await page.goto(`${APP_URL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// Find the header badge (the one nearest the right edge) and hover it.
const badge = page.locator('[role="img"][aria-label="KYC Verified"], [role="img"][aria-label="Growlanzo Pro Member"]').last();
const count = await badge.count();
console.log('badges found:', count);
if (count > 0) {
  await badge.last().hover();
  await page.waitForTimeout(500);
  const badgeBox = await badge.last().boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);
  console.log('badge box:', JSON.stringify(badgeBox), 'scrollY:', scrollY);
  const tip = badge.last().locator('[role="tooltip"]');
  const box = await tip.boundingBox().catch(() => null);
  console.log('tooltip box:', JSON.stringify(box));
  console.log('overflow right edge?', box ? (box.x + box.width > 1920 ? 'YES — STILL BROKEN' : 'no (fits)') : 'tooltip not measurable');
  await page.screenshot({ path: '.freebuff/tooltip-after-1920.png' });
} else {
  console.log('No verified/pro badge visible in header for this account — checking any badge on page instead');
  await page.screenshot({ path: '.freebuff/tooltip-after-1920.png' });
}

// Enumerate ALL tooltips on the page + their owner, to catch top-clipped ones
const allTips = await page.evaluate(() => {
  return [...document.querySelectorAll('[role="tooltip"]')].map(t => {
    const r = t.getBoundingClientRect();
    const owner = t.parentElement;
    return {
      text: (t.textContent || '').slice(0, 40),
      y: Math.round(r.y), h: Math.round(r.height), w: Math.round(r.width),
      x: Math.round(r.x),
      topClipped: r.y < 0,
      leftClipped: r.x < 0,
      rightClipped: r.x + r.width > window.innerWidth,
      vw: window.innerWidth,
      ownerCls: owner ? owner.className.split(' ').slice(0, 4).join('.') : '?',
      ownerY: owner ? Math.round(owner.getBoundingClientRect().y) : -1,
    };
  }).filter(t => t.w > 0);
});
console.log('all tooltips:', JSON.stringify(allTips, null, 1));

await browser.close();
console.log('done');
