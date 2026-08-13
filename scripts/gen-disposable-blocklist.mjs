// ────────────────────────────────────────────────────────────────────────────
// One-off generator: builds supabase/migrations/20261215000002_comprehensive_disposable_blocklist.sql
// from (a) a downloaded community disposable-email-domains list (pass path as argv[2])
// and (b) the curated client list in src/lib/disposableEmails.ts (union, deduped).
// Run: node scripts/gen-disposable-blocklist.mjs
// ────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs';

const COMMUNITY = process.argv[2] || '/tmp/growlancer/disposable.txt';
const CLIENT_LIST = 'src/lib/disposableEmails.ts';
const OUT = 'supabase/migrations/20261215000002_comprehensive_disposable_blocklist.sql';

// Valid domain: 2+ labels, letters/digits/hyphens, no leading/trailing hyphen.
const domainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const set = new Set();

// 1) Community list (actively maintained, ~8.2k domains)
for (const raw of readFileSync(COMMUNITY, 'utf8').split('\n')) {
  let d = raw.trim().toLowerCase();
  if (!d || d.startsWith('#')) continue;
  if (d.endsWith('.')) d = d.slice(0, -1);
  d = d.replace(/^\*\./, ''); // strip wildcard prefix
  if (domainRe.test(d)) set.add(d);
}

// 2) Curated client list (src/lib/disposableEmails.ts) — guarantees the
//    client-side fast list is always a strict subset of the server list.
const ts = readFileSync(CLIENT_LIST, 'utf8');
const start = ts.indexOf('export const DISPOSABLE_EMAILS');
const end = ts.indexOf('DISPOSABLE_EMAIL_SET');
const body = ts.slice(start, end);
for (const m of body.matchAll(/'([^']+)'/g)) {
  const d = m[1].toLowerCase();
  if (domainRe.test(d)) set.add(d);
}

const sorted = [...set].sort();
console.log(`Total domains: ${sorted.length} (community + curated, deduped)`);

// Group ~12 domains per line for readability
const lines = [];
for (let i = 0; i < sorted.length; i += 12) {
  const chunk = sorted.slice(i, i + 12).map(d => `'${d}'`).join(',');
  lines.push(`    ${chunk}${i + 12 < sorted.length ? ',' : ''}`);
}

const sql = `-- =============================================================================
-- 20261215000000_comprehensive_disposable_blocklist.sql
-- =============================================================================
-- Comprehensive disposable / temporary email blocklist (server-side).
-- Replaces the curated ~300-domain list with a full, actively-maintained
-- community dataset (${sorted.length.toLocaleString()} domains total) so no
-- known temp-mail / throwaway / fake-mail provider can slip through signup.
--
-- Sources (union, deduped, subdomain-aware):
--   • disposable-email-domains/disposable-email-domains (community, ~8.2k)
--   • src/lib/disposableEmails.ts (existing curated client list — guarantees
--     the client-side fast list stays a strict subset of this server list)
--
-- Enforcement points that use this function automatically (no other change):
--   • auth.users INSERT trigger (block_disposable_email_signup)
--   • newsletter-subscribe edge function
--   • SignupModal client-side pre-check via RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_disposable_email_domain(p_domain text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d text := lower(btrim(p_domain));
  pos int;
  domains text[] := ARRAY[
${lines.join('\n')}
  ];
BEGIN
  -- Walk up the subdomain chain: foo.bar.mailinator.com -> bar.mailinator.com -> mailinator.com
  LOOP
    IF d = ANY (domains) THEN
      RETURN true;
    END IF;
    pos := position('.' in d);
    IF pos = 0 THEN
      EXIT;
    END IF;
    d := substr(d, pos + 1);
  END LOOP;
  RETURN false;
END;
$$;

-- Re-grant to the roles that need it (function is IMMUTABLE + SECURITY DEFINER)
REVOKE ALL ON FUNCTION public.is_disposable_email_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_disposable_email_domain(text) TO authenticated, anon, service_role;
`;

writeFileSync(OUT, sql);
console.log(`Wrote ${OUT} (${(sql.length / 1024).toFixed(0)} KB)`);
