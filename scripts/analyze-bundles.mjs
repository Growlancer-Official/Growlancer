import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const CHUNKS_DIR = 'dist/client/assets/chunks';
const ENTRIES_DIR = 'dist/client/assets/entries';

// ─── Analyze a chunk file ─────────────────────────────────
function analyzeFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const sizeKB = (content.length / 1024).toFixed(1);
  const sizeGzip = content.length; // rough estimate
  
  // Find package names (string literals containing node_modules paths)
  const pkgMatches = content.match(/"[^"]*node_modules[^"]*"/g) || [];
  const packages = new Set();
  pkgMatches.forEach(m => {
    const clean = m.replace(/"/g, '');
    const parts = clean.split('node_modules/');
    parts.slice(1).forEach(p => {
      const pkg = p.split('/').slice(0, 2).join('/');
      if (pkg && !pkg.startsWith('.') && !pkg.startsWith('/')) {
        packages.add(pkg.replace(/@/g, '@'));
      }
    });
  });

  // Find identifiable strings that hint at library
  const clues = ['react', 'react-dom', 'supabase', 'zustand', 'lucide', 'tailwind-merge', 
    'clsx', 'sentry', '@vercel', 'react-router', 'vike', 'sharp', 'compression', 'express',
    'ai-sdk', 'google', 'zustand'];
  
  const foundClues = [];
  clues.forEach(clue => {
    const regex = new RegExp(clue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const count = (content.match(regex) || []).length;
    if (count > 3) {
      foundClues.push({ clue, count });
    }
  });

  const fileName = filePath.split(/[/\\]/).pop();
  
  console.log(`\n=== ${fileName} ===`);
  console.log(`  Size: ${sizeKB} KB`);
  
  if (packages.size > 0) {
    console.log(`  Packages:`);
    packages.forEach(p => console.log(`    - ${p}`));
  }
  
  if (foundClues.length > 0) {
    console.log(`  Library clues:`);
    foundClues.sort((a, b) => b.count - a.count).forEach(c => 
      console.log(`    - ${c.clue} (${c.count} refs)`)
    );
  }
  
  return { file: fileName, sizeKB: parseFloat(sizeKB), packages: [...packages], clues: foundClues };
}

// ─── Main ─────────────────────────────────────────────────
console.log('═══════════════════════════════════════════');
console.log('  BUNDLE ANALYSIS REPORT');
console.log('═══════════════════════════════════════════');

// Analyze entries first
console.log('\n─── ENTRIES ───');
const entries = readdirSync(ENTRIES_DIR);
entries.forEach(f => {
  if (f.endsWith('.js')) {
    analyzeFile(join(ENTRIES_DIR, f));
  }
});

// Analyze chunks
console.log('\n─── ALL CHUNKS (sorted by size) ───');
const chunkFiles = readdirSync(CHUNKS_DIR)
  .filter(f => f.endsWith('.js'))
  .map(f => ({
    name: f,
    path: join(CHUNKS_DIR, f),
    size: statSync(join(CHUNKS_DIR, f)).size
  }))
  .sort((a, b) => b.size - a.size);

const results = [];
chunkFiles.forEach(cf => {
  const result = analyzeFile(cf.path);
  results.push(result);
});

// Summary
console.log('\n═══════════════════════════════════════════');
console.log('  TOP 10 LARGEST FILES');
console.log('═══════════════════════════════════════════');

const allFiles = [
  ...entries.map(f => {
    const path = join(ENTRIES_DIR, f);
    return { name: `entries/${f}`, size: statSync(path).size, path };
  }),
  ...chunkFiles.map(cf => ({ name: `chunks/${cf.name}`, size: cf.size, path: cf.path }))
].sort((a, b) => b.size - a.size)
 .slice(0, 10);

allFiles.forEach(f => {
  console.log(`  ${(f.size/1024).toFixed(1)} KB  ${f.name}`);
});

console.log('\n─── TOTAL STATS ───');
const totalSize = allFiles.reduce((s, f) => s + f.size, 0);
console.log(`  Total (top 10): ${(totalSize/1024).toFixed(1)} KB`);
console.log(`  Total chunks: ${chunkFiles.length}`);
const allChunksSize = chunkFiles.reduce((s, f) => s + f.size, 0);
console.log(`  All chunks: ${(allChunksSize/1024).toFixed(1)} KB`);
