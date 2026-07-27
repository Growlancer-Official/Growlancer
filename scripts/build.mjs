#!/usr/bin/env node

/**
 * Build script for Growlancer.
 *
 * 1. Runs Vite build (with Vike prerender + copy plugin)
 * 2. Deletes dist/404.html — Vercel treats a 404.html in the output
 *    directory as the SPA fallback, OVERRIDING the catch-all rewrite
 *    to /index.html. Removing it ensures unmatched routes fall through
 *    to the rewrite rules and serve the app shell.
 */

import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// ── Step 1: Vite build ─────────────────────────────────────────
console.log('[build] Running vite build...');
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

// ── Step 2: Remove 404.html from output ────────────────────────
const FALLBACK_404 = resolve(ROOT, 'dist', '404.html');
if (existsSync(FALLBACK_404)) {
  unlinkSync(FALLBACK_404);
  console.log('[build] Removed 404.html from dist/ — prevents Vercel SPA fallback override');
} else {
  console.log('[build] No 404.html found in dist/ — nothing to remove');
}
