const fs = require('fs');

const packagesToCheck = [
  'react', 'react-dom', 'react-router', 'supabase', 'zustand', 
  'lucide', 'sentry', 'tailwind-merge', 'clsx', 'vercel', 
  'express', 'compression', 'sharp', 'vike', 'ai-sdk', 'google'
];

const chunkFiles = [
  'dist/client/assets/chunks/chunk-D5mPLHMB.js',
  'dist/client/assets/chunks/chunk-Dj4oz4b-.js',
  'dist/client/assets/chunks/chunk-DTTv_rXO.js',
  'dist/client/assets/chunks/chunk-uJSplqFo.js',
  'dist/client/assets/chunks/chunk-BHwOq9rQ.js',
  'dist/client/assets/chunks/chunk-DGyW11H6.js',
  'dist/client/assets/chunks/chunk-BKft3zoP2.js',
  'dist/client/assets/chunks/chunk-BNJP2CRq.js',
  'dist/client/assets/chunks/chunk-41fCEEF2.js',
  'dist/client/assets/entries/pages_-path.BFKHsmuO.js'
];

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║         BUNDLE CHUNK ANALYSIS                        ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');

chunkFiles.forEach(filePath => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const name = filePath.split(/[/\\]/).pop();
    const sizeKB = (content.length / 1024).toFixed(1);
    
    console.log(`📦 ${name} (${sizeKB} KB)`);
    
    // Find library references
    packagesToCheck.forEach(pkg => {
      // Escape special regex characters
      const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      const matches = content.match(regex);
      if (matches && matches.length > 5) {
        console.log(`   ├─ ${pkg}: ${matches.length} references`);
      }
    });
    
    // Also find all require/import references to identify bundled packages
    const importRefs = content.match(/["'][a-z@][a-z0-9_./-]*["']/g) || [];
    const pkgCounts = {};
    importRefs.forEach(ref => {
      const clean = ref.replace(/["']/g, '');
      // Skip relative imports and URL-like strings
      if (clean.startsWith('.') || clean.startsWith('/') || clean.startsWith('http')) return;
      // Get the package name (first part before / for scoped, first part for unscoped)
      const pkgName = clean.startsWith('@') 
        ? clean.split('/').slice(0, 2).join('/') 
        : clean.split('/')[0];
      if (pkgName && pkgName.length > 2 && !pkgName.includes('.')) {
        pkgCounts[pkgName] = (pkgCounts[pkgName] || 0) + 1;
      }
    });
    
    const topPkgs = Object.entries(pkgCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    if (topPkgs.length > 0) {
      console.log(`   ├─ Imported packages:`);
      topPkgs.forEach(([pkg, count]) => {
        if (count > 2) console.log(`   │  • ${pkg}: ${count} imports`);
      });
    }
    
    console.log('');
  } catch (e) {
    console.log(`Error reading ${filePath}: ${e.message}`);
  }
});

// Summary
console.log('══════════════════════════════════════════════════════');
console.log('CRITICAL PATH CHAINS:');
console.log('');

// Check which chunks are loaded by the entry chunk
const entryContent = fs.readFileSync(
  'dist/client/assets/entries/pages_-path.BFKHsmuO.js', 'utf8'
);
const directChunks = entryContent.match(/chunk-[A-Za-z0-9_-]+\.js/g) || [];
const uniqueChunks = [...new Set(directChunks)];
console.log(`Entry chunk directly loads ${uniqueChunks.length} other chunks`);
console.log('');

// Total critical path size
let totalCritical = fs.statSync('dist/client/assets/entries/pages_-path.BFKHsmuO.js').size;
console.log(`Entry chunk: ${(totalCritical/1024).toFixed(1)} KB`);
uniqueChunks.forEach(chunkName => {
  const chunkPath = `dist/client/assets/chunks/${chunkName}`;
  try {
    const size = fs.statSync(chunkPath).size;
    totalCritical += size;
    console.log(`  + ${chunkName}: ${(size/1024).toFixed(1)} KB`);
  } catch (e) {
    // Try different path
    const altPath = `dist/client/assets/chunks/${chunkName}`;
    try {
      const altPath2 = `dist/${chunkName}`;
      const size = fs.statSync(altPath2).size;
      totalCritical += size;
      console.log(`  + ${chunkName}: ${(size/1024).toFixed(1)} KB (alt path)`);
    } catch (e2) {
      console.log(`  + ${chunkName}: NOT FOUND`);
    }
  }
});
console.log(`─────────────────────────`);
console.log(`Total critical path: ${(totalCritical/1024).toFixed(1)} KB`);
console.log(`Estimated gzipped: ${(totalCritical/1024/3).toFixed(1)} KB (rough 3:1 ratio)`);
