// Final consistency pass:
//  A) Set the professional Title through the real edit form, save, reload, verify in DB.
//  B) Recapture the freelancer screens that were shot BEFORE the display-name patch,
//     so every showcase frame has the same identity + the final demo state.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = ['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const report = JSON.parse(fs.readFileSync('tmp/capture-results.json', 'utf8'));
const TITLE = 'Full-Stack Developer';
const browser = await chromium.launch({ executablePath: EXEC, headless: true });

const waitText = (page, re, timeout = 30000) =>
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

async function shoot(page, name, route, { fullPage = false, requireRe, settle = 3500 }) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await waitText(page, requireRe);
  await page.waitForTimeout(settle);
  const file = `screenshots/${name}`;
  await page.screenshot({ path: file, fullPage });
  const bytes = fs.statSync(file).size;
  if (fs.readFileSync(file).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes < 3000) throw new Error(`invalid ${name}`);
  report.shots = report.shots.filter((s) => s.name !== name);
  report.shots.push({ name, bytes, fullPage, url: route, recaptured: true });
  console.log(`📸 ${name} (${Math.round(bytes / 1024)} KB)`);
}

let fail = 0;
const attempt = async (label, fn) => { try { await fn(); console.log('✓', label); } catch (e) { fail++; console.log('✗', label, '—', String(e.message).slice(0, 180)); } };

const { ctx, page } = await pageFor('freelancer');

// ── A) profile title through the real form ─────────────────────────────────
await attempt('set professional title via edit form', async () => {
  await page.goto(BASE + '/dashboard/profile', { waitUntil: 'domcontentloaded' });
  await waitText(page, /Professional Profile/);
  const editBtn = page.getByRole('button', { name: /Edit Profile/i }).first();
  if (await editBtn.count()) await editBtn.click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await waitText(page, /Professional Title/, 20000);
  const titleInput = page.getByPlaceholder(/Full Stack Developer/).first();
  await titleInput.fill(TITLE);
  // Re-fill the other fields from current DB values so Save cannot wipe them
  const bio = page.getByPlaceholder('Tell clients about yourself...');
  if (await bio.count()) {
    if (!(await bio.inputValue())) await bio.fill('DEMO/TEST freelancer profile. Full-stack developer building React + TypeScript storefronts and Supabase backends.');
    const rate = page.getByPlaceholder('50');
    if (await rate.count() && !(await rate.inputValue())) await rate.fill('1800');
    const loc = page.getByPlaceholder('City, Country');
    if (await loc.count() && !(await loc.inputValue())) await loc.fill('Pune, India');
    const skills = page.getByPlaceholder('e.g., React, Node.js, Python');
    if (await skills.count() && !(await skills.inputValue())) { await skills.fill('React'); await skills.press('Enter'); }
    const langs = page.getByPlaceholder('e.g., English, Spanish');
    if (await langs.count() && !(await langs.inputValue())) { await langs.fill('English'); await langs.press('Enter'); }
  }
  await page.getByRole('button', { name: /Save Changes/i }).first().click({ timeout: 15000 });
  await page.waitForTimeout(4000);
  // reload and verify the title is really shown in Professional Info
  await page.goto(BASE + '/dashboard/profile', { waitUntil: 'domcontentloaded' });
  await waitText(page, /Professional Profile/);
  await waitText(page, new RegExp(TITLE), 15000);
});

await attempt('capture freelancer_04_profile.png (named + titled)', () =>
  shoot(page, 'freelancer_04_profile.png', '/dashboard/profile', { fullPage: true, requireRe: new RegExp(TITLE) }));

// ── B) recapture the remaining pre-patch screens ───────────────────────────
await attempt('capture freelancer_02_project_feed.png', () =>
  shoot(page, 'freelancer_02_project_feed.png', '/dashboard/feed', { requireRe: /E-commerce Store Redesign/ }));
await attempt('capture freelancer_03_proposals.png (hired state)', () =>
  shoot(page, 'freelancer_03_proposals.png', '/dashboard/proposals', { requireRe: /E-commerce Store Redesign/ }));
await attempt('capture freelancer_05_portfolio.png', () =>
  shoot(page, 'freelancer_05_portfolio.png', '/dashboard/portfolio', { fullPage: true, requireRe: /E2E Freelancer/ }));
await attempt('capture freelancer_09_invites.png', () =>
  shoot(page, 'freelancer_09_invites.png', '/dashboard/invites', { requireRe: /E2E Freelancer/ }));
await attempt('capture freelancer_10_notifications.png', async () => {
  await page.goto(BASE + '/dashboard/notifications', { waitUntil: 'domcontentloaded' });
  await waitText(page, /New Project Match|Proposal|Contract/i, 20000);
  await page.waitForTimeout(2500);
  const file = 'screenshots/freelancer_10_notifications.png';
  await page.screenshot({ path: file });
  const bytes = fs.statSync(file).size;
  if (bytes < 3000) throw new Error('invalid');
  report.shots = report.shots.filter((s) => s.name !== 'freelancer_10_notifications.png');
  report.shots.push({ name: 'freelancer_10_notifications.png', bytes, fullPage: false, url: '/dashboard/notifications', recaptured: true });
  console.log(`📸 freelancer_10_notifications.png (${Math.round(bytes / 1024)} KB)`);
});

await ctx.close();
await browser.close();
fs.writeFileSync('tmp/capture-results.json', JSON.stringify(report, null, 2));
console.log(`done: fails=${fail} | shots=${report.shots.length}`);
process.exit(fail ? 2 : 0);
