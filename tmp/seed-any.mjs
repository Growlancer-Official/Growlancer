// node tmp/seed-any.mjs <email> <role-file>
// Mints a REAL server-verified session (admin magic-link → GoTrue verify) for a
// disposable test account and writes .e2e/<role>.json. Never prints secrets.
import fs from 'node:fs';

const [email, roleFile] = process.argv.slice(2);
if (!email || !roleFile) {
  console.log('usage: node tmp/seed-any.mjs <email> <client|freelancer>');
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .map((l) => l.replace('\r', ''))
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim()]; }),
);
const URL_ = (env.SUPABASE_URL || env.VITE_SUPABASE_URL).replace(/\/+$/, '');
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const ORIGIN = 'http://127.0.0.1:4175';
const KEY = `sb-${new URL(URL_).host.split('.')[0]}-auth-token`;
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

const link = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
  method: 'POST', headers: H, body: JSON.stringify({ type: 'magiclink', email }),
}).then((r) => r.json());

const verify = await fetch(`${URL_}/auth/v1/verify`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
}).then((r) => r.json());

if (!verify.access_token) {
  console.log('verify failed:', verify.error_description || verify.msg || verify.error || '?');
  process.exit(1);
}

const session = {
  access_token: verify.access_token,
  token_type: 'bearer',
  expires_in: verify.expires_in,
  expires_at: verify.expires_at,
  refresh_token: verify.refresh_token,
  user: verify.user,
};

fs.writeFileSync(`.e2e/${roleFile}.json`, JSON.stringify({
  cookies: [],
  origins: [{ origin: ORIGIN, localStorage: [
    { name: KEY, value: JSON.stringify(session) },
    { name: `${KEY}-user`, value: JSON.stringify({ user: verify.user }) },
  ] }],
}, null, 2));

const profile = await fetch(`${URL_}/rest/v1/profiles?select=id,name,role,onboarding_completed&id=eq.${verify.user.id}`, { headers: H }).then((r) => r.json());
console.log(`seeded ${roleFile}:`, email, '| profile:', JSON.stringify(profile?.[0] || null));
