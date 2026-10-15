// Quick element probe — measures specific elements on a live page.
//
// Usage:
//   node scripts/e2e/probe.mjs --url=/ --selector="#waitlist-country" --width=390
//
// Prints tag, box, computed font-size, and whether it is inside a <label>.

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { DEVICES } from './devices.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.join('=') || 'true'];
  })
);

const CANDIDATES = [
  process.env.E2E_CHROME_PATH,
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const exec = CANDIDATES.find((p) => fs.existsSync(p));

// `--device=<name>` mirrors the EXACT context the audit uses (same UA, dpr,
// locale, timezone) so probe measurements are directly comparable.
const device = args.device ? DEVICES.find((d) => d.name === args.device) : null;
if (args.device && !device) throw new Error(`Unknown device: ${args.device}`);

const width = device ? device.width : Number(args.width || 390);
const height = device ? device.height : Number(args.height || 844);
const mobile = device ? device.mobile : width < 900;

const browser = await chromium.launch({ executablePath: exec, headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext(
  device
    ? {
        viewport: { width, height },
        deviceScaleFactor: device.dpr,
        isMobile: mobile,
        hasTouch: mobile,
        userAgent: mobile
          ? `Mozilla/5.0 (Linux; Android ${width < 400 ? '13' : '14'}; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36`
          : undefined,
        locale: 'en-IN',
        timezoneId: 'Asia/Kolkata',
      }
    : { viewport: { width, height }, isMobile: mobile, hasTouch: true }
);
const page = await context.newPage();
await page.goto(`http://localhost:5173${args.url || '/'}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !document.getElementById('boot-overlay'), { timeout: 15000 }).catch(() => {});
await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 80));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(300);

const result = await page.evaluate((selector) => {
  const els = Array.from(document.querySelectorAll(selector));
  const diag = {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    documentClientWidth: document.documentElement.clientWidth,
    visualViewportWidth: window.visualViewport ? Math.round(window.visualViewport.width) : null,
    visualViewportScale: window.visualViewport ? window.visualViewport.scale : null,
    smMatches: window.matchMedia('(min-width: 640px)').matches,
    xlMatches: window.matchMedia('(min-width: 1280px)').matches,
    bodyClientWidth: document.body.clientWidth,
  };
  const mapped = els.map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      outerHTML: el.outerHTML.slice(0, 200),
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.x),
      y: Math.round(r.y),
      fontSize: cs.fontSize,
      display: cs.display,
      position: cs.position,
      padding: cs.padding,
      height: cs.height,
      flex: cs.flex,
      alignItems: cs.alignItems,
      minHeight: cs.minHeight,
      maxHeight: cs.maxHeight,
      parentClass: el.parentElement?.getAttribute('class') || '',
      insideLabel: !!el.closest('label'),
      parentTag: el.parentElement?.tagName.toLowerCase(),
      visible: r.width > 0 && r.height > 0,
    };
  });
  return { diag, elements: mapped };
}, args.selector || 'body');

console.log(JSON.stringify(result, null, 2));
await browser.close();
