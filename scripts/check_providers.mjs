// Check if Google and LinkedIn OIDC providers are enabled on the Supabase project.
// Hits the authorize endpoint with redirect:manual — a 302 to the provider
// (accounts.google.com / linkedin.com) means the provider is ENABLED.
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const getEnv = (key) => {
  const line = env.split('\n').find((l) => l.startsWith(key + '='));
  if (!line) return '';
  return line.slice(key.length + 1).trim().replace(/\r$/, '');
};

const ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');
const URL = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL') || 'https://zttwsjehcgaicziqyxpq.supabase.co';
const REDIRECT = 'https://growlancer-mrkhan154212s-projects.vercel.app/auth/callback';

if (!ANON_KEY) {
  console.error('NO_ANON_KEY');
  process.exitCode = 1;
} else {
  for (const provider of ['google', 'linkedin_oidc']) {
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
