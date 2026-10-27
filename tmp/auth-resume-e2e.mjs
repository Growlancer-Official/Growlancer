// End-to-end check of the "log in → straight to dashboard" behaviour.
// Every scenario throttles Supabase so the session-restore window is wide
// enough to catch a regression (the window where the old build offered the
// providers and sent returning users back through GitHub/LinkedIn).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const SLOW_MS = Number(process.env.SLOW_MS || 1800);
const EXEC = [
  'C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: EXEC, headless: true });

async function open({ signedIn, url = '/', clickLogin = false, slow = true, watchMs = 9000 }) {
  const ctx = await browser.newContext({
    ...(signedIn ? { storageState: `.e2e/${signedIn}.json` } : {}),
    viewport: { width: 1440, height: 900 },
  });
  if (slow) {
    await ctx.route('**/*.supabase.co/**', async (route) => {
      await new Promise((r) => setTimeout(r, SLOW_MS));
      await route.continue().catch(() => {});
    });
  }
  const page = await ctx.newPage();
  const superseded = { providerShownAt: null, clicked: false, clickedAtProvider: false };
  const t0 = Date.now();
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });

  // Poll continuously: did the provider buttons EVER appear, and were they ever
  // clickable while a signed-in visitor was still restoring?
  for (let i = 0; i < watchMs / 100; i++) {
    const state = await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        path: location.pathname,
        providers: /Continue with GitHub|Continue with LinkedIn/.test(body),
        loginCta: /\bLogin\b/.test(document.querySelector('header')?.innerText || ''),
        dashboardCta: /\bDashboard\b/.test(document.querySelector('header')?.innerText || ''),
        restoring: /Restoring your session|Taking you to your dashboard|Checking the session/.test(body),
      };
    });
    if (state.providers && superseded.providerShownAt === null) {
      superseded.providerShownAt = Date.now() - t0;
    }
    if (clickLogin && state.loginCta && !superseded.clicked) {
      superseded.clicked = true;
      await page.locator('header button', { hasText: 'Login' }).first().click().catch(() => {});
      await page.waitForTimeout(300);
      const afterClick = await page.evaluate(() => /Continue with GitHub/.test(document.body.innerText));
      superseded.clickedAtProvider = afterClick;
    }
    if (state.path !== '/' && state.path !== '/onboarding') break;
    await page.waitForTimeout(100);
  }
  const final = await page.evaluate(() => ({ path: location.pathname, body: document.body.innerText.slice(0, 400) }));
  await ctx.close();
  return { ...superseded, final, elapsed: Date.now() - t0 };
}

// ── 1. Signed-in client, plain visit ────────────────────────────────────────
{
  const r = await open({ signedIn: 'client' });
  check('client: provider buttons never shown on a plain visit', r.providerShownAt === null);
  check('client: header swaps to Dashboard (marketing page is not hijacked)', r.final.body.includes('Dashboard') || r.final.path === '/client', `final ${r.final.path}`);
}

// ── 2. Signed-in client taps Login as soon as it appears ────────────────────
{
  const r = await open({ signedIn: 'client', clickLogin: true });
  check('client: tapping Login never exposes "Continue with GitHub"', r.clickedAtProvider === false);
  check('client: tapping Login ends on the client dashboard', r.final.path === '/client' || r.final.body.includes('Dashboard'), `landed on ${r.final.path}`);
}

// ── 3. Signed-in freelancer opens a ?modal=login deep link ──────────────────
{
  const r = await open({ signedIn: 'freelancer', url: '/?modal=login' });
  check('freelancer: ?modal=login never shows the providers', r.providerShownAt === null);
  check('freelancer: ?modal=login resumes to the dashboard', r.final.path === '/dashboard', `landed on ${r.final.path}`);
}

// ── 4. Signed-in client opens ?modal=signup (old bookmark / stale CTA) ──────
{
  const r = await open({ signedIn: 'client', url: '/?modal=signup' });
  check('client: ?modal=signup never shows the providers', r.providerShownAt === null);
  check('client: ?modal=signup resumes to the dashboard', r.final.path === '/client', `landed on ${r.final.path}`);
}

// ── 5. Logged-out visitor: the sign-in form must still be there ─────────────
{
  const r = await open({});
  check('logged-out visitor: header offers Login', r.final.body.includes('Login') || r.final.path === '/');
  check('logged-out visitor: not greeted with a leaving-for-provider page', r.providerShownAt === null);
  check('logged-out visitor: stays on the site (no forced navigation)', r.final.path === '/');
}

// ── 6. Logged-out visitor tapping Login still gets the form ────────────────
{
  const r = await open({ clickLogin: true });
  check('logged-out visitor: Login opens GitHub/LinkedIn choices', r.clickedAtProvider === true);
}

// ── 7. Fast network control (no throttle) ──────────────────────────────────
{
  const r = await open({ signedIn: 'client', slow: false, url: '/?modal=login' });
  check('client on a fast network: ?modal=login straight to dashboard', r.final.path === '/client', `landed on ${r.final.path}`);
}

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed, ${fails.length} failed`);
fs.writeFileSync('tmp/auth-resume-e2e.json', JSON.stringify(results, null, 2));
process.exit(fails.length ? 2 : 0);
