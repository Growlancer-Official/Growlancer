/**
 * End-to-end dashboard capture for Growlanzo — v2.
 *
 * Flow (all through the real UI, disposable E2E accounts):
 *   freelancer completes profile (so category matching can find them)
 *   -> client posts a DEMO project -> AI matches generated
 *   -> freelancer applies -> client accepts & hires
 *   -> both dashboards inspected and captured with assertions.
 *
 * A screenshot is written only after its assertion passes.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:4175';
const SHOTS = path.resolve('screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const EXEC = [
  'C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));

const DEMO = {
  title: 'E-commerce Store Redesign — DEMO',
  description:
    'DEMO/TEST project. Redesign our D2C storefront: homepage hero, product listing and checkout restyle. ' +
    'Deliverables: Figma file, responsive React implementation and a short handover call.',
  budget: '30000',
  categoryQuery: 'web',
  skill: 'React',
  rate: '1800',
  proposalRate: '28000',
  proposalDays: '18',
  proposalMessage:
    'DEMO/TEST proposal. I build React + TypeScript storefronts end to end, including Figma handoff and a responsive checkout pass. 18 days is realistic for both milestones.',
};

const report = { steps: [], shots: [], errors: [], data: {} };
const log = (m) => console.log(m);

async function waitText(page, re, timeout = 22000) {
  await page.waitForFunction(
    (src) => new RegExp(src, 'i').test(document.body.innerText),
    re.source,
    { timeout },
  );
}

async function capture(page, name, { fullPage = false, requireText } = {}) {
  if (requireText) await waitText(page, requireText, 15000);
  const file = path.join(SHOTS, name);
  await page.screenshot({ path: file, fullPage });
  const st = fs.statSync(file);
  const png = fs.readFileSync(file).subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (!png || st.size < 3000) throw new Error(`invalid ${name} (${st.size}B)`);
  report.shots.push({ name, bytes: st.size, fullPage, url: new URL(page.url()).pathname });
  log(`  📸 ${name} (${Math.round(st.size / 1024)} KB)`);
}

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctxs = {};

/** The cookie bar is fixed to the bottom and intercepts clicks on form submit. */
async function dismissConsent(page) {
  const reject = page.getByRole('button', { name: /Reject All/i });
  if (await reject.count().catch(() => 0)) {
    await reject.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(700);
  }
}
async function ctx(role, viewport = { width: 1440, height: 900 }) {
  if (!ctxs[role]) {
    ctxs[role] = await browser.newContext({ storageState: `.e2e/${role}.json`, viewport });
    ctxs[role].page = await ctxs[role].newPage();
    ctxs[role].errors = [];
    ctxs[role].page.on('pageerror', (e) => ctxs[role].errors.push(e.message.slice(0, 200)));
    await ctxs[role].page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await ctxs[role].page.waitForTimeout(2200);
    await dismissConsent(ctxs[role].page);
  }
  return ctxs[role];
}

async function goto(page, route, wait = 3500) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(wait);
}

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    report.steps.push({ name, status: 'PASS', ms: Date.now() - t });
    log(`✓ ${name}`);
  } catch (err) {
    report.steps.push({ name, status: 'FAIL', error: String(err.message).slice(0, 260), ms: Date.now() - t });
    log(`✗ ${name} — ${String(err.message).slice(0, 180)}`);
  }
}

// ─── 1. Freelancer profile setup (legitimate UI, required for matching) ────
{
  const { page } = await ctx('freelancer');
  await step('freelancer profile setup + save', async () => {
    await goto(page, '/dashboard/profile', 4500);
    await dismissConsent(page);
    const editBtn = page.getByRole('button', { name: /Edit Profile/i }).first();
    if (await editBtn.count()) await editBtn.click({ timeout: 10000 });
    await page.waitForTimeout(1200);
    await waitText(page, /Professional Title/, 20000);
    await page.getByPlaceholder(/Full Stack Developer/).fill('Full-Stack Developer');
    await page.getByPlaceholder('Tell clients about yourself...').fill(
      'DEMO/TEST freelancer profile. Full-stack developer building React + TypeScript storefronts and Supabase backends.',
    );
    await page.getByPlaceholder('50').fill(DEMO.rate);
    await page.getByPlaceholder('City, Country').fill('Pune, India');
    await page.getByPlaceholder('e.g., React, Node.js, Python').fill(DEMO.skill);
    await page.getByPlaceholder('e.g., React, Node.js, Python').press('Enter');
    await page.getByPlaceholder('e.g., English, Spanish').fill('English');
    await page.getByPlaceholder('e.g., English, Spanish').press('Enter');
    // Category — same search term the project will use, so matching can pair them.
    const catSearch = page.getByPlaceholder(/Search categories/);
    if (await catSearch.count()) {
      await catSearch.fill(DEMO.categoryQuery);
      await page.waitForTimeout(700);
      const row = page.locator('div.max-h-80 button[aria-pressed]').first();
      if (await row.count()) await row.click();
    }
    await page.getByRole('button', { name: /Save Changes/i }).first().click({ timeout: 15000 });
    await page.waitForTimeout(3500);
  });
  await step('profile persists after reload', async () => {
    await goto(page, '/dashboard/profile', 5000);
    const body = await page.locator('body').innerText();
    if (!/Full-Stack Developer/.test(body)) throw new Error('saved title not visible after reload');
  });
  await step('capture freelancer_04_profile.png', () =>
    capture(page, 'freelancer_04_profile.png', { fullPage: true, requireText: /Full-Stack Developer/ }),
  );
}

// ─── 2. Client posts the DEMO project ─────────────────────────────────────
{
  const { page } = await ctx('client');
  await step('client overview renders (identity + stats)', async () => {
    await goto(page, '/client', 5000);
    await waitText(page, /Welcome back/i, 22000);
    if (/\/login/.test(new URL(page.url()).pathname)) throw new Error('bounced to login');
  });
  await step('capture client_01_overview.png', () =>
    capture(page, 'client_01_overview.png', { requireText: /Profile \d+% complete/ }),
  );

  await step('DEMO project form filled', async () => {
    await goto(page, '/client/post', 4500);
    const title = page.getByPlaceholder(/React Native Mobile App/);
    await title.waitFor({ timeout: 20000 });
    await title.fill(DEMO.title);
    await page.locator('textarea').first().fill(DEMO.description);
    await page.getByPlaceholder('e.g., 10000').fill(DEMO.budget);
    await page.getByPlaceholder(/Search categories/).fill(DEMO.categoryQuery);
    await page.waitForTimeout(900);
    await page.locator('div.max-h-80 button[aria-pressed]').first().click();
    await page.waitForTimeout(400);
    if ((await title.inputValue()) !== DEMO.title) throw new Error('title input lost its value');
  });
  await step('capture client_02_post_project.png', () =>
    capture(page, 'client_02_post_project.png', { fullPage: true, requireText: /Basic Information/ }),
  );

  await step('submit DEMO project', async () => {
    await dismissConsent(page);
    await page.locator('form button[type="submit"]').first().click({ timeout: 20000 });
    await page.waitForTimeout(5000);
    const body = await page.locator('body').innerText();
    if (!/posted|success|E-commerce Store Redesign/i.test(body)) throw new Error('no success state after submit');
  });

  await step('DEMO project appears in My Projects', async () => {
    await goto(page, '/client/projects', 5000);
    await waitText(page, /E-commerce Store Redesign/, 22000);
    const href = await page.locator('a[href*="/client/matches?project_id="]').first().getAttribute('href');
    const m = /project_id=([0-9a-f-]{36})/.exec(href || '');
    if (!m) throw new Error('could not read project id');
    report.data.projectId = m[1];
  });

  await step('AI matches generate for the DEMO project', async () => {
    if (!report.data.projectId) throw new Error('no project id');
    await goto(page, `/client/matches?project_id=${report.data.projectId}`, 12000);
    await waitText(page, /E2E Freelancer|match/i, 25000);
    const body = await page.locator('body').innerText();
    if (!/E2E Freelancer/.test(body)) throw new Error('freelancer did not appear in generated matches');
  });
  await step('capture client_03_find_talent_matches.png', () =>
    capture(page, 'client_03_find_talent_matches.png', { requireText: /E2E Freelancer/ }),
  );
  await step('capture client_08_profile_settings.png', async () => {
    await goto(page, '/client/settings', 4500);
    await capture(page, 'client_08_profile_settings.png', { requireText: /Settings|Company|Account/i });
  });
}

// ─── 3. Freelancer applies to the DEMO project ────────────────────────────
{
  const { page } = await ctx('freelancer');
  await step('freelancer overview renders', async () => {
    await goto(page, '/dashboard', 5000);
    await waitText(page, /Welcome back/i, 22000);
  });
  await step('capture freelancer_01_overview.png', () =>
    capture(page, 'freelancer_01_overview.png', { requireText: /Welcome back/i }),
  );

  await step('project feed lists the DEMO project', async () => {
    await goto(page, '/dashboard/feed', 6000);
    await waitText(page, /E-commerce Store Redesign/, 25000);
  });
  await step('capture freelancer_02_project_feed.png', () =>
    capture(page, 'freelancer_02_project_feed.png', { requireText: /E-commerce Store Redesign/ }),
  );

  await step('submit proposal through the Apply modal', async () => {
    await page.getByRole('button', { name: /Apply Now/i }).first().click({ timeout: 20000 });
    await page.waitForTimeout(1500);
    await waitText(page, /Apply for Project/i, 15000);
    const rate = page.locator('input[placeholder="50"], input[placeholder="500"], input[placeholder="1800"]').first();
    await rate.fill(DEMO.proposalRate);
    await page.getByPlaceholder('14').fill(DEMO.proposalDays);
    await page.getByPlaceholder(/Introduce yourself/).fill(DEMO.proposalMessage);
    await page.getByRole('button', { name: /Apply Now/i }).last().click({ timeout: 20000 });
    await page.waitForTimeout(7000);
    await waitText(page, /E-commerce Store Redesign/, 25000);
  });
  await step('capture freelancer_03_proposals.png', () =>
    capture(page, 'freelancer_03_proposals.png', { requireText: /E-commerce Store Redesign/ }),
  );
  await step('capture freelancer_05_portfolio.png', async () => {
    await goto(page, '/dashboard/portfolio', 4000);
    await capture(page, 'freelancer_05_portfolio.png', { fullPage: true, requireText: /Portfolio/i });
  });
  await step('capture freelancer_08_wallet_test_data.png', async () => {
    await goto(page, '/dashboard/wallet', 4000);
    await capture(page, 'freelancer_08_wallet_test_data.png', { requireText: /Wallet/i });
  });
  await step('capture freelancer_09_invites.png', async () => {
    await goto(page, '/dashboard/invites', 4000);
    await capture(page, 'freelancer_09_invites.png', { requireText: /Invite/i });
  });
  await step('capture freelancer_10_notifications.png', async () => {
    await goto(page, '/dashboard/notifications', 4000);
    await capture(page, 'freelancer_10_notifications.png', { requireText: /Notification/i });
  });
}

// ─── 4. Client reviews the proposal and hires ─────────────────────────────
{
  const { page } = await ctx('client');
  await step('client proposals list shows the DEMO proposal', async () => {
    await goto(page, '/client/proposals', 5000);
    await waitText(page, /E-commerce Store Redesign/, 25000);
  });
  await step('capture client_04_received_proposals.png', () =>
    capture(page, 'client_04_received_proposals.png', { requireText: /E-commerce Store Redesign/ }),
  );

  await step('accept & hire the DEMO proposal', async () => {
    await page.getByRole('button', { name: /Accept & Hire/i }).first().click({ timeout: 20000 });
    await page.waitForTimeout(9000);
  });
  await step('capture client_05_contracts.png', async () => {
    await goto(page, '/client/contracts', 5000);
    await capture(page, 'client_05_contracts.png', { requireText: /E-commerce Store Redesign/ });
  });
  await step('capture client_06_workspace_milestones.png', async () => {
    await goto(page, '/client/workspace', 5000);
    await capture(page, 'client_06_workspace_milestones.png', { fullPage: true, requireText: /workspace|milestone|message/i });
  });
  await step('capture client_07_payments_test_mode.png', async () => {
    await goto(page, '/client/payments', 5000);
    await capture(page, 'client_07_payments_test_mode.png', { requireText: /payment|Escrow|₹|No /i });
  });
}

// ─── 5. Freelancer sees the contract ──────────────────────────────────────
{
  const { page } = await ctx('freelancer');
  await step('freelancer contract lists the DEMO project', async () => {
    await goto(page, '/dashboard/contracts', 5000);
    await waitText(page, /E-commerce Store Redesign/, 25000);
  });
  await step('capture freelancer_06_contracts.png', () =>
    capture(page, 'freelancer_06_contracts.png', { requireText: /E-commerce Store Redesign/ }),
  );
  await step('capture freelancer_07_workspace_milestones.png', async () => {
    await goto(page, '/dashboard/workspace', 5000);
    await capture(page, 'freelancer_07_workspace_milestones.png', { fullPage: true, requireText: /workspace|milestone|message/i });
  });
}

// ─── 6. Mobile overviews ──────────────────────────────────────────────────
for (const [role, route, name] of [
  ['client', '/client', 'shared_01_mobile_client_dashboard.png'],
  ['freelancer', '/dashboard', 'shared_02_mobile_freelancer_dashboard.png'],
]) {
  await step(`mobile ${role} overview`, async () => {
    const c = await browser.newContext({ storageState: `.e2e/${role}.json`, viewport: { width: 390, height: 844 } });
    const p = await c.newPage();
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2000);
    await dismissConsent(p);
    await goto(p, route, 5000);
    await waitText(p, /Welcome back/i, 22000);
    await capture(p, name, { fullPage: true, requireText: /Welcome back/i });
    await c.close();
  });
}

for (const [role, c] of Object.entries(ctxs)) report.errors.push(...(c.errors || []).map((e) => `${role} pageerror: ${e}`));
await browser.close();
fs.writeFileSync('tmp/capture-results.json', JSON.stringify(report, null, 2));
const pass = report.steps.filter((s) => s.status === 'PASS').length;
const fail = report.steps.filter((s) => s.status === 'FAIL').length;
log(`\nScreenshots: ${report.shots.length} | steps: ${pass} pass / ${fail} fail | pageerrors: ${report.errors.length}`);
log(`projectId=${report.data.projectId || 'none'}`);
process.exit(fail ? 2 : 0);
