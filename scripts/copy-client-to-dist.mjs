#!/usr/bin/env node

/**
 * Post-build script: copies `dist/client/` → `dist/`
 *
 * Vike outputs client-side files to `dist/client/` by default. Vercel's
 * Vite framework preset expects static files at the output directory.
 * This script bridges the gap by copying all client files up one level
 * so that `outputDirectory: "dist"` in vercel.json picks them up.
 *
 * Uses only Node.js built-in modules — no dependencies needed.
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const src = resolve(projectRoot, 'dist/client');
const dest = resolve(projectRoot, 'dist');

if (!existsSync(src)) {
  console.warn('[copy-client-to-dist] dist/client not found — skipping copy');
  process.exit(0);
}

console.log('[copy-client-to-dist] Copying dist/client/ → dist/...');

// Ensure dest exists
mkdirSync(dest, { recursive: true });

// Copy with recursive flag, overwriting existing files
cpSync(src, dest, {
  recursive: true,
  filter: (source) => {
    // Skip node_modules and hidden files
    if (source.includes('node_modules')) return false;
    return true;
  },
});

console.log('[copy-client-to-dist] Done — dist/ now mirrors dist/client/');
