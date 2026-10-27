import { chromium } from 'playwright-core';
import fs from 'node:fs';
const id='d73121a4-2c61-4619-8c2e-6575c8a693cb';
const EXEC=['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'].find(p=>fs.existsSync(p));
const b=await chromium.launch({executablePath:EXEC,headless:true});
for (const [role,path] of [['client',`/client/workspace?contract=${id}`],['freelancer',`/dashboard/workspace?contract=${id}`]]) {
  const c=await b.newContext({storageState:`.e2e/${role}.json`,viewport:{width:1440,height:900}});
  const p=await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,150)));
  await p.goto('http://127.0.0.1:4175'+path,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(12000);
  const body=(await p.locator('body').innerText()).replace(/\n{2,}/g,'\n');
  console.log('===',role,'URL',p.url());
  console.log(body.slice(0,700));
  console.log('errors:',errs.slice(0,3));
  await c.close();
}
await b.close();
