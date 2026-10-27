/**
 * Final targeted captures:
 *  - client workspace opened from the contract row (a bare /workspace is empty)
 *  - freelancer workspace for the same contract
 *  - wallet after its data actually renders (the first shot caught the skeleton)
 *  - notifications/portfolio once more with the patched display name
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = ['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const REPORT_PATH = 'tmp/capture-results.json';
const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
const browser = await chromium.launch({ executablePath: EXEC, headless: true });

// Resolve the DEMO contract id with the service role (test data only).
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(String.fromCharCode(13), ''))
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const crow = await fetch(`${env.SUPABASE_URL}/rest/v1/contracts?project_id=eq.${report.data.projectId}&select=id`, { headers: H }).then((r) => r.json());
let contractId = Array.isArray(crow) && crow[0] ? crow[0].id : null;
report.data.contractId = contractId;
console.log('contract id resolved:', contractId ? contractId.slice(0, 8) + '…' : 'none');

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
  if (opts.requireText) await waitText(page, opts.requireText, opts.timeout || 30000);
  const file = `screenshots/${name}`;
  await page.screenshot({ path: file, fullPage: !!opts.fullPage });
  const bytes = fs.statSync(file).size;
  if (fs.readFileSync(file).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes < 3000) throw new Error(`invalid ${name}`);
  report.shots = report.shots.filter((s) => s.name !== name);
  report.shots.push({ name, bytes, fullPage: !!opts.fullPage, url: new URL(page.url()).pathname + new URL(page.url()).search, recaptured: true });
  console.log(`📸 ${name} (${Math.round(bytes / 1024)} KB)`);
}

let ok = 0, fail = 0;
const attempt = async (label, fn) => { try { await fn(); ok++; console.log('✓', label); } catch (e) { fail++; console.log('✗', label, '—', String(e.message).slice(0, 160)); } };

// 1. client: open the workspace from the contract row
{
  const { ctx, page } = await pageFor('client');
  await attempt('client workspace via contract row', async () => {
    if (!contractId) throw new Error('no DEMO contract found');
    await page.goto(`${BASE}/client/workspace?contract=${contractId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    if (!/workspace/.test(new URL(page.url()).pathname)) throw new Error(`not on workspace: ${page.url()}`);
    await waitText(page, /E-commerce Store Redesign/);
    await shoot(page, 'client_06_workspace_milestones.png', { fullPage: true, requireText: /E-commerce Store Redesign/ });
  });
  await ctx.close();
}

// 2. freelancer: wallet (real numbers, not the skeleton) + workspace for the same contract
{
  const { ctx, page } = await pageFor('freelancer');
  await attempt('wallet renders real balances', async () => {
    await page.goto(BASE + '/dashboard/wallet', { waitUntil: 'domcontentloaded' });
    await waitText(page, /Available/);
    await shoot(page, 'freelancer_08_wallet_test_data.png', { requireText: /Available/ });
  });
  if (contractId) {
    await attempt('freelancer workspace for the DEMO contract', async () => {
      await page.goto(`${BASE}/dashboard/workspace?contract=${contractId}`, { waitUntil: 'domcontentloaded' });
      await waitText(page, /E-commerce Store Redesign/);
      await shoot(page, 'freelancer_07_workspace_milestones.png', { fullPage: true, requireText: /E-commerce Store Redesign/ });
    });
  }
  await ctx.close();
}

await browser.close();
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nrecapture: ${ok} ok / ${fail} failed | contractId=${contractId || 'none'} | shots=${report.shots.length}`);
process.exit(fail ? 2 : 0);
