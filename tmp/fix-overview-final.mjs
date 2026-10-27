// Final showcase recapture: both overviews + both mobile shots, AFTER the whole
// flow completed, so stats/name/demo records are consistent across all screens.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = ['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const report = JSON.parse(fs.readFileSync('tmp/capture-results.json', 'utf8'));
const browser = await chromium.launch({ executablePath: EXEC, headless: true });

const waitText = (page, re, timeout = 30000) =>
  page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText), re.source, { timeout });

async function shoot(role, name, route, { viewport = { width: 1440, height: 900 }, fullPage = false, requireRe }) {
  const ctx = await browser.newContext({ storageState: `.e2e/${role}.json`, viewport });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const reject = page.getByRole('button', { name: /Reject All/i });
  if (await reject.count().catch(() => 0)) await reject.first().click({ timeout: 5000 }).catch(() => {});
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await waitText(page, /Welcome back/i);
  await waitText(page, requireRe, 30000);      // demo data must be on screen
  await page.waitForTimeout(1800);             // let stat cards settle
  const file = `screenshots/${name}`;
  await page.screenshot({ path: file, fullPage });
  const bytes = fs.statSync(file).size;
  if (fs.readFileSync(file).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes < 3000) throw new Error(`invalid ${name}`);
  report.shots = report.shots.filter((s) => s.name !== name);
  report.shots.push({ name, bytes, fullPage, url: route, recaptured: true });
  console.log(`📸 ${name} (${Math.round(bytes / 1024)} KB)`);
  await ctx.close();
}

let fail = 0;
const attempt = async (label, fn) => { try { await fn(); console.log('✓', label); } catch (e) { fail++; console.log('✗', label, '—', String(e.message).slice(0, 160)); } };

await attempt('client overview (populated)', () =>
  shoot('client', 'client_01_overview.png', '/client', { requireRe: /E-commerce Store Redesign/ }));
await attempt('freelancer overview (named + populated)', () =>
  shoot('freelancer', 'freelancer_01_overview.png', '/dashboard', { requireRe: /E2E Freelancer/ }));
await attempt('mobile client overview', () =>
  shoot('client', 'shared_01_mobile_client_dashboard.png', '/client', { viewport: { width: 390, height: 844 }, fullPage: true, requireRe: /E-commerce Store Redesign/ }));
await attempt('mobile freelancer overview', () =>
  shoot('freelancer', 'shared_02_mobile_freelancer_dashboard.png', '/dashboard', { viewport: { width: 390, height: 844 }, fullPage: true, requireRe: /E2E Freelancer/ }));

await browser.close();
fs.writeFileSync('tmp/capture-results.json', JSON.stringify(report, null, 2));
console.log(`done: fails=${fail} | shots=${report.shots.length}`);
process.exit(fail ? 2 : 0);
