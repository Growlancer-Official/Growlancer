// Probe: does the workspace EVER render for the pending, unfunded DEMO contract?
// Tries the contract-linked route + the bare route for both roles, with long waits.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = ['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const report = JSON.parse(fs.readFileSync('tmp/capture-results.json', 'utf8'));
const contractId = report.data.contractId;
const browser = await chromium.launch({ executablePath: EXEC, headless: true });

async function pageFor(role) {
  const ctx = await browser.newContext({ storageState: `.e2e/${role}.json`, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const reject = page.getByRole('button', { name: /Reject All/i });
  if (await reject.count().catch(() => 0)) await reject.first().click({ timeout: 5000 }).catch(() => {});
  return { ctx, page };
}

async function probe(label, role, route, shot) {
  const { ctx, page } = await pageFor(role);
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(9000);
  const body = await page.locator('body').innerText().catch(() => '');
  const main = body.replace(/\n{2,}/g, '\n').slice(0, 700);
  await page.screenshot({ path: shot }).catch(() => {});
  console.log(`\n### ${label} — ${route}`);
  console.log('spinner?', /animate-spin/i.test(await page.content().catch(() => '')));
  console.log('main text:\n' + main.split('\n').filter(Boolean).slice(0, 25).join(' | '));
  await ctx.close();
}

await probe('client linked', 'client', `/client/workspace?contract=${contractId}`, 'tmp/ws_client_linked.png');
await probe('client bare', 'client', '/client/workspace', 'tmp/ws_client_bare.png');
await probe('freelancer linked', 'freelancer', `/dashboard/workspace?contract=${contractId}`, 'tmp/ws_free_linked.png');
await probe('freelancer bare', 'freelancer', '/dashboard/workspace', 'tmp/ws_free_bare.png');

await browser.close();
console.log('\ndone, contractId=', contractId);
