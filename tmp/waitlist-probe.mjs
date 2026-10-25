// Probe the /waitlist "Early Access" form against the deployed edge function.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const exec = [
  `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => p && fs.existsSync(p));

const browser = await chromium.launch({ executablePath: exec, headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();

const responses = [];
page.on('request', (r) => {
  if (r.url().includes('functions/v1/newsletter-subscribe')) console.log('REQUEST', r.method(), r.url());
});
page.on('response', async (r) => {
  if (r.url().includes('functions/v1/newsletter-subscribe')) {
    responses.push({ status: r.status(), acao: r.headers()['access-control-allow-origin'], body: await r.text().catch(() => '') });
  }
});
page.on('requestfailed', (r) => {
  if (r.url().includes('newsletter-subscribe')) console.log('REQUEST FAILED:', r.failure()?.errorText, r.url());
});
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 400)));

await page.goto('http://127.0.0.1:4175/waitlist', { waitUntil: 'networkidle' });
// Dismiss the cookie bar if it is covering the form.
for (const label of ['Accept', 'Accept all', 'Got it', 'I agree']) {
  const btn = page.getByRole('button', { name: label, exact: false }).first();
  if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => {}); break; }
}
await page.waitForTimeout(500);
const email = 'qa.audit.20261025@example.org';
await page.fill('input[type="email"]', email);
await page.click('button[type="submit"]');
await page.waitForTimeout(12000);

console.log('RESPONSES:', JSON.stringify(responses, null, 2));
console.log('BODY:', (await page.evaluate(() => document.body.innerText)).slice(0, 700));
await browser.close();
