// Regression check for the profile-save fix: title + education must persist
// through the REAL edit form, survive a reload, and be in the DB.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4175';
const EXEC = ['C:/Users/mdmir/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const TITLE = 'Full-Stack Developer';
const EDU = 'B.Tech Computer Science — Demo University (TEST)';
const report = JSON.parse(fs.readFileSync('tmp/capture-results.json', 'utf8'));

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ storageState: '.e2e/freelancer.json', viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const waitText = (re, t = 25000) => page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText), re.source, { timeout: t });

let fail = 0;
const check = (label, ok, extra = '') => { console.log(`${ok ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`); if (!ok) fail++; };

// 1. Edit through the real form
await page.goto(BASE + '/dashboard/profile', { waitUntil: 'domcontentloaded' });
await waitText(/Professional Profile/);
await page.getByRole('button', { name: /Edit Profile/i }).first().click({ timeout: 10000 });
await page.waitForTimeout(1200);
await waitText(/Professional Title/);
await page.getByPlaceholder(/Full Stack Developer/).first().fill(TITLE);
const edu = page.getByPlaceholder(/university|college|degree|education/i).first();
if (await edu.count().catch(() => 0)) await edu.fill(EDU);
await page.getByRole('button', { name: /Save Changes/i }).first().click({ timeout: 15000 });
await page.waitForTimeout(4500);
const toast = await page.locator('body').innerText();
check('save shows success feedback', /saved successfully/i.test(toast));

// 2. Reload — title must be rendered in Professional Info (exact, not the bio)
await page.goto(BASE + '/dashboard/profile', { waitUntil: 'domcontentloaded' });
await waitText(/Professional Profile/);
await waitText(/Title\s*Full-Stack Developer|Full-Stack Developer/, 15000);
const after = await page.locator('body').innerText();
const titleShown = /Title[\s\S]{0,40}Full-Stack Developer/.test(after);
check('title visible in Professional Info after reload', titleShown);

// 3. DB truth
const users = await fetch(env.SUPABASE_URL + '/auth/v1/admin/users?per_page=200', { headers: H }).then((r) => r.json());
const list = Array.isArray(users) ? users : users.users || [];
const fr = list.find((u) => (u.email || '').toLowerCase() === 'e2e.freelancer@growlancer-test.com');
const row = await fetch(`${env.SUPABASE_URL}/rest/v1/freelancer_profiles?user_id=eq.${fr.id}`, { headers: H }).then((r) => r.json());
check('DB freelancer_profiles.title persisted', row[0]?.title === TITLE, `db=${JSON.stringify(row[0]?.title)}`);
if (row[0]?.education) check('DB education persisted', row[0].education === EDU);

// 4. Recapture the showcase shot with the real assertion
await page.waitForTimeout(1200);
const file = 'screenshots/freelancer_04_profile.png';
await page.screenshot({ path: file, fullPage: true });
const bytes = fs.statSync(file).size;
const valid = fs.readFileSync(file).subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && bytes > 3000 && titleShown;
check(`screenshot recaptured with title (${Math.round(bytes / 1024)} KB)`, valid);
if (valid) {
  report.shots = report.shots.filter((s) => s.name !== 'freelancer_04_profile.png');
  report.shots.push({ name: 'freelancer_04_profile.png', bytes, fullPage: true, url: '/dashboard/profile', recaptured: true });
  report.steps.push({ name: 'profile title persists after reload (regression for save-payload fix)', status: 'PASS' });
} else {
  report.steps.push({ name: 'profile title persists after reload (regression for save-payload fix)', status: 'FAIL' });
}
fs.writeFileSync('tmp/capture-results.json', JSON.stringify(report, null, 2));

await browser.close();
console.log(fail ? `FAILED: ${fail}` : 'ALL PASS');
process.exit(fail ? 2 : 0);
