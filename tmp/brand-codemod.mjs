// One-shot codemod: /UpdatedLogo.{png,webp} <img> → <BrandLogo />, and drop the
// now-duplicated exact "Growlanzo" name element that sat next to the old mark.
// Run from the repo root: node tmp/brand-codemod.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// Standalone lockups (no adjacent name text): show the FULL logo.
const FULL_FILES = new Set([
  'src/pages/auth/EmailConfirmPage.tsx',
  'src/pages/auth/VerifyEmailPage.tsx',
  'src/pages/AuthCallbackPage.tsx',
  'src/components/ProtectedRoute.tsx',
  'src/pages/WaitlistPage.tsx',
  'src/pages/admin/AdminLoginPage.tsx',
]);

// Permanently-dark surfaces: pin the dark flavour (no .dark class swap).
const DARK_FILES = new Set([
  'src/pages/admin/AdminLoginPage.tsx',
  'src/layouts/AdminDashboardLayout.tsx',
]);

const IMG_RE = /<img\s+src="\/UpdatedLogo\.(?:png|webp)"\s+alt="([^"]*)"\s+className="([^"]*)"\s*\/>/g;
// An element whose ENTIRE text content is exactly the brand name.
const NAME_LINE_RE = /^\s*<(span|h1|h2|h3|div|p)(\s[^>]*)?>\s*Growlanzo\s*<\/(?:span|h1|h2|h3|div|p)>\s*$/;

function fixClassName(cls) {
  const keep = cls
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => !/^w-(?:[0-9]|10|11|12)$/.test(c))
    .filter((c) => !/^rounded/.test(c))
    .filter((c) => !/^shadow-/.test(c));
  if (!keep.includes('w-auto')) keep.push('w-auto');
  return keep.join(' ');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function importPathFor(file) {
  const rel = path.relative(path.dirname(file), path.join(ROOT, 'src/components/BrandLogo'));
  let spec = rel.split(path.sep).join('/');
  if (!spec.startsWith('.')) spec = './' + spec;
  return spec;
}

let totalImgs = 0;
let totalNames = 0;
const report = [];

for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (!fs.readFileSync(file, 'utf8').includes('/UpdatedLogo')) continue;
  const before = fs.readFileSync(file, 'utf8');
  let src = before;

  const full = FULL_FILES.has(rel);
  const dark = DARK_FILES.has(rel);
  let count = 0;
  src = src.replace(IMG_RE, (_m, _alt, cls) => {
    count += 1;
    const variant = full ? 'full' : 'wordmark';
    const theme = dark ? ' theme="dark"' : '';
    return `<BrandLogo variant="${variant}"${theme} className="${fixClassName(cls)}" />`;
  });
  totalImgs += count;

  // Drop the duplicated name element when it sits within 3 non-empty lines
  // after the BrandLogo replacement (covers `img, <div>, <h1>` stacks).
  const lines = src.split('\n');
  let sinceLogo = Infinity;
  let removed = 0;
  const kept = [];
  for (const line of lines) {
    if (line.includes('<BrandLogo')) sinceLogo = 0;
    else if (line.trim() !== '') sinceLogo += 1;
    if (sinceLogo <= 3 && NAME_LINE_RE.test(line)) {
      removed += 1;
      continue;
    }
    kept.push(line);
  }
  src = kept.join('\n');
  totalNames += removed;

  if (count > 0 && !src.includes("from '") || true) {
    if (count > 0 && !/from '[./]+components\/BrandLogo'|from '\.\/BrandLogo'/.test(src)) {
      const importLine = `import { BrandLogo } from '${importPathFor(file)}';`;
      const importLines = src.split('\n');
      let lastImport = -1;
      importLines.forEach((l, i) => {
        if (/^import\s/.test(l)) lastImport = i;
      });
      if (lastImport === -1) throw new Error(`no import found in ${rel}`);
      importLines.splice(lastImport + 1, 0, importLine);
      src = importLines.join('\n');
    }
  }

  if (src !== before) {
    fs.writeFileSync(file, src);
    report.push(`${rel}: ${count} logo(s), ${removed} name tag(s) removed`);
  }
}

console.log(report.join('\n'));
console.log(`\nTOTAL: ${totalImgs} <img> → <BrandLogo>, ${totalNames} duplicate name tags removed`);

// Leftovers that must be handled manually (poster + canvas share card).
const leftovers = [];
for (const f of ['src/pages/HomePage.tsx', 'src/lib/referralShare.ts']) {
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (text.includes('/UpdatedLogo')) leftovers.push(f);
}
if (leftovers.length) console.log('STILL REFERENCING /UpdatedLogo (expected — manual):', leftovers.join(', '));
