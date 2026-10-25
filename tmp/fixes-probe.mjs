import { chromium } from 'playwright-core';
import fs from 'node:fs';

const exec = [
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const browser = await chromium.launch({ executablePath: exec, headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

await page.goto('http://127.0.0.1:4175/waitlist', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200); // let the cookie bar slide in

const geom = await page.evaluate(() => {
  const btn = document.querySelector('button[type="submit"]');
  const banner = document.querySelector('[class*="fixed bottom-0"]');
  const shell = document.querySelector('.min-h-screen');
  const b = btn?.getBoundingClientRect();
  const c = banner?.getBoundingClientRect();
  return {
    buttonBottom: b ? Math.round(b.bottom) : null,
    bannerTop: c ? Math.round(c.top) : null,
    bannerHeight: c ? Math.round(c.height) : null,
    overlaps: !!(b && c && b.bottom > c.top),
    bannerPresent: !!banner,
    cssVar: getComputedStyle(document.documentElement).getPropertyValue('--consent-banner-h'),
    shellPaddingBottom: shell ? getComputedStyle(shell).paddingBottom : null,
    scrollY: Math.round(window.scrollY),
    hitAtButtonCenter: (() => {
      if (!b) return null;
      const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return el ? el.tagName + '.' + String(el.className || '').slice(0, 40) : null;
    })(),
  };
});
console.log('GEOMETRY', JSON.stringify(geom));
const afterScroll = await page.evaluate(() => {
  window.scrollTo(0, document.body.scrollHeight);
  const btn = document.querySelector('button[type="submit"]');
  const b = btn?.getBoundingClientRect();
  const el = b ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
  return { scrollY: Math.round(window.scrollY), hit: el ? el.tagName : null };
});
console.log('AFTER_SCROLL', JSON.stringify(afterScroll));
await page.evaluate(() => window.scrollTo(0, 0));

await page.click('button[type="submit"]');
const text = await page.evaluate(() => document.body.innerText);
console.log('CLICK_WORKED', /Email is required/.test(text));

await page.goto('http://127.0.0.1:4175/unsubscribe?email=qa%40example.org', { waitUntil: 'networkidle' });
const unsub = await page.evaluate(() => ({
  path: location.pathname,
  notFound: /page not found/i.test(document.body.innerText),
  heading: document.querySelector('h1')?.textContent,
  mailto: document.querySelector('a[href^="mailto:"]')?.getAttribute('href'),
}));
console.log('UNSUBSCRIBE', JSON.stringify(unsub));

await browser.close();
