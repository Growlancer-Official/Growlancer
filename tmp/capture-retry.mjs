/**
 * Targeted re-capture for the two steps whose assertions raced the page load:
 *   - freelancer profile persistence (title after reload)
 *   - client AI matches screenshot (generation is async)
 * Merges results into tmp/capture-results.json.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = [
  'C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));
const report = JSON.parse(fs.readFileSync('tmp/capture-results.json', 'utf8'));
const browser = await chromium.launch({ executablePath: EXEC, headless: true });

const waitText = (page, re, timeout = 25000) =>
  page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText), re.source, { timeout });

async function pageFor(role) {
  const ctx = await browser.newContext({ storageState: `.e2e/${role}.json`, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const reject = page.getByRole('button', { name: /Reject All/i });
  if (await reject.count().catch(() => 0)) await reject.first().click({ timeout: 5000 }).catch(() => {});
  return { ctx, page };
}

async function capture(page, name, opts = {}) {
  if (opts.requireText) await waitText(page, opts.requireText);
  const file = `screenshots/${name}`;
  await page.screenshot({ path: file, fullPage: !!opts.fullPage });
  const bytes = fs.statSync(file).size;
  const png = fs.readFileSync(file).subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (!png || bytes < 3000) throw new Error(`invalid ${name}`);
  report.shots = report.shots.filter((s) => s.name !== name);
  report.shots.push({ name, bytes, fullPage: !!opts.fullPage, url: new URL(page.url()).pathname, recaptured: true });
  console.log(`📸 ${name} (${Math.round(bytes / 1024)} KB)`);
}

function markStep(name, status, error) {
  const s = report.steps.find((x) => x.name === name);
  if (s) Object.assign(s, { status, error: error ? String(error).slice(0, 260) : undefined });
  else report.steps.push({ name, status, error });
}

// 1. profile persistence + screenshot
{
  const { ctx, page } = await pageFor('freelancer');
  try {
    await page.goto(BASE + '/dashboard/profile', { waitUntil: 'domcontentloaded' });
    await waitText(page, /Full-Stack Developer/);
    markStep('profile persists after reload', 'PASS');
    await capture(page, 'freelancer_04_profile.png', { fullPage: true, requireText: /Full-Stack Developer/ });
    markStep('capture freelancer_04_profile.png', 'PASS');
  } catch (e) {
    markStep('profile persists after reload', 'FAIL', e.message);
    markStep('capture freelancer_04_profile.png', 'FAIL', e.message);
  }
  await ctx.close();
}

// 2. matches screenshot
{
  const projectId = report.data.projectId;
  const { ctx, page } = await pageFor('client');
  try {
    if (!projectId) throw new Error('no project id');
    await page.goto(`${BASE}/client/matches?project_id=${projectId}`, { waitUntil: 'domcontentloaded' });
    await waitText(page, /E2E Freelancer/, 40000);
    markStep('AI matches generate for the DEMO project', 'PASS');
    await capture(page, 'client_03_find_talent_matches.png', { requireText: /E2E Freelancer/ });
    markStep('capture client_03_find_talent_matches.png', 'PASS');
  } catch (e) {
    markStep('AI matches generate for the DEMO project', 'FAIL', e.message);
    markStep('capture client_03_find_talent_matches.png', 'FAIL', e.message);
  }
  await ctx.close();
}

await browser.close();
fs.writeFileSync('tmp/capture-results.json', JSON.stringify(report, null, 2));
const fail = report.steps.filter((s) => s.status === 'FAIL').length;
console.log(`\nscreenshots=${report.shots.length} fails=${fail}`);
