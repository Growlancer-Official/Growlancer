// Check if GitHub and LinkedIn OIDC providers are enabled on the Supabase project.
// Hits the authorize endpoint with redirect:manual — a 302 to the provider
// (github.com / linkedin.com) means the provider is ENABLED.
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const getEnv = (key) => {
  const line = env.split('\n').find((l) => l.startsWith(key + '='));
  if (!line) return '';
  return line.slice(key.length + 1).trim().replace(/\r$/, '');
};

const ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');
const URL = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL') || 'https://zttwsjehcgaicziqyxpq.supabase.co';
// Same single knob as the rest of the backend (see _shared/site.ts). Fails closed
// on a malformed APP_URL so a broken value can never masquerade as a probe result.
const SITE_URL = (() => {
  const raw = (getEnv('APP_URL') || '').trim();
  if (!raw) return 'https://growlancer.com';
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) throw new Error('not http(s)');
    return u.origin;
  } catch {
    console.error(`❌ APP_URL is not an absolute http(s) URL: ${JSON.stringify(raw)}`);
    process.exit(1);
  }
})();
const REDIRECT = `${SITE_URL}/auth/callback`;

if (!ANON_KEY) {
  console.error('NO_ANON_KEY');
  process.exitCode = 1;
} else {
  for (const provider of ['github', 'linkedin_oidc']) {
    const res = await fetch(
      `${URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(REDIRECT)}`,
      { headers: { apikey: ANON_KEY }, redirect: 'manual' }
    );
    const loc = res.headers.get('location') || '';
    if (res.status === 302 && loc) {
      console.log(`${provider}: HTTP ${res.status} → ${loc.slice(0, 110)}  ✅ ENABLED`);
    } else {
      const body = await res.text().catch(() => '');
      console.log(`${provider}: HTTP ${res.status} ❌ ${body.slice(0, 160)}`);
    }
  }
}
