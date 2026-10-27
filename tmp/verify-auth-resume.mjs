import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = ['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const out = [];
const log = (k,v)=>{ out.push([k,v]); console.log(`${v==='PASS'||v===true?'✓':'✗'} ${k}: ${v}`); };

async function ctxFor(role){
  return browser.newContext({ storageState: `.e2e/${role}.json`, viewport:{width:1440,height:900} });
}

for (const [role, modal, expect] of [['client','login','/client'],['freelancer','signup','/dashboard']]) {
  if (!fs.existsSync(`.e2e/${role}.json`)) { log(`${role} state missing`,'BLOCKED'); continue; }
  const ctx = await ctxFor(role);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?modal=${modal}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const path = new URL(page.url()).pathname;
  const body = await page.evaluate(() => document.body.innerText);
  log(`signed-in ${role} opening /?modal=${modal} -> ${path} (expected ${expect})`, path === expect ? 'PASS' : 'FAIL');
  log(`  provider buttons not shown to signed-in ${role}`, /Continue with GitHub/.test(body) ? 'FAIL' : 'PASS');
  await ctx.close();
}

// Logged-out control: the form MUST still appear.
{
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?modal=login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const body = await page.evaluate(() => document.body.innerText);
  log('logged-out visitor still gets the sign-in form', /Continue with GitHub/.test(body) ? 'PASS' : 'FAIL');

  // Brand surfaces on the public page.
  const logo = await page.evaluate(() => {
    const img = document.querySelector('header img[alt="Growlanzo"]');
    return img ? { src: img.getAttribute('src'), w: img.naturalWidth, h: img.naturalHeight } : null;
  });
  log(`header logo renders (${logo?.src})`, logo && logo.w > 0 ? 'PASS' : 'FAIL');
  log('footer shows the final brand email', /growlanzo\.own@gmail\.com/.test(body) ? 'PASS' : 'FAIL');
  await page.screenshot({ path: 'screenshots/shared_03_header_logo_v2.png', clip:{x:0,y:0,width:1440,height:220} });
  await ctx.close();
}

await browser.close();
const fails = out.filter(([,v])=>v==='FAIL').length;
console.log(`\nfails=${fails}`);
fs.writeFileSync('tmp/auth-resume-results.json', JSON.stringify(out,null,2));
process.exit(fails?2:0);
