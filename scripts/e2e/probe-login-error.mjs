// One-off probe 2: track modal lifetime + navigations during wrong-credential login
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const CANDIDATES = [
  process.env.E2E_CHROME_PATH,
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const exec = CANDIDATES.find((p) => fs.existsSync(p));

const browser = await chromium.launch({ executablePath: exec, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const events = [];
page.on('console', (m) => {
  const t = m.text();
  if (!/GoTrueClient|_useSession|__loadSession|getSession\(\)/.test(t)) events.push(`[console:${m.type()}] ${t.slice(0, 160)}`);
});
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) events.push(`[NAVIGATED] ${f.url()}`);
});
page.on('request', (r) => {
  const u = r.url();
  if (!/supabase\.co\/rest|\.js|\.css|\.png|\.woff|\.svg|\.webp|fonts|_vite|telemetry/.test(u)) {
    events.push(`[req] ${r.method()} ${u.slice(0, 120)}`);
  }
});

await page.goto('http://localhost:5173/?modal=login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6500);
events.push('-- checkpoint: filling form --');

try {
  const b = page.locator('div.fixed.bottom-0 button').first();
  if (await b.isVisible({ timeout: 1200 })) await b.click();
} catch {}
await page.locator('input[type="email"]').first().fill('e2e-probe-user@gmail.com');
await page.locator('input[type="password"]').first().fill('DefinitelyWrong123!');
events.push('-- checkpoint: clicking Log In --');
await page.locator('button:has-text("Log In")').first().click();

let sawError = false;
for (let i = 0; i < 24; i++) {
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => ({
    modal: !!document.querySelector('.animate-scale-in'),
    hasWelcome: document.body.innerText.includes('Welcome back'),
    errText: (document.querySelector('.text-red-600, [role="alert"]') || {}).textContent || null,
  }));
  if (state.errText) { sawError = true; events.push(`[ERROR SHOWN] ${state.errText.slice(0, 120)}`); break; }
  if (!state.modal && i < 4) events.push(`[MODAL GONE at ${(i + 1) * 0.5}s]`);
}
console.log('sawError:', sawError);
console.log('=== EVENT TIMELINE ===');
events.forEach((e) => console.log(e));
await browser.close();
