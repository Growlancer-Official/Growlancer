// Recapture the two workspace screenshots with a CORRECT assertion
// (the header says "Collaboration Workspace / Co-working with…", never the project title).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = ['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const report = JSON.parse(fs.readFileSync('tmp/capture-results.json', 'utf8'));
const contractId = report.data.contractId;
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

async function shoot(page, name, route, requireRe) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await waitText(page, requireRe);          // real workspace content, not the sidebar word
  await page.waitForTimeout(1500);          // let chat/assets panels settle
  const file = `screenshots/${name}`;
  await page.screenshot({ path: file, fullPage: true });
  const bytes = fs.statSync(file).size;
  if (fs.readFileSync(file).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes < 3000) throw new Error(`invalid ${name}`);
  report.shots = report.shots.filter((s) => s.name !== name);
  report.shots.push({ name, bytes, fullPage: true, url: route, recaptured: true });
  console.log(`📸 ${name} (${Math.round(bytes / 1024)} KB)`);
}

let fail = 0;
{
  const { ctx, page } = await pageFor('client');
  try {
    await shoot(page, 'client_06_workspace_milestones.png', `/client/workspace?contract=${contractId}`, /Collaboration Workspace|Project Chat Room/);
    console.log('✓ client workspace');
  } catch (e) { fail++; console.log('✗ client workspace —', String(e.message).slice(0, 160)); }
  await ctx.close();
}
{
  const { ctx, page } = await pageFor('freelancer');
  try {
    await shoot(page, 'freelancer_07_workspace_milestones.png', `/dashboard/workspace?contract=${contractId}`, /Collaboration Workspace|Project Chat Room/);
    console.log('✓ freelancer workspace');
  } catch (e) { fail++; console.log('✗ freelancer workspace —', String(e.message).slice(0, 160)); }
  await ctx.close();
}

await browser.close();
fs.writeFileSync('tmp/capture-results.json', JSON.stringify(report, null, 2));
console.log(`done: fails=${fail}`);
process.exit(fail ? 2 : 0);
