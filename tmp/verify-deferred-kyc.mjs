// Verifies the deferred-verification change against the built app with the
// saved authenticated storage states: no Verification nav entry, both old
// paths redirect, the client completion meter renders, and no console errors.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const exec = [
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const browser = await chromium.launch({ executablePath: exec, headless: true });
const results = [];

async function visit(state, route, context) {
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(t)) errors.push(t.slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 200)));
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2600);
  const url = new URL(page.url()).pathname;
  const text = (await page.locator('body').innerText().catch(() => '')) || '';
  await ctx.close();
  return { route, url, text, errors };
}

// ── client ────────────────────────────────────────────────────────────────
const clientStates = await visit('.e2e/client.json', '/client', {});
const meterMatch = clientStates.text.match(/Profile (\d+)% complete/);
results.push(`client /client → ${clientStates.url} | meter=${meterMatch ? meterMatch[0] : 'MISSING'} | errors=${clientStates.errors.length}`);

const clientRedirect = await visit('.e2e/client.json', '/client/verification', {});
results.push(`client /client/verification → ${clientRedirect.url} (expect /client/settings) | errors=${clientRedirect.errors.length}`);

// ── freelancer ────────────────────────────────────────────────────────────
const freeProfile = await visit('.e2e/freelancer.json', '/dashboard/profile', {});
const freeMeter = freeProfile.text.match(/Profile (\d+)% complete/);
results.push(`freelancer /dashboard/profile → ${freeProfile.url} | meter=${freeMeter ? freeMeter[0] : 'MISSING'} | errors=${freeProfile.errors.length}`);

const freeRedirect = await visit('.e2e/freelancer.json', '/dashboard/identity-verification', {});
results.push(`freelancer /dashboard/identity-verification → ${freeRedirect.url} (expect /dashboard/profile) | errors=${freeRedirect.errors.length}`);

// ── nav has no Verification row on either dashboard ───────────────────────
for (const [role, stateFile, route] of [
  ['client', '.e2e/client.json', '/client'],
  ['freelancer', '.e2e/freelancer.json', '/dashboard'],
]) {
  const ctx = await browser.newContext({ storageState: stateFile, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2200);
  const navVerification = await page.getByRole('link', { name: /^Verification$/i }).count();
  const verifyChip = await page.getByText(/^Verify Now$/i).count();
  results.push(`${role} nav Verification links=${navVerification} (expect 0), Verify Now chip=${verifyChip} (expect 0)`);
  await ctx.close();
}

await browser.close();
console.log(results.join('\n'));
const failed = results.some((r) => /MISSING|expect 0|errors=[1-9]|PAGEERROR/.test(r) || /nav Verification links=[1-9]/.test(r));
process.exit(failed ? 1 : 0);
