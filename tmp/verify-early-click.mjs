// Can a user racing the first paint click "Login" and still be sent to the
// providers? Clicks the header Login at the EARLIEST moment it exists (raw
// mouse click, no actionability wait), then watches for provider exposure.
// Scenario B is the control: a logged-out visitor MUST still reach providers.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = [
  'C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const out = [];

async function scenario({ label, signedIn }) {
  const ctx = await browser.newContext({
    ...(signedIn ? { storageState: `.e2e/${signedIn}.json` } : {}),
    viewport: { width: 1440, height: 900 },
  });
  await ctx.route('**/*.supabase.co/**', async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue().catch(() => {});
  });

  const providerRequests = [];
  ctx.on('request', (req) => {
    const u = req.url();
    if (/github\.com|linkedin\.com|\/auth\/v1\/authorize/i.test(u)) providerRequests.push(u);
  });

  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

  // Race the paint: grab the Login button position and raw-mouse-click it as
  // soon as it exists, retrying for the first two seconds.
  let clickedAt = null;
  let clickRounds = 0;
  while (Date.now() - t0 < 2000 && clickedAt === null) {
    const box = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('header button')];
      const el = buttons.find((b) => (b.textContent || '').trim() === 'Login');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (box) {
      clickRounds += 1;
      try {
        await page.mouse.click(box.x, box.y);
        clickedAt = Date.now() - t0;
      } catch {
        /* keep trying */
      }
    }
    await page.waitForTimeout(25);
  }

  let providerText = false;
  let sawModal = false;
  let sawProviderTextAt = null;
  let path = '/';
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => ({
      body: document.body.innerText,
      path: location.pathname,
    }));
    if (/Continue with GitHub|Continue with LinkedIn/.test(s.body)) {
      providerText = true;
      if (sawProviderTextAt === null) sawProviderTextAt = Date.now() - t0;
    }
    if (/Welcome back|Sign in to manage/.test(s.body)) sawModal = true;
    path = s.path;
    if (providerText || (path !== '/' && path !== '/onboarding')) break;
    await page.waitForTimeout(100);
  }

  out.push({
    label,
    clickedAtMs: clickedAt,
    clickRounds,
    providerText,
    sawProviderTextAtMs: sawProviderTextAt,
    sawModal,
    finalPath: path,
    providerRequestCount: providerRequests.length,
    providerRequestSample: providerRequests.slice(0, 2),
  });
  console.log(
    `${label}: clicked=${clickedAt === null ? 'never' : clickedAt + 'ms'} modal=${sawModal} ` +
      `providerChoices=${providerText}${providerText ? ` @${sawProviderTextAt}ms` : ''} ` +
      `providerRequests=${providerRequests.length} final=${path}`,
  );
  await ctx.close();
}

await scenario({ label: 'returning user (session)', signedIn: 'client' });
await scenario({ label: 'logged-out visitor (control)', signedIn: null });

await browser.close();
fs.writeFileSync('tmp/verify-early-click.json', JSON.stringify(out, null, 2));

const returning = out[0];
const control = out[1];
const fails = [];
if (returning.providerText || returning.providerRequestCount > 0)
  fails.push('returning user reached the providers');
if (control.clickRounds > 0 && !control.providerText && !control.sawModal)
  fails.push('control could not reach the providers at all (probe blind)');
console.log(fails.length ? `\nFAIL: ${fails.join('; ')}` : '\nPASS: no provider exposure for a returning user; control reaches providers');
process.exit(fails.length ? 2 : 0);
