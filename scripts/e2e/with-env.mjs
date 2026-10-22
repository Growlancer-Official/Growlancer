// Loads .env.e2e / .env / .env.local into process.env (WITHOUT overriding
// already-set vars, so CI secrets still win) and runs the given command with
// that environment.
//
// Why this exists: the stored E2E passwords are crypto-random and contain
// shell metacharacters (`*`, `&`, `!`). A bash `set -a; . .env.e2e` expands
// them as globs/commands and the login then fails with "invalid credentials"
// that are actually correct. Parsing here is the only honest way to run these
// locally.
//
//   node scripts/e2e/with-env.mjs scripts/e2e/login.mjs --base=... --all

import fs from 'node:fs';
import { spawn } from 'node:child_process';

const ENV_FILES = ['.env.e2e', '.env', '.env.local'];

for (const file of ENV_FILES) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const [cmd, ...cmdArgs] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage: node scripts/e2e/with-env.mjs <script> [args...]');
  process.exit(2);
}

const child = spawn(cmd, cmdArgs, { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
