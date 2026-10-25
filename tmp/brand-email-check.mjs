import { chromium } from 'playwright-core';
import fs from 'node:fs';

const exec = [
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const browser = await chromium.launch({ executablePath: exec, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

await page.goto('http://127.0.0.1:4175/', { waitUntil: 'networkidle' });
const home = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    newEmail: (text.match(/growlancer\.own@gmail\.com/g) || []).length,
    oldEmail: (text.match(/(support|admin)@growlanzo\.com/g) || []).length,
    footerEmail: document.querySelector('a[href^="mailto:growlancer.own@gmail.com"]')?.textContent?.trim(),
  };
});
console.log('HOME', JSON.stringify(home));

await page.goto('http://127.0.0.1:4175/login', { waitUntil: 'networkidle' });
const li = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /Continue with LinkedIn/.test(b.textContent || ''));
  if (!btn) return null;
  const svg = btn.querySelector('svg');
  const paths = svg ? [...svg.querySelectorAll('path')].map((p) => getComputedStyle(p).fill) : [];
  return { label: btn.textContent.trim(), svg: !!svg, pathFills: paths, bg: getComputedStyle(btn).backgroundColor };
});
console.log('LINKEDIN', JSON.stringify(li));

await browser.close();
