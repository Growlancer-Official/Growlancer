// Live fresh signup test — verify real email-verification flow works
// Raw GoTrue signup response returns user fields at TOP LEVEL (not wrapped in .user)
// Expected with Confirm email ON + working email delivery:
//   - HTTP 200
//   - NO access_token / session (user must confirm email first)
//   - email_confirmed_at = null
//   - confirmation_sent_at IS SET (confirmation email was sent!)
//   - no "Error sending confirmation email" error
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const getEnv = (key) => {
  const line = env.split('\n').find((l) => l.startsWith(key + '='));
  if (!line) return '';
  return line.slice(key.length + 1).trim().replace(/\r$/, '');
};

const ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');
const URL = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL') || 'https://zttwsjehcgaicziqyxpq.supabase.co';

if (!ANON_KEY) {
  console.error('NO_ANON_KEY — .env me VITE_SUPABASE_ANON_KEY nahi mila');
  process.exitCode = 1;
} else {
  const email = 'diag.verify.' + Date.now().toString(36) + '@gmail.com';
  const res = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'TestPass123!',
      data: { name: 'Verify Diag', role: 'freelancer' },
    }),
  });

  const j = await res.json().catch(() => ({}));
  console.log('HTTP:', res.status);
  console.log('RAW_RESPONSE:', JSON.stringify(j).slice(0, 900));

  const userId = j.id || j.user?.id;
  const confirmed = j.email_confirmed_at || j.user?.email_confirmed_at || null;
  const confSent = j.confirmation_sent_at || j.user?.confirmation_sent_at || null;
  const accessToken = j.access_token || j.session?.access_token || null;
  const errMsg = j.error_description || j.msg || j.error || null;
  const code = j.error_code || null;

  console.log('---PARSED---');
  console.log('user_id:', userId || '(none)');
  console.log('email_confirmed_at:', confirmed || 'NULL');
  console.log('confirmation_sent_at:', confSent || '(none)');
  console.log('access_token:', accessToken ? 'PRESENT' : 'absent ✓');
  console.log('error:', errMsg || '(none)');
  console.log('error_code:', code || '(none)');
  console.log('TEST_EMAIL:', email);

  const ok =
    res.status === 200 &&
    !!userId &&
    !accessToken &&
    !errMsg &&
    !confirmed &&
    !!confSent;
  console.log(
    'RESULT:',
    ok
      ? 'PASS ✅ Real verification flow working — confirmation email SENT, user must verify'
      : 'FAIL ❌ see details above'
  );
  process.exitCode = ok ? 0 : 1;
}
