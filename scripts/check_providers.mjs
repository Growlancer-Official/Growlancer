// Provider-leg diagnostics for the GitHub / LinkedIn OIDC sign-in chain.
//
//   node scripts/check_providers.mjs
//
// WHY each leg is probed separately (founder reports, Oct 10 + Oct 14 2026 —
// "LinkedIn se signup nahi ho raha"): "provider is enabled" and "sign-in works"
// are different claims. The chain is
//
//   app → GoTrue /authorize → provider authorize page → (human consent)
//       → GoTrue /callback → session
//
// and it can stop at ANY of those. This script checks every leg the machine can
// check on its own and says which one is the stopping point, so nobody has to
// guess from a screenshot. The only leg it cannot check is the human consent
// click — that is stated in the output rather than implied.
import { readFileSync } from 'node:fs';

const env = (() => {
  try {
    return readFileSync('.env', 'utf8');
  } catch {
    return '';
  }
})();
const getEnv = (key) => {
  const fromFile = env.split('\n').find((l) => l.startsWith(key + '='));
  if (fromFile) return fromFile.slice(key.length + 1).trim().replace(/\r$/, '');
  return process.env[key] || '';
};

const ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');
// ⚠️ Do NOT name this `URL`: a module-level `const URL` shadows the global URL
// constructor, and the fail-closed APP_URL check below then throws
// "URL is not a constructor" on every run (which is exactly how this script
// silently reported nothing for weeks).
const SUPABASE_URL = (
  getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL') || 'https://zttwsjehcgaicziqyxpq.supabase.co'
).replace(/\/+$/, '');

// Same single knob as the rest of the backend (see _shared/site.ts). Fails closed
// on a malformed APP_URL so a broken value can never masquerade as a probe result.
const SITE_URL = (() => {
  const raw = (getEnv('APP_URL') || '').trim();
  if (!raw) return 'https://growlanzo.com';
  try {
    const parsed = new globalThis.URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('not http(s)');
    return parsed.origin;
  } catch {
    console.error(`❌ APP_URL is not an absolute http(s) URL: ${JSON.stringify(raw)}`);
    process.exit(1);
  }
})();
const REDIRECT = `${SITE_URL}/auth/callback`;

/** LinkedIn validates redirect_uri up front; GitHub validates it at token exchange. */
const PROBES_REDIRECT_URI_UP_FRONT = new Set(['linkedin_oidc']);

const PROVIDERS = [
  { id: 'github', host: 'github.com', name: 'GitHub' },
  { id: 'linkedin_oidc', host: 'linkedin.com', name: 'LinkedIn' },
];

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36';

if (!ANON_KEY) {
  console.error('❌ VITE_SUPABASE_ANON_KEY missing in .env — cannot probe /authorize.');
  process.exitCode = 1;
} else {
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Redirect target (app): ${REDIRECT}\n`);

  for (const provider of PROVIDERS) {
    console.log(`── ${provider.name} (${provider.id}) ─────────────────────────────`);

    // Leg 1 — is the provider enabled and does GoTrue redirect to it?
    const authorize = await fetch(
      `${SUPABASE_URL}/auth/v1/authorize?provider=${provider.id}&redirect_to=${encodeURIComponent(REDIRECT)}`,
      { headers: { apikey: ANON_KEY }, redirect: 'manual' }
    );
    const providerUrl = authorize.headers.get('location') || '';
    const enabled = authorize.status === 302 && providerUrl.includes(provider.host);
    console.log(
      enabled
        ? `  1. ENABLED  — GoTrue ${authorize.status} → ${new globalThis.URL(providerUrl).host}`
        : `  1. FAILED   — HTTP ${authorize.status} (provider may not be configured in Supabase)`
    );

    // Leg 2 — does the provider accept OUR client_id + registered redirect_uri?
    if (enabled) {
      try {
        const page = await fetch(providerUrl, {
          headers: { 'user-agent': BROWSER_UA },
          redirect: 'follow',
        });
        const html = await page.text();
        const finalUrl = page.url;
        const showsSignIn =
          /sign in|log in|authorize|consent|uas\/login/i.test(html) || /login|authorization/i.test(finalUrl);
        const rejectsRedirect = /redirect_uri does not match|invalid redirect/i.test(html);
        console.log(
          rejectsRedirect
            ? '  2. FAILED   — the provider rejects our redirect_uri (the Supabase callback URL is not registered)'
            : showsSignIn
              ? `  2. ACCEPTED — provider served its sign-in/consent page (${new globalThis.URL(finalUrl).host})`
              : `  2. UNCLEAR  — provider answered HTTP ${page.status} (${finalUrl.slice(0, 80)})`
        );
      } catch (err) {
        console.log(`  2. UNREACHABLE — ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Leg 3 — positive control, only where a real one exists. A provider that
    // validates the callback later (GitHub) cannot be controlled up front, and
    // claiming otherwise would be a false pass.
    if (enabled && !PROBES_REDIRECT_URI_UP_FRONT.has(provider.id)) {
      console.log(
        '  3. N/A      — this provider checks the callback at token exchange, so an up-front\n' +
          '                  control does not exist; use npm run e2e:oauth-signup for the full leg.'
      );
    } else if (enabled) {
      const bogus = providerUrl.replace(
        encodeURIComponent(`${SUPABASE_URL}/auth/v1/callback`),
        encodeURIComponent('https://growlancer-probe.invalid/callback')
      );
      if (bogus === providerUrl) {
        console.log('  3. SKIPPED  — could not build the negative-control URL');
      } else {
        try {
          const res = await fetch(bogus, { headers: { 'user-agent': BROWSER_UA }, redirect: 'follow' });
          const html = await res.text();
          const rejects = /redirect_uri does not match|invalid redirect/i.test(html);
          console.log(
            rejects
              ? '  3. CONTROL OK — a made-up redirect_uri is rejected, so leg 2 verified our real one'
              : '  3. CONTROL WEAK — the provider accepted a made-up redirect_uri; leg 2 proved nothing'
          );
        } catch (err) {
          console.log(`  3. CONTROL ERR — ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    console.log(
      '  4. HUMAN     — the consent click cannot be probed from here. If legs 1–3 pass and the\n' +
        '                  browser still returns without /callback, the stop is on the provider page\n' +
        '                  (sign-in prompt closed, blocked redirect, or the network).\n'
    );
  }

  console.log('Verify the callback leg end-to-end with:  npm run e2e:oauth-signup');
}
