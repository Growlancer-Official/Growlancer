/**
 * 1. Gives the E2E freelancer its display name (the seed left profiles.name
 *    empty, so match/proposal cards honestly rendered the "Unknown" fallback).
 * 2. Re-captures the screens whose content shows that name.
 * Test-data only: the account is deleted by the teardown step.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = [
  'C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));
const REPORT_PATH = 'tmp/capture-results.json';
const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));

// ── 1. name the seeded freelancer ─────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const usersRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: H });
const usersBody = await usersRes.json();
const list = Array.isArray(usersBody) ? usersBody : usersBody.users || [];
const freelancer = list.find((u) => (u.email || '').toLowerCase() === 'e2e.freelancer@growlancer-test.com');
if (!freelancer) throw new Error('E2E freelancer not found');
const patch = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${freelancer.id}`, {
  method: 'PATCH', headers: H, body: JSON.stringify({ name: 'E2E Freelancer' }),
});
console.log('name patch:', patch.status);

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

async function shoot(page, name, opts = {}) {
  if (opts.requireText) await waitText(page, opts.requireText);
  const file = `screenshots/${name}`;
  await page.screenshot({ path: file, fullPage: !!opts.fullPage });
  const bytes = fs.statSync(file).size;
  if (fs.readFileSync(file).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes < 3000) throw new Error(`invalid ${name}`);
  report.shots = report.shots.filter((s) => s.name !== name);
  report.shots.push({ name, bytes, fullPage: !!opts.fullPage, url: new URL(page.url()).pathname, recaptured: true });
  console.log(`📸 ${name} (${Math.round(bytes / 1024)} KB)`);
}

// ── 2. recapture name-bearing screens ─────────────────────────────────────
let ok = 0, fail = 0;
async function tryStep(label, fn) {
  try { await fn(); ok++; console.log(`✓ ${label}`); }
  catch (e) { fail++; console.log(`✗ ${label} — ${String(e.message).slice(0, 160)}`); }
}

{
  const { ctx, page } = await pageFor('client');
  await tryStep('client matches with named freelancer', async () => {
    await page.goto(`${BASE}/client/matches?project_id=${report.data.projectId}`, { waitUntil: 'domcontentloaded' });
    await shoot(page, 'client_03_find_talent_matches.png', { requireText: /E2E Freelancer/ });
  });
  await tryStep('client proposals with named freelancer', async () => {
    await page.goto(BASE + '/client/proposals', { waitUntil: 'domcontentloaded' });
    await shoot(page, 'client_04_received_proposals.png', { requireText: /E2E Freelancer/ });
  });
  await tryStep('client contracts', async () => {
    await page.goto(BASE + '/client/contracts', { waitUntil: 'domcontentloaded' });
    await shoot(page, 'client_05_contracts.png', { requireText: /E-commerce Store Redesign/ });
  });
  await tryStep('client workspace', async () => {
    await page.goto(BASE + '/client/workspace', { waitUntil: 'domcontentloaded' });
    await shoot(page, 'client_06_workspace_milestones.png', { fullPage: true, requireText: /workspace|milestone|message/i });
  });
  await ctx.close();
}

{
  const { ctx, page } = await pageFor('freelancer');
  await tryStep('freelancer contracts', async () => {
    await page.goto(BASE + '/dashboard/contracts', { waitUntil: 'domcontentloaded' });
    await shoot(page, 'freelancer_06_contracts.png', { requireText: /E-commerce Store Redesign/ });
  });
  await tryStep('freelancer workspace', async () => {
    await page.goto(BASE + '/dashboard/workspace', { waitUntil: 'domcontentloaded' });
    await shoot(page, 'freelancer_07_workspace_milestones.png', { fullPage: true, requireText: /workspace|milestone|message/i });
  });
  await ctx.close();
}

await browser.close();
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nrecapture: ${ok} ok / ${fail} failed | shots=${report.shots.length}`);
process.exit(fail ? 2 : 0);
