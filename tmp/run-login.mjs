// Safe .env loader: values may contain shell metacharacters, so never source
// these files in bash. Sets process.env then runs the real login helper.
import fs from 'node:fs';

for (const file of ['.env', '.env.local', '.env.e2e']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

process.argv = [process.argv[0], 'scripts/e2e/login.mjs', '--all', '--base=http://127.0.0.1:4175'];
await import('../scripts/e2e/login.mjs');
