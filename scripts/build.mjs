#!/usr/bin/env node

/**
 * Build script for Growlancer.
 *
 * 1. Runs Vite build (with Vike prerender + copy plugin)
 * 2. Deterministically copies dist/client/ → dist/
 * 3. Validates that the critical output files exist
 * 4. Generates a fallback SPA shell if prerender was skipped
 * 5. Removes any 404.html from dist/ that could override SPA fallback
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
 *
 * Why the fallback shell exists:
 * Vercel's git-triggered builds occasionally skip Vike's prerender step, so
 * dist/client/ contains the assets but NO index.html. The deterministic copy
 * in step 2 then has nothing to copy and the deploy fails with
 * "Missing dist/index.html". The fallback generator reads the Vite manifest
 * and emits a minimal SPA shell (root div + client entry imports) so
 * dist/index.html ALWAYS exists and the app boots via client-side rendering.
 */

import { execSync } from 'node:child_process';
import {
  existsSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = resolve(__dirname, '..');
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
console.log(`\n${YELLOW}[1/5]${RESET} Running vite build...`);
if (process.env.SKIP_VITE_BUILD === '1') {
  // Test/debug mode: reuse the existing dist/client/ output so the
  // fallback shell generator can be exercised in isolation.
  warn('SKIP_VITE_BUILD=1 — skipping vite build (fallback shell test mode)');
} else {
  try {
    execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });
    ok('Vite build completed');
  } catch (err) {
    fail(`Vite build failed: ${err.message}`);
  }
}

// ── Step 2: Copy Vike client output → dist/ (DETERMINISTIC) ──
// Vike (SSR/prerender) outputs the client build to dist/client/, but Vercel's
// Vite framework preset expects index.html at dist/ for its SPA rewrites.
//
// The vite.config.ts 'vercel-output-workaround' plugin copies via the
// closeBundle hook — but Vercel's new build system (Vite CLI 58.x + builtin
// plugins) can change hook timing so the copy never runs, which made every
// git-triggered deploy fail with "Missing dist/index.html".
//
// Fix: perform the copy here, deterministically, with a plain Node fs
// recursive copy — guaranteed to run in EVERY environment (local, Vercel git,
// Vercel CLI). Always use the manual copy (NOT fs.cpSync): copying a directory
// into its own parent can throw ERR_FS_CP_* on some Node versions.
console.log(`\n${YELLOW}[2/5]${RESET} Copying dist/client/ → dist/ (deterministic)...`);
if (existsSync(DIST_CLIENT)) {
  try {
    copyRecursiveSyncManual(DIST_CLIENT, DIST);
    ok('dist/client/ copied to dist/');
  } catch (copyErr) {
    fail(`Failed to copy dist/client to dist: ${copyErr.message}`);
  }
} else {
  warn('dist/client/ not found — nothing to copy');
}

/** Recursive copy of files from srcDir into destDir (files only, mirrors source structure). */
function copyRecursiveSyncManual(srcDir, destDir) {
  const entries = readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyRecursiveSyncManual(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// ── Step 3: Validate Vike client output ────────────────────────
console.log(`\n${YELLOW}[3/5]${RESET} Validating Vike client output...`);
const CLIENT_HTML = resolve(DIST_CLIENT, 'index.html');
if (!existsSync(CLIENT_HTML)) {
  warn(`Vike prerender did not run — dist/client/index.html missing.`);
} else {
  ok(`dist/client/index.html exists`);
}

// ── Step 3b: Fallback SPA shell (when prerender was skipped) ──
// If the copy above could not produce dist/index.html (prerender skipped on
// Vercel), generate a minimal SPA shell from the Vite manifest. The client
// entry scripts boot the app via client-side rendering, which is exactly what
// the SPA fallback (_redirects / vercel.json rewrites) serves for all routes.
const DIST_HTML = resolve(DIST, 'index.html');
if (!existsSync(DIST_HTML)) {
  warn(`dist/index.html missing after copy — generating fallback SPA shell...`);
  try {
    generateFallbackIndexHtml();
    ok(`Fallback dist/index.html generated (client-side rendering)`);
  } catch (fallbackErr) {
    fail(
      `Could not generate fallback index.html: ${fallbackErr.message}\n` +
        `  Vercel expects dist/index.html for its SPA rewrites.\n` +
        `  Check scripts/build.mjs step 3b (generateFallbackIndexHtml).`
    );
  }
}

/**
 * Reads the Vite manifest to locate client entry JS + CSS files.
 * Tries dist/.vite/manifest.json first, then dist/client/.vite/manifest.json.
 */
function readManifest() {
  const candidates = [
    resolve(DIST, '.vite', 'manifest.json'),
    resolve(DIST_CLIENT, '.vite', 'manifest.json'),
  ];
  for (const manifestPath of candidates) {
    if (!existsSync(manifestPath)) continue;
    try {
      return JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      // corrupt manifest — try next candidate
    }
  }
  return null;
}

/**
 * Generates a minimal SPA shell at dist/index.html that boots the app
 * client-side. Uses the entry JS files (client routing + pages client) and
 * the CSS emitted by Vite's manifest, mirroring the structure Vike prerender
 * would produce. Falls back to scanning dist/client/assets/ if no manifest.
 */
function generateFallbackIndexHtml() {
  const manifest = readManifest();
  const scriptImports = [];
  const cssHrefs = [];

  if (manifest) {
    for (const key of Object.keys(manifest)) {
      const entry = manifest[key];
      if (!entry || typeof entry !== 'object') continue;
      // Collect CSS emitted for any entry (deduped below).
      if (Array.isArray(entry.css)) {
        for (const css of entry.css) {
          if (typeof css === 'string' && css.endsWith('.css')) cssHrefs.push(css);
        }
      }
      // Collect real entry JS files (skip virtual: keys which have no file).
      if (entry.isEntry && typeof entry.file === 'string' && !key.startsWith('virtual:')) {
        scriptImports.push(entry.file);
      }
    }
  }

  // Manifest missing/corrupt → scan the built assets directories directly.
  if (scriptImports.length === 0) {
    const entriesDir = resolve(DIST_CLIENT, 'assets', 'entries');
    if (existsSync(entriesDir)) {
      for (const f of readdirSync(entriesDir)) {
        if (f.endsWith('.js')) scriptImports.push(`assets/entries/${f}`);
      }
    }
  }
  if (cssHrefs.length === 0) {
    const staticDir = resolve(DIST_CLIENT, 'assets', 'static');
    if (existsSync(staticDir)) {
      for (const f of readdirSync(staticDir)) {
        if (f.endsWith('.css')) cssHrefs.push(`assets/static/${f}`);
      }
    }
  }

  // 🛡️ Guard: never write a blank shell (no scripts = blank page).
  // Dedupe first so the check reflects what will actually be emitted.
  const scriptSet = [...new Set(scriptImports)];
  if (scriptSet.length === 0) {
    fail(
      `Fallback generator found NO client entry scripts — would produce a blank page.\n` +
        `  Check that dist/client/assets/entries/ exists after vite build.`
    );
  }

  // Deterministic order: client-routing entry first, then pages client.
  scriptImports.sort((a, b) => {
    const aIsRouter = a.includes('entry-client-routing') ? 0 : 1;
    const bIsRouter = b.includes('entry-client-routing') ? 0 : 1;
    return aIsRouter - bIsRouter;
  });
  const uniqueCss = [...new Set(cssHrefs)];
  const uniqueScripts = [...new Set(scriptImports)];

  const cssTags = uniqueCss
    .map((css) => `  <link rel="stylesheet" type="text/css" href="/${css}">`)
    .join('\n');
  const importStmts = uniqueScripts.map((js) => `    import("/${js}");`).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Growlancer — AI-Powered Freelancing Marketplace</title>
    <meta name="description" content="Growlancer is the AI-powered freelancing marketplace. Hire top freelancers or get hired for high-quality work.">
    <link rel="icon" href="/UpdatedLogo.webp?v=3" type="image/webp">
    <link rel="icon" href="/UpdatedLogo.png?v=2" type="image/png">
    <meta name="theme-color" content="#10b981">
    <meta property="og:type" content="website">
    <meta property="og:title" content="Growlancer — AI-Powered Freelancing Marketplace">
    <meta property="og:description" content="Hire top freelancers or get hired for high-quality work with Growlancer.">
    <meta name="twitter:card" content="summary_large_image">
    <!-- Design fonts (Satoshi + Cabinet Grotesk) — must match pages/+Head.tsx so
         fallback-shell routes (served when Vike prerender is skipped) load the
         same fonts as prerendered pages. CSP allows api.fontshare.com. -->
    <link rel="preconnect" href="https://api.fontshare.com" crossorigin>
    <link rel="preload" as="style" href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,600,700&f[]=satoshi@400,500,700&display=swap">
    <link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,600,700&f[]=satoshi@400,500,700&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
    <noscript>
      <link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,600,700&f[]=satoshi@400,500,700&display=swap" rel="stylesheet">
    </noscript>
${cssTags}
  </head>
  <body>
    <div id="root"></div>
    <!-- Vike REQUIRES BOTH #vike_pageContext AND #vike_globalContext in the HTML.
         Vike's client router UNCONDITIONALLY reads #vike_pageContext on first render
         (renderPageClient -> getPageContextFromHooksServer_firstRender). Without it the
         boot crashes with "Couldn't find #vike_pageContext" (white screen) — this is the
         root cause of the white screen when the fallback shell is served.
         pageId is always "/pages/@path" because the app is a single catch-all route
         (pages/@path/+route.ts = '/*') that renders <App /> (react-router). The routeParams
         value is therefore irrelevant for routing — this matches exactly what Vike's
         prerender emits for the "/" URL. {} for globalContext = client-side only boot. -->
    <script id="vike_pageContext" type="application/json">{"pageId":"/pages/@path","routeParams":{"*":""}}</script>
    <script id="vike_globalContext" type="application/json">{}</script>
    <script type="module" async>
${importStmts}
    </script>
  </body>
</html>
`;

  writeFileSync(DIST_HTML, html);
  // Also write into dist/client/ so both trees stay in sync.
  mkdirSync(DIST_CLIENT, { recursive: true });
  writeFileSync(resolve(DIST_CLIENT, 'index.html'), html);
}

// ── Step 4: Validate copied output ─────────────────────────────
console.log(`\n${YELLOW}[4/5]${RESET} Validating dist/ output...`);
if (!existsSync(DIST_HTML)) {
  fail(
    `Missing dist/index.html — neither the deterministic copy step nor the\n` +
      `  fallback generator produced it. Check scripts/build.mjs steps 2 & 3b.`
  );
}
ok(`dist/index.html exists`);

// ── Step 4b: White-screen regression guard (NEVER deploy a broken shell) ──
// Vike's client router UNCONDITIONALLY reads #vike_pageContext (and also
// #vike_globalContext) from the served HTML on first render. If either element
// is missing, the boot crashes with "Couldn't find #vike_..." → white screen.
// This guard HARD-FAILS the build so a broken shell can never be deployed
// silently again: the deploy fails loudly instead of shipping a white screen.
// (Valid for BOTH the prerendered HTML and the fallback SPA shell.)
{
  const html = readFileSync(DIST_HTML, 'utf8');
  const CRITICAL_ELEMENTS = [
    ['#root mount', 'id="root"'],
    ['#vike_pageContext', 'id="vike_pageContext"'],
    ['#vike_globalContext', 'id="vike_globalContext"'],
  ];
  for (const [label, marker] of CRITICAL_ELEMENTS) {
    if (!html.includes(marker)) {
      fail(
        `CRITICAL: dist/index.html is missing the ${label} element (${marker}).\n` +
          `  Vike's client router would crash on first render (white screen).\n` +
          `  Fix scripts/build.mjs step 3b (generateFallbackIndexHtml) or the\n` +
          `  prerender output — this build must NOT be deployed.`
      );
    }
  }
  ok('index.html contains #root + both Vike context elements (white-screen guard ✓)');
}

// ── Step 5: Remove any stray 404.html from dist/ ───────────────
console.log(`\n${YELLOW}[5/5]${RESET} Cleaning up stray files...`);
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
