// Diagnose WHY the workspace main area is blank: console + pageerror + container HTML.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = ['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const report = JSON.parse(fs.readFileSync('tmp/capture-results.json', 'utf8'));
const contractId = report.data.contractId;
const browser = await chromium.launch({ executablePath: EXEC, headless: true });

const ctx = await browser.newContext({ storageState: '.e2e/client.json', viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message.slice(0, 500)));
page.on('requestfailed', (r) => logs.push('REQFAIL: ' + r.url().slice(0, 160) + ' — ' + (r.failure()?.errorText || '')));

await page.goto(`${BASE}/client/workspace?contract=${contractId}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(9000);

const diag = await page.evaluate(() => {
  const root = document.getElementById('root');
  const main = document.querySelector('main') || root;
  return {
    path: location.pathname + location.search,
    rootChildren: root ? root.children.length : -1,
    mainHTML: (main ? main.innerHTML : 'NO MAIN').slice(0, 1200),
    mainText: (main ? main.innerText : '').slice(0, 400),
  };
});
console.log('PATH:', diag.path, '| root children:', diag.rootChildren);
console.log('MAIN TEXT:', JSON.stringify(diag.mainText));
console.log('MAIN HTML (trimmed):', diag.mainHTML.slice(0, 800));
console.log('\nLOGS:');
for (const l of logs.slice(0, 20)) console.log(' ', l);
if (!logs.length) console.log('  (none)');

await browser.close();
