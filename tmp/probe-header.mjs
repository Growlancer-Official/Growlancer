import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = ['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ storageState: '.e2e/client.json', viewport:{width:1440,height:900} });
const page = await ctx.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
const reqs = [];
page.on('request', r => { if (/supabase/.test(r.url())) reqs.push(r.url().replace(/\?.*/, '')); });

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

for (const t of [800, 1500, 3000, 6000]) {
  await page.waitForTimeout(t === 800 ? 800 : 700 + (t === 6000 ? 2300 : 0));
  const info = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    const header = document.querySelector('header');
    return {
      path: location.pathname,
      keys: keys.map(k => k.replace(/[A-Za-z0-9]{20,}/, '<id>')),
      headerText: header ? header.innerText.replace(/\n/g, ' | ') : null,
      hasPulseSkeleton: !!document.querySelector('header .animate-pulse'),
    };
  });
  console.log(`\n--- t≈${t}ms ---`);
  console.log(JSON.stringify(info, null, 2));
}

console.log('\n=== supabase requests ===');
console.log(reqs.slice(0, 12).join('\n'));
console.log('\n=== console (auth lines) ===');
console.log(logs.filter(l => /Auth|auth|session/i.test(l)).slice(0, 25).join('\n'));
await browser.close();
