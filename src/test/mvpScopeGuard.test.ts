import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Early-access scope guard — the regression net for the launch hardening.
 *
 * Every assertion here corresponds to a defect that was found in this repo, not
 * to a hypothetical. The failure mode these tests exist for is a *silent* one:
 * a deferred module that still answers a direct API call, a public route that
 * returns rows, a cron that charges a card while the product says billing is
 * off. A hidden navigation link is not a disable, so nothing below tests the UI.
 *
 * If a change makes one of these fail, the fix is to restore the guard in the
 * function (or move the module out of DEFAULTS in _shared/features.ts) — not to
 * delete the assertion.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const FEATURES = read('supabase/functions/_shared/features.ts');
const ADMIN_DATA = read('supabase/functions/admin-data/index.ts');
const INTERNSHIPS = read('supabase/functions/internship-applications/index.ts');
const CRON = read('supabase/functions/subscription-billing-cron/index.ts');
const KYC = read('supabase/functions/kyc-submit/index.ts');

const FUNCTIONS_DIR = path.join(ROOT, 'supabase/functions');

/** Every edge function entrypoint, by its `<function>/index.ts` path. */
function functionEntrypoints(dir: string = FUNCTIONS_DIR, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) functionEntrypoints(full, out);
    else if (entry.name === 'index.ts' && path.dirname(full) !== FUNCTIONS_DIR) out.push(full);
  }
  return out;
}

describe('deferred modules are fail-closed by default', () => {
  it('defaults every deferred feature to OFF', () => {
    const block = /const DEFAULTS[^=]*=\s*\{([\s\S]*?)\}/.exec(FEATURES);
    expect(block, 'DEFAULTS block not found in _shared/features.ts').not.toBeNull();
    const pairs = [...block![1].matchAll(/(\w+):\s*(true|false)/g)].map((m) => [m[1], m[2]] as const);
    expect(pairs.length).toBeGreaterThanOrEqual(5);
    expect(pairs.filter(([, v]) => v !== 'false').map(([k]) => k)).toEqual([]);
  });

  it('only an exact "true" enables a feature (a typo must never do it)', () => {
    expect(FEATURES).toMatch(/if \(raw === 'true'\) return true;/);
    expect(FEATURES).toMatch(/if \(raw === 'false'\) return false;/);
    expect(FEATURES).toMatch(/return DEFAULTS\[key\];/);
  });

  it('answers 410 Gone with no record data', () => {
    expect(FEATURES).toMatch(/status: 410/);
    expect(FEATURES).toMatch(/available: false/);
  });
});

describe('certificate verification no longer leaks applicant PII', () => {
  it('returns the disabled response instead of reading any row', () => {
    const start = ADMIN_DATA.indexOf('verify_certificate / verify_credential_qr (DEFERRED)');
    const end = ADMIN_DATA.indexOf('send_welcome_email (AUTHENTICATED');
    expect(start, 'deferred-route marker missing').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // Strip comments first: the branch's own explanation names the tables it
    // used to read, and a comment must never satisfy or fail a code assertion.
    const branch = ADMIN_DATA.slice(start, end).replace(/\/\/.*$/gm, '');

    expect(branch).toMatch(/featureDisabledResponse\(corsHeaders, 'certificates'\)/);
    // The old handler returned the full row, the raw token and the applicant's
    // internship_applications row. None of those reads may come back.
    expect(branch).not.toMatch(/\.from\(/);
    expect(branch).not.toMatch(/\.select\(/);
    expect(branch).not.toMatch(/internship_applications/);
    expect(branch).not.toMatch(/token:\s*tokenData/);
  });
});

describe('internships are closed at the API, not just in the UI', () => {
  it('rejects every method before the first database read', () => {
    const guard = INTERNSHIPS.indexOf("isFeatureEnabled('internships')");
    const firstRead = INTERNSHIPS.indexOf(".from('internship_applications')");
    expect(guard, 'internships guard missing').toBeGreaterThan(-1);
    expect(firstRead).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstRead);
  });

  it('cannot update an application from an email address alone', () => {
    // The reapply path keyed on `.eq('email', email)` and reset status/notes.
    // With the guard above the whole handler is unreachable while deferred.
    expect(INTERNSHIPS).toMatch(/featureDisabledResponse\(corsHeaders, 'internships'\)/);
  });
});

describe('subscription billing cannot charge while deferred', () => {
  const handler = CRON.slice(CRON.indexOf('serve(async (req: Request) => {'));

  it('returns before any gateway charge is attempted', () => {
    const guard = handler.indexOf("isFeatureEnabled('subscription_billing')");
    const charge = handler.indexOf('await attemptRenewalCharge');
    expect(guard, 'billing guard missing').toBeGreaterThan(-1);
    expect(charge).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(charge);
  });

  it('says explicitly that nothing was charged', () => {
    expect(handler).toMatch(/charged: false/);
    expect(handler).toMatch(/status: 503/);
  });
});

describe('KYC development mode cannot auto-verify in production', () => {
  it('requires an explicit deploy-time opt-in', () => {
    expect(KYC).toMatch(/const KYC_DEV_MODE_ALLOWED = Deno\.env\.get\('KYC_DEV_MODE_ALLOWED'\) === 'true';/);
  });

  it('downgrades a database development mode to production when not opted in', () => {
    expect(KYC).toMatch(/wantsDev && KYC_DEV_MODE_ALLOWED \? 'development' : 'production'/);
  });

  it('cannot reach the auto-verify adapter without the opt-in', () => {
    expect(KYC).toMatch(/if \(dbDevMode\) return KYC_DEV_MODE_ALLOWED \? devModeAdapter : null;/);
  });
});

describe('webhook functions can build their own CORS headers', () => {
  it('every function that calls getCorsHeaders imports it', () => {
    const offenders: string[] = [];
    for (const file of functionEntrypoints()) {
      const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      if (!/\bgetCorsHeaders\s*\(/.test(text)) continue;
      const importsIt =
        /import\s*\{[^}]*\bgetCorsHeaders\b[^}]*\}\s*from\s*'[^']*cors\.ts'/.test(text) ||
        /(function|const)\s+getCorsHeaders\b/.test(text);
      if (!importsIt) offenders.push(path.relative(ROOT, file));
    }
    // This is exactly the paypal-webhook bug: a ReferenceError thrown on the
    // OPTIONS preflight, before signature verification, for every request.
    expect(offenders, 'these functions call getCorsHeaders without defining/importing it').toEqual([]);
  });
});

describe('deferred modules are switched in one place', () => {
  it('no edge function reads FEATURE_* env directly', () => {
    const offenders = functionEntrypoints()
      .filter((file) => path.basename(path.dirname(file)) !== '_shared')
      .filter((file) => /Deno\.env\.get\(\s*['"`]FEATURE_/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
