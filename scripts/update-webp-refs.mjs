/**
 * Batch-update all image references from .png → .webp in src/ and index.html
 * Run: node scripts/update-webp-refs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel', '.supabase']);

/** Walk directory recursively */
function walk(dir) {
  const results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const f of list) {
      const fp = path.join(dir, f);
      const stat = fs.statSync(fp);
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(f) && !f.startsWith('.')) {
          results.push(...walk(fp));
        }
      } else if (fp.endsWith('.tsx') || fp.endsWith('.ts') || fp.endsWith('.html')) {
        results.push(fp);
      }
    }
  } catch { /* permission denied etc */ }
  return results;
}

const files = walk(ROOT);
let updated = 0;

for (const fp of files) {
  let content = fs.readFileSync(fp, 'utf8');
  const orig = content;

  // For SVG files or data URIs — skip
  if (content.includes('data:image/svg+xml')) continue;

  // Replace UpdatedLogo.png → UpdatedLogo.webp (with or without ?v=2)
  content = content.replace(/\/UpdatedLogo\.png(\?v=\d+)?/g, '/UpdatedLogo.webp');

  // Replace Founder.png → Founder.webp
  content = content.replace(/\/Founder\.png/g, '/Founder.webp');

  // Replace Growlancer Logo (2).png → Growlancer Logo (2).webp
  content = content.replace(/\/Growlancer Logo \(2\)\.png/g, '/Growlancer Logo (2).webp');

  // Replace og-image.png → og-image.webp (but NOT if used in OG meta tags — social media needs PNG)
  // Only replace if NOT inside meta property="og:image" or meta name="twitter:image"
  content = content.replace(/(?<!og:image|twitter:image)\/og-image\.png/g, '/og-image.webp');

  if (content !== orig) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log(`  ✅ Updated: ${path.relative(ROOT, fp)}`);
    updated++;
  }
}

console.log(`\n✨ ${updated} file(s) updated!`);
