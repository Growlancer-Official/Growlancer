#!/usr/bin/env node
/**
 * Early-access scope guard (CLI twin of src/test/mvpScopeGuard.test.ts).
 *
 * Why both: the vitest suite is the developer-facing guard, but a release
 * check must be runnable on its own — `npm run test:mvp-scope` — and must print
 * a human-readable PASS/FAIL per invariant for the release report. Neither is a
 * substitute for the other: this script is what the release manager runs, the
 * test is what CI cannot forget.
 *
 * Exit codes: 0 = every invariant holds, 1 = at least one FAIL.
 * No dependencies, no network, no credentials.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    if (detail === false) throw new Error('assertion returned false');
    results.push({ name, ok: true, detail: typeof detail === 'string' ? detail : '' });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

function functionEntrypoints(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...functionEntrypoints(full));
    else if (entry.name === 'index.ts' && path.basename(path.dirname(full)) !== '_shared') out.push(full);
  }
  return out;
}

const FEATURES = read('supabase/functions/_shared/features.ts');
const ADMIN_DATA = read('supabase/functions/admin-data/index.ts');
const INTERNSHIPS = read('supabase/functions/internship-applications/index.ts');
const CRON = read('supabase/functions/subscription-billing-cron/index.ts');
const KYC = read('supabase/functions/kyc-submit/index.ts');
const APP = read('src/app/App.tsx');

check('deferred features default to OFF', () => {
  const block = /const DEFAULTS[^=]*=\s*\{([\s\S]*?)\}/.exec(FEATURES);
  if (!block) throw new Error('DEFAULTS block missing');
  const on = [...block[1].matchAll(/(\w+):\s*(true|false)/g)].filter((m) => m[2] !== 'false');
  if (on.length) throw new Error('enabled by default: ' + on.map((m) => m[1]).join(', '));
  return 'all deferred modules off unless FEATURE_*_ENABLED=true';
});

check('certificate verification returns 410 with no PII', () => {
  const start = ADMIN_DATA.indexOf('verify_certificate / verify_credential_qr (DEFERRED)');
  const end = ADMIN_DATA.indexOf('send_welcome_email (AUTHENTICATED');
  if (start < 0 || end <= start) throw new Error('deferred-route branch not found');
  // Strip comments first: the branch's own explanation names the tables it used
  // to read, and a comment must never satisfy or fail a code assertion.
  const branch = ADMIN_DATA.slice(start, end).replace(/\/\/.*$/gm, '');
  if (/\.from\(|\.select\(|internship_applications|token:\s*tokenData/.test(branch)) {
    throw new Error('the public branch still reads certificate/applicant rows');
  }
  if (!/featureDisabledResponse\(corsHeaders, 'certificates'\)/.test(branch)) {
    throw new Error('410 response missing');
  }
  return 'no record read on the public path';
});

check('internship API is closed before its first DB read', () => {
  const guard = INTERNSHIPS.indexOf("isFeatureEnabled('internships')");
  const readAt = INTERNSHIPS.indexOf(".from('internship_applications')");
  if (guard < 0) throw new Error('guard missing');
  if (readAt < 0 || guard > readAt) throw new Error('guard is after the first read');
  return 'all methods 410; historical rows untouched';
});

check('subscription billing cannot charge while deferred', () => {
  const handler = CRON.slice(CRON.indexOf('serve(async (req: Request) => {'));
  const guard = handler.indexOf("isFeatureEnabled('subscription_billing')");
  const charge = handler.indexOf('await attemptRenewalCharge');
  if (guard < 0) throw new Error('guard missing');
  if (charge < 0 || guard > charge) throw new Error('a charge can be attempted before the guard');
  if (!/charged: false/.test(handler)) throw new Error('response does not state charged:false');
  return 'no gateway call can run while deferred';
});

check('KYC development mode needs an explicit deploy opt-in', () => {
  if (!/KYC_DEV_MODE_ALLOWED'\) === 'true'/.test(KYC)) throw new Error('opt-in flag missing');
  if (!/wantsDev && KYC_DEV_MODE_ALLOWED \? 'development' : 'production'/.test(KYC)) {
    throw new Error('database development mode is still honoured unconditionally');
  }
  if (!/if \(dbDevMode\) return KYC_DEV_MODE_ALLOWED \? devModeAdapter : null;/.test(KYC)) {
    throw new Error('auto-verify adapter reachable without the opt-in');
  }
  return 'dev auto-verify impossible without KYC_DEV_MODE_ALLOWED=true';
});

check('every getCorsHeaders caller imports it', () => {
  const offenders = [];
  for (const file of functionEntrypoints(path.join(ROOT, 'supabase/functions'))) {
    const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (!/\bgetCorsHeaders\s*\(/.test(text)) continue;
    const ok =
      /import\s*\{[^}]*\bgetCorsHeaders\b[^}]*\}\s*from\s*'[^']*cors\.ts'/.test(text) ||
      /(function|const)\s+getCorsHeaders\b/.test(text);
    if (!ok) offenders.push(path.relative(ROOT, file));
  }
  if (offenders.length) throw new Error(offenders.join(', '));
  return `${functionEntrypoints(path.join(ROOT, 'supabase/functions')).length} entrypoints checked`;
});

check('deferred public routes render the honest unavailable screen', () => {
  for (const route of ['internships', 'careers', 'certificate', 'verify-certificate']) {
    const re = new RegExp(`<Route path="${route}"[^>]*element=\\{<FeatureUnavailablePage />\\}`);
    if (!re.test(APP)) throw new Error(`/​${route} is not gated`);
  }
  if (/element=\{<InternshipsPage \/>\}|element=\{<CertificateVerifyPage \/>\}/.test(APP)) {
    throw new Error('a deferred page is still rendered by a route');
  }
  return 'internships, careers and certificate verification gated';
});

check('the scope decision is documented', () => {
  if (!exists('docs/MVP-SCOPE-AND-E2E-TEST-PLAN.md')) throw new Error('MVP scope doc missing');
  return 'docs/MVP-SCOPE-AND-E2E-TEST-PLAN.md present';
});

const width = Math.max(...results.map((r) => r.name.length));
console.log('\nGrowlancer early-access scope guard\n');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} invariants hold.`);
if (failed) {
  console.log('\nA FAIL here means a deferred module is still reachable. Fix the guard, not the check.\n');
  process.exit(1);
}
console.log('Scope guard: PASS\n');
