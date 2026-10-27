import { chromium } from 'playwright-core';
import fs from 'node:fs';
const EXEC=['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'].find(p=>fs.existsSync(p));
const b=await chromium.launch({executablePath:EXEC,headless:true});
const cases=[
 ['client','/dashboard','freelancer dashboard'],
 ['freelancer','/client','client dashboard'],
 ['anon','/client','client dashboard (signed out)'],
 ['anon','/dashboard','freelancer dashboard (signed out)'],
];
for (const [role,route,label] of cases) {
  const opts = role==='anon'?{}:{storageState:`.e2e/${role}.json`};
  const c=await b.newContext({viewport:{width:1440,height:900},...opts});
  const p=await c.newPage();
  await p.goto('http://127.0.0.1:4175'+route,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(4500);
  const url=new URL(p.url()).pathname;
  const body=await p.locator('body').innerText();
  const leaked=/Welcome back, E2E Client|Welcome back, E2E Freelancer/.exec(body)?.[0] || 'none';
  console.log(`${role} -> ${route} (${label}) landed=${url} roleText=${leaked}`);
  await c.close();
}
await b.close();
