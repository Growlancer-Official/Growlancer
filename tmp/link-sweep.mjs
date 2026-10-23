// Throwaway launch sweep: every static internal to="..." link must map to a
// route defined in src/routes.ts (params + catch-all wildcard handled).
import fs from 'node:fs';
import path from 'node:path';

const routes = fs.readFileSync('src/routes.ts', 'utf8');
const defined = [...routes.matchAll(/path:\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(f);
  }
  return out;
}

const hrefs = new Map();
for (const f of walk('src')) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/to=\{?["'`]([^"'`$}]+)["'`]/g)) {
    const h = m[1];
    if (h.startsWith('/')) hrefs.set(h, (hrefs.get(h) || []).concat(f));
  }
}

const patterns = defined.map((p) => p.replace(/:[^/]+/g, '[^/]+').replace(/\/\*$/, '.*'));
const re = new RegExp(`^(${patterns.join('|')})$`);
const deferred = /^\/(certificate|admin\/internships|internships|careers|contests)(\/|$)/;

const dead = [];
for (const [h, srcs] of hrefs) {
  if (!re.test(h) && !deferred.test(h)) dead.push(`${h} <- ${srcs[0]}`);
}

console.log('routes:', defined.size, 'static hrefs:', hrefs.size);
console.log('DEAD:', dead.length);
dead.slice(0, 25).forEach((d) => console.log('  ', d));
