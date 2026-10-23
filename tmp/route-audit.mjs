// Launch audit: every static internal link must resolve to a real route.
// Routes are nested in App.tsx (relative paths), so the table is rebuilt from
// the JSX nesting rather than from a flat grep.
import fs from 'node:fs';
import path from 'node:path';

const app = fs.readFileSync('src/app/App.tsx', 'utf8');

// Tokens: opening/closing <Route …> in source order.
const tokenRe = /<Route\b([^>]*)>|<\/Route>/g;
const attrRe = /path=(?:"([^"]*)"|\{'([^']*)'\}|\{`([^`]*)`\})/;
const stack = [];
const routes = [];
let m;
while ((m = tokenRe.exec(app))) {
  if (m[0] === '</Route>') {
    stack.pop();
    continue;
  }
  const attrs = m[1] || '';
  const selfClosing = /\/\s*$/.test(attrs);
  const p = attrRe.exec(attrs);
  const segment = p ? (p[1] ?? p[2] ?? p[3]) : '';
  const parentParts = stack.filter(Boolean);
  const full =
    ('/' + [...parentParts, segment].filter(Boolean).join('/')).replace(/\/+/g, '/') || '/';
  if (segment) routes.push(full);
  if (!selfClosing) stack.push(segment);
}

// First match wins in React Router, so order matters for `/:param` collisions;
// for a dead-link check we only need "is there any route that can match".
const patterns = [...new Set(routes)].map(
  (r) => '^' + r.replace(/:[^/]+/g, '[^/]+').replace(/\*$/g, '.*').replace(/\/$/, '') + '/?$',
);
const routeRe = new RegExp(patterns.join('|'));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.tsx?$/.test(e.name)) out.push(f);
  }
  return out;
}

const links = new Map();
for (const file of [...walk('src'), ...walk('pages')]) {
  const s = fs.readFileSync(file, 'utf8');
  // to="..." string props only; template/expression links are runtime-built.
  for (const mm of s.matchAll(/\bto="(\/[^"]*)"/g)) {
    const href = mm[1].split('?')[0].split('#')[0];
    if (!links.has(href)) links.set(href, []);
    links.get(href).push(file);
  }
  for (const mm of s.matchAll(/\bhref="(\/[^"]*)"/g)) {
    const href = mm[1].split('?')[0].split('#')[0];
    if (!links.has(href)) links.set(href, []);
    links.get(href).push(file);
  }
}

const external = /^\/(growlanzo-|favicon|manifest|robots|sitemap|sw\.js|api\/)/;
const dead = [];
for (const [href, files] of links) {
  if (routeRe.test(href)) continue;
  if (external.test(href)) continue;
  dead.push({ href, file: files[0], count: files.length });
}

console.log(`routes: ${routes.length} unique, links: ${links.size}, dead: ${dead.length}`);
for (const d of dead.sort((a, b) => a.href.localeCompare(b.href))) {
  console.log(`  ${d.href}  <- ${d.file}${d.count > 1 ? ` (+${d.count - 1})` : ''}`);
}
