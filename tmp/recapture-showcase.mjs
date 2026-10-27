/**
 * Recaptures the QA screenshot set against the CURRENT build so the showcase
 * shows the final logo + brand email. Each shot is taken to tmp/shots first and
 * only copied over screenshots/<name> when its assertion passed — a failed page
 * never replaces good evidence.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = ['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
const PROJECT = '7f873f05-5aca-4fa0-8248-d84a40728943';
const CONTRACT = 'c66345f8-5d4b-42cd-8c4f-80024628d5b7';

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

const SHOTS = [
  ['client', 'client_01_overview.png', '/client', /E2E Client/, false, false],
  ['client', 'client_02_post_project.png', '/client/post', /project title|post a project/i, false, false],
  ['client', 'client_03_find_talent_matches.png', `/client/matches?project_id=${PROJECT}`, /E2E Freelancer/, false, true],
  ['client', 'client_04_received_proposals.png', '/client/proposals', /E2E Freelancer/, false, false],
  ['client', 'client_05_contracts.png', '/client/contracts', /28,000|E-commerce/i, false, false],
  ['client', 'client_06_workspace_milestones.png', `/client/workspace?contract=${CONTRACT}`, /collaboration workspace|working with/i, true, false],
  ['client', 'client_07_payments_test_mode.png', '/client/payments', /payment/i, false, false],
  ['client', 'client_08_profile_settings.png', '/client/settings', /settings|profile/i, false, false],
  ['freelancer', 'freelancer_01_overview.png', '/dashboard', /E2E Freelancer/, false, false],
  ['freelancer', 'freelancer_02_project_feed.png', '/dashboard/feed', /E-commerce|projects/i, false, false],
  ['freelancer', 'freelancer_03_proposals.png', '/dashboard/proposals', /E-commerce|proposal/i, false, false],
  ['freelancer', 'freelancer_04_profile.png', '/dashboard/profile', /full-stack|E2E Freelancer/i, true, false],
  ['freelancer', 'freelancer_05_portfolio.png', '/dashboard/portfolio', /portfolio/i, false, false],
  ['freelancer', 'freelancer_06_contracts.png', '/dashboard/contracts', /E-commerce|28,000/i, false, false],
  ['freelancer', 'freelancer_07_workspace_milestones.png', `/dashboard/workspace?contract=${CONTRACT}`, /collaboration workspace|co-working with/i, true, false],
  ['freelancer', 'freelancer_08_wallet_test_data.png', '/dashboard/wallet', /available/i, false, false],
  ['freelancer', 'freelancer_09_invites.png', '/dashboard/invites', /invit/i, false, false],
  ['freelancer', 'freelancer_10_notifications.png', '/dashboard/notifications', /notification/i, false, false],
  ['client', 'shared_01_mobile_client_dashboard.png', '/client', /E2E Client/, false, false, { width: 390, height: 844 }],
  ['freelancer', 'shared_02_mobile_freelancer_dashboard.png', '/dashboard', /E2E Freelancer/, false, false, { width: 390, height: 844 }],
];

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const results = [];
const waitText = (page, re, timeout = 30000) =>
  page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText), re.source, { timeout });

const ctxByRole = {};
async function ctxFor(role, viewport) {
  const key = role + (viewport ? `-${viewport.width}` : '');
  if (!ctxByRole[key]) {
    ctxByRole[key] = await browser.newContext({
      storageState: `.e2e/${role}.json`,
      viewport: viewport || { width: 1440, height: 900 },
    });
  }
  return ctxByRole[key];
}

for (const [role, name, route, need, fullPage, slow, viewport] of SHOTS) {
  if (ONLY && !ONLY.includes(name)) continue;
  const ctx = await ctxFor(role, viewport);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
  let status = 'FAIL', detail = '';
  const tmpPath = `tmp/shots/${name}`;
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const reject = page.getByRole('button', { name: /Reject All/i });
    if (await reject.count().catch(() => 0)) await reject.first().click({ timeout: 4000 }).catch(() => {});

    await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    if (name === 'freelancer_03_proposals.png') {
      const hired = page.getByRole('button', { name: /hired/i });
      if (await hired.count().catch(() => 0)) await hired.first().click({ timeout: 4000 }).catch(() => {});
    }
    await waitText(page, need, slow ? 45000 : 30000);
    await page.waitForTimeout(800);

    await page.screenshot({ path: tmpPath, fullPage });
    const bytes = fs.statSync(tmpPath).size;
    const png = fs.readFileSync(tmpPath).subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
    if (!png || bytes < 3000) throw new Error('invalid image');
    fs.copyFileSync(tmpPath, `screenshots/${name}`);
    status = 'PASS';
    detail = `${Math.round(bytes / 1024)} KB`;
  } catch (e) {
    detail = String(e.message).slice(0, 150);
  }
  if (status !== 'PASS' && errors.length) detail += ` | console: ${errors[0]}`;
  results.push({ role, name, route, status, detail, fullPage: !!fullPage, viewport: viewport ? `${viewport.width}x${viewport.height}` : '1440x900' });
  console.log(`${status === 'PASS' ? '✓' : '✗'} ${name.padEnd(42)} ${status} ${detail}`);
  await page.close();
}

await browser.close();
fs.writeFileSync('tmp/recapture-results.json', JSON.stringify(results, null, 2));
const pass = results.filter((r) => r.status === 'PASS').length;
console.log(`\ncaptured ${pass}/${results.length} | ${new Date().toISOString()}`);
process.exit(pass === results.length ? 0 : 2);
