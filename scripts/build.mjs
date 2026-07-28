#!/usr/bin/env node

/**
 * Build script for Growlancer.
 *
 * 1. Runs Vite build (with Vike prerender + copy plugin)
 * 2. Validates that the critical output files exist
 * 3. Removes any 404.html from dist/ that could override SPA fallback
 *
 * Vercel SPA Routing Strategy (VERIFIED):
 * ─────────────────────────────────────────
 * - public/_redirects  →  `/* /index.html 200`  (edge-level SPA fallback)
 * - public/404.html    →  DELETED (was overriding rewrites)
 * - vercel.json        →  `rewrites: [{"source":"/(.*)","destination":"/index.html"}]`
 * - build.mjs          →  Validates dist/client/index.html & dist/index.html exist
 *
 * The _redirects file is authoritative on Vercel's edge network and
 * takes precedence over both vercel.json rewrites AND static 404.html.
 * Removing 404.html from public/ ensures it is never copied into the
 * build output in the first place.
 */

import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');
const DIST_CLIENT = resolve(DIST, 'client');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function ok(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function warn(msg) {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}

function fail(msg) {
  console.error(`${RED}✗${RESET} ${msg}`);
  process.exit(1);
}

const start = Date.now();

// ── Step 1: Vite build ─────────────────────────────────────────
console.log(`\n${YELLOW}[1/4]${RESET} Running vite build...`);
try {
  execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });
} catch (err) {
  fail(`Vite build failed: ${err.message}`);
}
ok('Vite build completed');

// ── Step 2: Validate Vike client output ────────────────────────
console.log(`\n${YELLOW}[2/4]${RESET} Validating Vike client output...`);
const CLIENT_HTML = resolve(DIST_CLIENT, 'index.html');
if (!existsSync(CLIENT_HTML)) {
  fail(`Missing Vike output: expected ${CLIENT_HTML} but it does not exist`);
}
ok(`dist/client/index.html exists (${(existsSync(CLIENT_HTML) ? '✓' : '✗')})`);

// ── Step 3: Validate copied output ─────────────────────────────
console.log(`\n${YELLOW}[3/4]${RESET} Validating dist/ output...`);
const DIST_HTML = resolve(DIST, 'index.html');
if (!existsSync(DIST_HTML)) {
  fail(
    `Missing dist/index.html — the Vercel output workaround plugin did not copy files.\n` +
      `  Vike outputs to dist/client/ but Vercel expects output at dist/.\n` +
      `  Check vite.config.ts for the 'vercel-output-workaround' plugin.`
  );
}
ok(`dist/index.html exists`);

// ── Step 4: Remove any stray 404.html from dist/ ───────────────
console.log(`\n${YELLOW}[4/4]${RESET} Cleaning up stray files...`);
const FALLBACK_404 = resolve(DIST, '404.html');
if (existsSync(FALLBACK_404)) {
  unlinkSync(FALLBACK_404);
  ok('Removed stray 404.html from dist/ — prevents Vercel SPA fallback override');
} else {
  ok('No 404.html found in dist/ — all clean');
}

// ── Check for _redirects in dist/ ───────────────────────────────
// public/_redirects should be automatically copied by Vite
const REDIRECTS_DIST = resolve(DIST, '_redirects');
if (existsSync(REDIRECTS_DIST)) {
  ok('_redirects copied to dist/ — SPA fallback active at edge level');
} else {
  warn('_redirects not found in dist/ — Vite might not copy dotfiles from public/');
  warn('  Check if _redirects is in public/ directory');
}

// ── Summary ────────────────────────────────────────────────────
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n${GREEN}✓ Build complete in ${elapsed}s${RESET}`);
console.log(`  dist/index.html     ${existsSync(resolve(DIST, 'index.html')) ? GREEN + '✓' : RED + '✗'}${RESET}`);
console.log(`  dist/client/        ${existsSync(DIST_CLIENT) ? GREEN + '✓' : RED + '✗'}${RESET}`);
console.log(`  dist/404.html       ${existsSync(FALLBACK_404) ? RED + '⚠ PRESENT (will be served)' : GREEN + '✓ absent'}${RESET}`);
console.log(`  dist/_redirects     ${existsSync(REDIRECTS_DIST) ? GREEN + '✓' : YELLOW + '⚠ absent'}${RESET}`);
