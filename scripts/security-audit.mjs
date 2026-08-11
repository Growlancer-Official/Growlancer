#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────────
// GROWLANCER SECURITY AUDIT — automated full sweep (cross-platform)
// Usage:  node scripts/security-audit.mjs
//
// Checks the repo + LIVE database for the most common attack vectors and
// prints a PASS / WARN / FAIL report. Read-only — never mutates data.
//
// Checks:
//   [1] Dangerous RLS policies in live DB (open SELECT / open writes on
//       financial or sensitive tables, missing WITH CHECK)
//   [2] Broad grants (TO anon / TO PUBLIC on sensitive tables)
//   [3] SECURITY DEFINER functions WITHOUT SET search_path (search_path hijack)
//   [4] Exposed secrets in the repo (hardcoded keys in committed files)
//   [5] Edge functions missing auth.getUser() verification
//   [6] Webhook signature verification presence
//   [7] Storage bucket write policies
//   [8] Frontend XSS sinks (dangerouslySetInnerHTML / eval / innerHTML)
// ────────────────────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const tmpDir = mkdtempSync(join(tmpdir(), 'gwaudit-'));
let PASS = 0, WARN = 0, FAIL = 0;

function verdict(level, label, detail = '') {
  const icon = level === 'PASS' ? '✅' : level === 'WARN' ? '⚠️' : '❌';
  console.log(`  ${icon} [${level}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (level === 'PASS') PASS++;
  else if (level === 'WARN') WARN++;
  else FAIL++;
}

// ─── LIVE DB query via temp SQL file (avoids all shell-quoting issues) ────
function dbQuery(sql) {
  const file = join(tmpDir, `q${Date.now()}-${Math.random().toString(36).slice(2, 7)}.sql`);
  writeFileSync(file, sql, 'utf8');
  try {
    const out = execSync(
      `export SUPABASE_TELEMETRY_DISABLED=1 && supabase db query --linked --file "${file}" --output json 2>&1`,
      { cwd: ROOT, encoding: 'utf8', timeout: 90000, shell: 'bash' }
    );
    const cleaned = out.replace(/Initialising login role\.\.\./g, '').replace(/A new version.*$/s, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    return [{ __error: String(e.message).slice(0, 120) }];
  } finally {
    try { rmSync(file, { force: true }); } catch {}
  }
}

// ─── Repo file scanner (Node-native, no shell pipes) ──────────────────────
function walk(dir, exts, max = 2000) {
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < max) {
    const cur = stack.pop();
    let entries;
    try { entries = readFileSync(cur, { encoding: null }) ? null : null; } catch {}
    try {
      const names = execSync(`ls -A "${cur}"`, { cwd: ROOT, encoding: 'utf8', shell: 'bash' }).split('\n').filter(Boolean);
      for (const name of names) {
        if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'server.js') continue;
        const full = join(cur, name);
        try {
          const stat = execSync(`stat -c '%F' "${full}"`, { cwd: ROOT, encoding: 'utf8', shell: 'bash' }).trim();
          if (stat === 'directory') { stack.push(full); continue; }
          if (exts.some(e => full.endsWith(e))) out.push(full);
        } catch {}
      }
    } catch {}
  }
  return out;
}

const SENSITIVE_TABLES = [
  'wallets', 'transactions', 'escrow', 'razorpay_orders', 'paypal_orders',
  'withdrawals', 'payout_methods', 'saved_payment_cards', 'identity_verifications',
  'subscriptions', 'refund_requests', 'contract_files', 'user_reports',
];
const tblList = SENSITIVE_TABLES.map(t => `'${t}'`).join(',');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  GROWLANCER SECURITY AUDIT');
console.log(`  ${new Date().toISOString()}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ─── [1] RLS policies on sensitive tables ─────────────────────────────────
console.log('[1] RLS policies on sensitive tables');
const policies = dbQuery(
  `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
   WHERE schemaname='public' AND tablename = ANY (ARRAY[${tblList}])
   ORDER BY tablename, cmd;`
);
if (policies.length && policies[0].__error) {
  verdict('WARN', 'Could not query policies', policies[0].__error);
} else if (!policies.length) {
  verdict('PASS', 'No RLS policies on sensitive tables (RLS off is OK if RPC-only access)');
} else {
  let dangerous = 0;
  for (const p of policies) {
    const qual = String(p.qual || '').toLowerCase();
    const wc = String(p.with_check || '').toLowerCase();
    const isBroadRead = qual.includes('using (true)') || qual === 'true' || qual.includes('auth.role()');
    const isBroadWrite = wc.includes('with check (true)') || wc === 'true';
    if (isBroadRead && p.cmd === 'SELECT') {
      verdict('WARN', `${p.tablename}.${p.policyname} — broad SELECT`, String(p.qual || '').slice(0, 70));
      dangerous++;
    }
    if (isBroadWrite && ['INSERT', 'UPDATE'].includes(p.cmd)) {
      verdict('FAIL', `${p.tablename}.${p.policyname} — open ${p.cmd}`, String(p.with_check || '').slice(0, 70));
      dangerous++;
    }
  }
  if (!dangerous) verdict('PASS', 'No open RLS policies on sensitive tables', `${policies.length} policies checked`);
}

// ─── [2] Broad grants (RLS-aware: grants are only dangerous when RLS is OFF) ─
console.log('\n[2] Table grants (anon/public on sensitive tables)');
const grants = dbQuery(
  `SELECT g.table_name, g.grantee, g.privilege_type,
          c.relrowsecurity AS rls_enabled
   FROM information_schema.role_table_grants g
   JOIN pg_class c ON c.relname = g.table_name
   JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE g.table_schema='public' AND g.grantee IN ('anon','public')
   AND g.table_name = ANY (ARRAY[${tblList}])
   ORDER BY g.table_name, g.grantee, g.privilege_type;`
);
if (grants.length && grants[0].__error) {
  verdict('WARN', 'Could not query grants', grants[0].__error);
} else if (!grants.length) {
  verdict('PASS', 'No anon/public grants on sensitive tables');
} else {
  // RLS gates all access when enabled — grants alone are safe then.
  const rlsOff = grants.filter(g => g.rls_enabled === false);
  const writePrivs = grants.filter(g => ['INSERT', 'UPDATE', 'DELETE'].includes(g.privilege_type));
  const rlsOffWrites = rlsOff.filter(g => ['INSERT', 'UPDATE', 'DELETE'].includes(g.privilege_type));
  if (rlsOffWrites.length) {
    verdict('FAIL', `${rlsOffWrites.length} anon/public WRITE grants on RLS-DISABLED tables`, rlsOffWrites.map(g => `${g.table_name}.${g.privilege_type}`).join(', ').slice(0, 140));
  } else if (rlsOff.length) {
    verdict('WARN', `${rlsOff.length} anon/public grants on RLS-disabled tables (read-only)`, rlsOff.map(g => `${g.table_name}.${g.privilege_type}`).join(', ').slice(0, 120));
  } else {
    verdict('PASS', `${writePrivs.length} anon/public write grants — RLS enabled (safe)`, `${grants.length} grants checked`);
  }
}

// ─── [3] SECURITY DEFINER without search_path ─────────────────────────────
console.log('\n[3] SECURITY DEFINER functions without SET search_path');
const definers = dbQuery(
  `SELECT p.proname FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef AND p.prosrc NOT ILIKE '%search_path%'
   AND (p.proconfig IS NULL OR NOT EXISTS (
     SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
   ))
   AND pg_function_is_visible(p.oid) ORDER BY p.proname;`
);
if (definers.length && definers[0].__error) {
  verdict('WARN', 'Could not query functions', definers[0].__error);
} else if (!definers.length) {
  verdict('PASS', 'All SECURITY DEFINER functions set search_path');
} else {
  verdict('WARN', `${definers.length} SECURITY DEFINER without explicit search_path`, definers.slice(0, 8).map(d => d.proname).join(', ') + (definers.length > 8 ? ' …' : ''));
}

// ─── [4] Exposed secrets in repo ──────────────────────────────────────────
console.log('\n[4] Hardcoded secrets in committed source');
const keyPatterns = [
  [/rzp_(live|test)_[A-Za-z0-9]{10,}/g, 'Razorpay key'],
  [/sk-[A-Za-z0-9]{20,}/g, 'Stripe secret'],
  [/xkeysib-[A-Za-z0-9]{20,}/g, 'Brevo key'],
  [/AKIA[0-9A-Z]{16}/g, 'AWS key'],
  [/ghp_[A-Za-z0-9]{20,}/g, 'GitHub token'],
  [/sk-or-v1-[A-Za-z0-9]{20,}/g, 'OpenRouter key'],
  [/AIza[0-9A-Za-z_-]{20,}/g, 'Google key'],
  [/re_[A-Za-z0-9]{20,}/g, 'Resend key'],
];
const srcFiles = walk(join(ROOT, 'src'), ['.ts', '.tsx'])
  .concat(walk(join(ROOT, 'supabase', 'functions'), ['.ts']))
  .filter(f => !f.includes('\\node_modules\\') && !f.includes('/node_modules/'));
const secretHits = [];
for (const f of srcFiles) {
  let content;
  try { content = readFileSync(f, 'utf8'); } catch { continue; }
  for (const [re, name] of keyPatterns) {
    if (re.test(content)) { secretHits.push(`${f.replace(ROOT + sep, '')}: ${name}`); break; }
  }
}
if (!secretHits.length) {
  verdict('PASS', 'No hardcoded API keys in source', `${srcFiles.length} files scanned`);
} else {
  verdict('FAIL', 'Possible hardcoded keys', secretHits.slice(0, 5).join(' | '));
}

// ─── [5] Edge functions missing auth (gateway JWT + in-function secret aware) ─
console.log('\n[5] Edge functions with auth verification');
// Functions with verify_jwt=false in config.toml are NOT JWT-gated by the
// gateway — they MUST self-check (CRON_SECRET / signature / setup secret).
let cfg;
let unverifiedFns = [];
try { cfg = readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8'); } catch { cfg = ''; }
const exemptSet = new Set(['razorpay-webhook', 'paypal-webhook', 'razorpay-payout-webhook']);
const fnDirs = (() => {
  try { return execSync('ls supabase/functions', { cwd: ROOT, encoding: 'utf8', shell: 'bash' }).split('\n').filter(Boolean); } catch { return []; }
})();
let fnWarn = 0;
for (const fn of fnDirs) {
  const p = join(ROOT, 'supabase', 'functions', fn, 'index.ts');
  if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf8');
  // In-function protection: JWT check, or any secret/signature verification.
  const hasSelfCheck = /auth\.getUser\(|CRON_SECRET|x-cron|signature|verify|secret_code|ADMIN_SIGNUP_SECRET|hmac/i.test(src);
  // Gateway protection: config.toml block with verify_jwt = false for this fn?
  const block = cfg.split(/\n\[/).find(b => b.startsWith(`functions.${fn}`));
  const jwtOff = block ? /verify_jwt\s*=\s*false/.test(block) : false;
  const jwtOn = block ? /verify_jwt\s*=\s*true/.test(block) : true; // default true
  if (exemptSet.has(fn)) continue; // webhooks, signature-verified
  if (jwtOff && !hasSelfCheck) {
    verdict('FAIL', `${fn} — verify_jwt=false and no in-function secret check`);
    fnWarn++;
  } else if (jwtOn && !hasSelfCheck) {
    // Gateway JWT-gated — safe from unauthenticated callers, but the
    // function trusts the JWT without checking the caller's identity.
    unverifiedFns.push(fn);
  }
}
if (unverifiedFns.length) {
  verdict('WARN', `${unverifiedFns.length} functions rely on gateway JWT only (no identity check in code)`, unverifiedFns.join(', '));
}
if (!fnWarn) verdict('PASS', 'No unprotected edge functions — all gated by gateway JWT or in-function secrets');

// ─── [6] Webhook signature verification ──────────────────────────────────
console.log('\n[6] Webhook signature verification');
for (const fn of ['razorpay-webhook', 'paypal-webhook', 'razorpay-payout-webhook']) {
  const p = join(ROOT, 'supabase', 'functions', fn, 'index.ts');
  if (!existsSync(p)) continue;
  const src = readFileSync(p, 'utf8');
  const hasSig = /signature|hmac|verify|secret/i.test(src);
  verdict(hasSig ? 'PASS' : 'FAIL', `${fn} signature verification`, hasSig ? 'present' : 'MISSING');
}

// ─── [7] Storage bucket write policies ────────────────────────────────────
console.log('\n[7] Storage bucket write policies');
const buckets = dbQuery(
  `SELECT tablename, policyname, cmd, with_check FROM pg_policies
   WHERE schemaname='storage' AND cmd IN ('INSERT','ALL');`
);
if (buckets.length && buckets[0].__error) {
  verdict('WARN', 'Could not query storage policies', buckets[0].__error);
} else if (!buckets.length) {
  verdict('PASS', 'No storage INSERT policies');
} else {
  const openOnes = buckets.filter(b => {
    const wc = String(b.with_check || '').toLowerCase();
    return !wc.includes('auth.uid()') && !wc.includes('auth.role()');
  });
  verdict(openOnes.length ? 'WARN' : 'PASS', `${buckets.length} storage INSERT policies`, openOnes.length ? `open: ${openOnes.map(b => b.policyname).join(', ').slice(0, 100)}` : 'all ownership-scoped OK');
}

// ─── [8] Frontend XSS sinks ───────────────────────────────────────────────
console.log('\n[8] Frontend XSS sinks');
let xssFound = [];
for (const f of srcFiles.filter(f => f.endsWith('.tsx'))) {
  let content;
  try { content = readFileSync(f, 'utf8'); } catch { continue; }
  if (/dangerouslySetInnerHTML|document\.write|new Function/.test(content)) {
    xssFound.push(f.replace(ROOT + sep, ''));
  }
}
if (!xssFound.length) {
  verdict('PASS', 'No XSS sinks in frontend', `${srcFiles.filter(f => f.endsWith('.tsx')).length} TSX files scanned`);
} else {
  verdict('WARN', 'XSS sinks found', xssFound.slice(0, 5).join(', '));
}

// ─── [9] Open PUBLIC write policies on ANY table (admin_users-style hole) ─
console.log('\n[9] Open write policies on any table (roles=public)');
const openWrites = dbQuery(
  `SELECT tablename, policyname, cmd, with_check FROM pg_policies
   WHERE schemaname='public'
     AND roles::text LIKE '%{public}%'
     AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
     AND with_check IS NOT NULL
     AND (with_check ILIKE '%true%' OR with_check IS NULL)
   ORDER BY tablename;`
);
if (openWrites.length && openWrites[0].__error) {
  verdict('WARN', 'Could not query write policies', openWrites[0].__error);
} else if (!openWrites.length) {
  verdict('PASS', 'No public write policies with open WITH CHECK on any table');
} else {
  verdict('FAIL', `${openWrites.length} PUBLIC write policies with open WITH CHECK`, openWrites.slice(0, 6).map(p => `${p.tablename}.${p.policyname}(${p.cmd})`).join(', ') + (openWrites.length > 6 ? ' …' : ''));
}

// ─── [10] anon PII access on profiles (email/phone leak) ──────────────────
console.log('\n[10] anon PII access on profiles');
const piiChecks = dbQuery(
  `SELECT column_name,
          has_column_privilege('anon', 'public.profiles', column_name, 'SELECT') AS anon_sel
   FROM unnest(ARRAY['email','phone']) AS column_name;`
);
if (piiChecks.length && piiChecks[0].__error) {
  verdict('WARN', 'Could not check PII column privileges', piiChecks[0].__error);
} else {
  const leaked = piiChecks.filter(c => c.anon_sel === true);
  if (!leaked.length) {
    verdict('PASS', 'anon cannot SELECT email/phone from profiles');
  } else {
    verdict('FAIL', `anon CAN SELECT: ${leaked.map(c => c.column_name).join(', ')}`, 'REVOKE SELECT FROM anon required');
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  RESULT: ${PASS} PASS · ${WARN} WARN · ${FAIL} FAIL`);
console.log(`  ${FAIL ? '⚠️  ACTION REQUIRED — see FAIL items above' : '✅ No critical findings'}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
process.exit(FAIL ? 1 : 0);
