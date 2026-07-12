/**
 * Convert large PNGs in public/ to WebP format.
 * Keeps original PNGs as fallback for old browsers.
 * Run: node scripts/convert-images.js
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const images = [
  { name: 'UpdatedLogo.png', quality: 90 },
  { name: 'Founder.png', quality: 85 },
  { name: 'og-image.png', quality: 85 },
  { name: 'Growlancer Logo (2).png', quality: 85 },
];

async function convert() {
  console.log('🔄 Converting PNGs to WebP...\n');

  for (const img of images) {
    const srcPath = path.join(PUBLIC_DIR, img.name);
    const baseName = img.name.replace('.png', '');
    const destPath = path.join(PUBLIC_DIR, `${baseName}.webp`);

    if (!fs.existsSync(srcPath)) {
      console.log(`  ⚠️  Skipping ${img.name} — file not found`);
      continue;
    }

    const srcStat = fs.statSync(srcPath);
    const srcSizeKB = (srcStat.size / 1024).toFixed(1);

    try {
      await sharp(srcPath)
        .webp({ quality: img.quality })
        .toFile(destPath);

      const destStat = fs.statSync(destPath);
      const destSizeKB = (destStat.size / 1024).toFixed(1);
      const savings = ((1 - destStat.size / srcStat.size) * 100).toFixed(1);

      console.log(`  ✅ ${img.name}`);
      console.log(`     Before: ${srcSizeKB} KB → After: ${destSizeKB} KB (${savings}% smaller)`);
    } catch (err) {
      console.log(`  ❌ ${img.name}: ${err.message}`);
    }
  }

  console.log('\n✨ Done!');
}

convert().catch(console.error);
