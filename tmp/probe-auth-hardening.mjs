// Browser proof for the two new auth behaviours:
//  A) Provider mismatch — account made with LinkedIn, person clicks GitHub:
//     the callback must name LinkedIn, offer one click there, and send NO
//     request to GitHub; no duplicate account path is reachable.
//  B) 24h inactivity sign-out — the app must sign the person out, land them on
//     the login form, TELL them why, keep the provider buttons usable, and
//     leave no token behind.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
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

// ── A. Provider mismatch: signed up with LinkedIn, clicked GitHub ──────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Everything signInWithOAuth leaves behind before leaving for the provider
  // (the callback reads these when GoTrue bounces back with the duplicate error).
  await ctx.addInitScript(() => {
    localStorage.setItem('growlancer_oauth_provider', 'github');
    localStorage.setItem(
      'growlancer_oauth_pending',
      JSON.stringify({ provider: 'github', startedAt: Date.now() - 60000, role: 'freelancer' })
    );
  });

  const providerHits = [];
  let authorizeUrl = null;
  ctx.on('request', (req) => {
    const u = req.url();
    if (/github\.com|linkedin\.com/i.test(u)) providerHits.push(u);
  });
  // Stub the authorize endpoint so clicking "Continue" proves the TARGET
  // provider without hitting the real one.
  await ctx.route('**/auth/v1/authorize*', async (route) => {
    authorizeUrl = route.request().url();
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub</body></html>' });
  });

  const page = await ctx.newPage();
  await page.goto(
    `${BASE}/auth/callback?error=access_denied&error_code=user_already_exists&error_description=User+already+registered`,
    { waitUntil: 'domcontentloaded' }
  );

  let body = '';
  for (let i = 0; i < 100; i++) {
    body = await page.evaluate(() => document.body.innerText);
    if (/Your Growlanzo account is on/.test(body)) break;
    await page.waitForTimeout(100);
  }

  check('mismatch: names the provider the account is on', /Your Growlanzo account is on LinkedIn/.test(body));
  check('mismatch: explains no second account was created', /No second account was created/.test(body));
  check('mismatch: offers one click to the right provider', /Continue with LinkedIn/.test(body));
  check(
    'mismatch: does not stack the unfinished-sign-in retry modal',
    !/Try GitHub again|did not finish/i.test(body)
  );
  check('mismatch: never contacted a provider', providerHits.length === 0, providerHits.slice(0, 2).join(' '));

  const cta = page.locator('button', { hasText: 'Continue with LinkedIn' }).first();
  if (await cta.count()) {
    await cta.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  check('mismatch: retry goes to LinkedIn (the account provider)', !!authorizeUrl && /provider=linkedin_oidc/.test(authorizeUrl), authorizeUrl ? authorizeUrl.slice(0, 90) : 'no authorize request');
  check('mismatch: retry never goes to GitHub', !authorizeUrl || !/provider=github/.test(authorizeUrl));

  await ctx.close();
}

// ── B. 24h inactivity: signed out, told why, provider buttons usable ──────
{
  const ctx = await browser.newContext({
    storageState: `.e2e/client.json`,
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addInitScript(() => {
    // 25 hours since the last activity — past the 24h limit.
    localStorage.setItem('growlancer_last_activity', String(Date.now() - 25 * 60 * 60 * 1000));
  });

  const providerHits = [];
  ctx.on('request', (req) => {
    if (/github\.com|linkedin\.com/i.test(req.url())) providerHits.push(req.url());
  });

  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

  let body = '';
  let url = '';
  // The sign-out navigates the page (window.location.replace) — evaluate can
  // race that navigation, so treat a destroyed context as "still loading".
  const readBody = async () => {
    try {
      return await page.evaluate(() => document.body.innerText);
    } catch {
      return null;
    }
  };
  for (let i = 0; i < 120; i++) {
    const text = await readBody();
    if (typeof text === 'string') {
      body = text;
      url = page.url();
      if (/Signed out after 24 hours/.test(body)) break;
    }
    await page.waitForTimeout(100);
  }

  // The sign-out redirects to /?modal=login, and MainLayout then cleans the
  // param off the URL once the modal is open (same as every login deep link),
  // so assert on the modal itself, not on the param.
  check('idle timeout: the login form is open', /Welcome back/.test(body) && /Continue with GitHub/.test(body), url.replace(BASE, ''));
  check('idle timeout: says WHY it happened', /Signed out after 24 hours of inactivity/.test(body));
  check(
    'idle timeout: explains it is for safety and how to get back',
    /keeps your account and your payments safe/.test(body) && /land straight back in your dashboard/.test(body)
  );
  check(
    'idle timeout: provider buttons are right there to sign back in',
    /Continue with GitHub/.test(body) && /Continue with LinkedIn/.test(body)
  );
  check('idle timeout: nobody was sent to a provider', providerHits.length === 0);

  const storage = await page.evaluate(() => {
    const tokenKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.includes('-auth-token') && !k.endsWith('-user')) {
        const v = localStorage.getItem(k);
        if (v && v !== 'null' && v.length > 2) tokenKeys.push(k);
      }
    }
    return {
      tokenKeys,
      noticeLeft: localStorage.getItem('growlancer_logout_notice'),
    };
  });
  check('idle timeout: no token survived the sign-out', storage.tokenKeys.length === 0, storage.tokenKeys.join(','));
  check('idle timeout: the notice is shown once, then dropped', storage.noticeLeft === null);

  await ctx.close();
}

// ── C. Control: an active session must NOT be touched ─────────────────────
{
  const ctx = await browser.newContext({
    storageState: `.e2e/client.json`,
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('growlancer_last_activity', String(Date.now() - 60 * 1000)); // 1 min ago
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

  let body = '';
  let header = '';
  for (let i = 0; i < 100; i++) {
    body = await page.evaluate(() => document.body.innerText);
    header = await page.evaluate(() => document.querySelector('header')?.innerText || '');
    if (/\bDashboard\b/.test(header)) break;
    await page.waitForTimeout(100);
  }
  check('control: an active user stays signed in', /\bDashboard\b/.test(header));
  check('control: no inactivity notice for an active user', !/Signed out after 24 hours/.test(body));

  await ctx.close();
}

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed, ${fails.length} failed`);
fs.writeFileSync('tmp/probe-auth-hardening.json', JSON.stringify(results, null, 2));
process.exit(fails.length ? 2 : 0);
