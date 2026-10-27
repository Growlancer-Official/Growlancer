// Mints a real, server-verified session for the DEMO test accounts and writes
// Playwright storage states (.e2e/<role>.json). Provider-independent: uses the
// admin magic-link token + GoTrue verify, exactly what a real link does.
// Never prints key values or tokens.
import fs from 'node:fs';

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

const profiles = await fetch(
  `${URL_}/rest/v1/profiles?select=id,name,role&or=(name.ilike.*E2E*,name.ilike.*Demo*)&limit=10`,
  { headers: H },
).then((r) => r.json());
if (!Array.isArray(profiles)) { console.log('profile query failed'); process.exit(1); }

const users = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: H }).then((r) => r.json());
const emailById = new Map((users.users || []).map((u) => [u.id, u.email]));

for (const p of profiles) {
  const email = emailById.get(p.id);
  const role = p.role === 'client' ? 'client' : p.role === 'freelancer' ? 'freelancer' : null;
  if (!email || !role) { console.log('skip', p.name, p.role); continue; }

  const link = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ type: 'magiclink', email }),
  }).then((r) => r.json());
  const tokenHash = link.hashed_token;
  if (!tokenHash) { console.log('no token for', p.name, link.msg || link.error_description || '?'); continue; }

  const verify = await fetch(`${URL_}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
  }).then((r) => r.json());
  if (!verify.access_token) { console.log('verify failed for', p.name, verify.error_description || verify.msg || '?'); continue; }

  const session = {
    access_token: verify.access_token,
    token_type: 'bearer',
    expires_in: verify.expires_in,
    expires_at: verify.expires_at,
    refresh_token: verify.refresh_token,
    user: verify.user,
  };
  fs.writeFileSync(`.e2e/${role}.json`, JSON.stringify({
    cookies: [],
    origins: [{ origin: ORIGIN, localStorage: [
      { name: KEY, value: JSON.stringify(session) },
      { name: `${KEY}-user`, value: JSON.stringify({ user: verify.user }) },
    ] }],
  }, null, 2));
  const priv = await fetch(`${URL_}/rest/v1/profiles_private?select=onboarding_completed&id=eq.${p.id}`, { headers: H }).then((r) => r.json());
  console.log(`seeded ${role}:`, p.name, '| onboarding complete:', priv?.[0]?.onboarding_completed);
}
