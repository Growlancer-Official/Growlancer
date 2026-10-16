import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Dark theme — the coverage guard.
 *
 * Why this shape: the site does NOT carry `dark:` variants on ~100 pages. The
 * theme is implemented ONCE as a palette remap in `src/styles/globals.css`
 * (`.dark :where(.bg-white) { … }`), and `darkMode: 'class'` + ThemeContext do
 * the switching. That is what makes a sitewide dark theme tractable — and it is
 * also the exact thing that rots silently: somebody reaches for a palette the
 * remap never knew about (a `gray`/`zinc`/`stone` chip, say), the page looks
 * right in light, and in dark mode that one element stays bright. Nothing
 * fails, no test notices, and the report is "dark mode is broken again".
 *
 * So this test reads the two real sources of truth — the remap selectors in
 * globals.css and every colour utility actually written in src/ — and demands
 * that each light-rendering token is either remapped or excused BY NAME with a
 * reason. An excuse that is no longer needed also fails, so the list cannot
 * grow into a dumping ground.
 *
 * If this test fails after you added a class: add the class to the remap in
 * globals.css (preferred), or add it to EXCUSED with a real reason.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '..');
const ROOT = path.resolve(SRC, '..');
const stroke = (p: string) => p.split(path.sep).join('/');
const readRepo = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const CSS = fs.readFileSync(path.join(SRC, 'styles/globals.css'), 'utf8');

// ── 1. What the remap covers ────────────────────────────────────────────────
/** Every class name in a `.dark :where(...)` selector, unescaped. */
function remappedClasses(css: string): Set<string> {
  const out = new Set<string>();
  for (const block of css.matchAll(/\.dark\s*:where\(([^)]*)\)\s*\{/g)) {
    for (const raw of block[1].split(',')) {
      const sel = raw.trim();
      if (!sel.startsWith('.')) continue;
      const className = sel.slice(1).split(':')[0]; // drop `:hover` / `::after`
      out.add(className.split('\\/').join('/')); // `bg-white\/50` -> `bg-white/50`
    }
  }
  return out;
}

const COVERED = remappedClasses(CSS);

// ── 2. Every colour utility actually used in src/ ───────────────────────────
const PALETTE =
  'white|black|cream|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITY = 'bg|text|border|divide|ring|from|to|via|fill|stroke';
const TOKEN_RE = new RegExp(
  `(?:^|[\\s"'\`{(])((?:${UTILITY})-(?:${PALETTE})(?:-\\d+)?(?:\\/[\\d.]+)?)`,
  'g'
);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const usedTokens = new Map<string, Set<string>>();
for (const file of sourceFiles(SRC)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(TOKEN_RE)) {
    const token = m[1];
    if (!usedTokens.has(token)) usedTokens.set(token, new Set());
    usedTokens.get(token)!.add(stroke(path.relative(SRC, file)));
  }
}
const USED = [...usedTokens.keys()].sort();

// ── 3. Which of them render LIGHT, and so must not survive into dark mode ───
/**
 * Only tokens that paint a near-white surface or dark-on-light text are in
 * scope. Deliberately out of scope, because they read correctly in BOTH themes:
 *   - `text-white` / `text-slate-400…100` (already light),
 *   - `bg-slate-700+`, `bg-emerald-500+` (already dark / saturated),
 *   - `bg-black/*`, `bg-white/5…40` (translucent overlays on dark chrome).
 */
const LIGHT_TINT = '(50|100|200|300)';
const NEUTRALS = 'slate|gray|grey|zinc|neutral|stone';
const ACCENTS =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

const RENDERS_LIGHT = [
  /^bg-(white|cream)(\/[5-9]\d)?$/, // solid-ish white surfaces (alpha >= 50)
  new RegExp(`^bg-(${NEUTRALS})-${LIGHT_TINT}$`),
  new RegExp(`^text-(${NEUTRALS})-(500|600|700|800|900|950)$`),
  new RegExp(`^border-(${NEUTRALS})-${LIGHT_TINT}$`),
  new RegExp(`^divide-(${NEUTRALS})-(50|100|200)$`),
  new RegExp(`^ring-(${NEUTRALS})-(200|300)$`),
  // Gradient stops. Tailwind's from-/via-/to- set custom properties rather
  // than background-color, so they need their own remap — and they were the
  // gap that let the homepage hero keep a `via-white to-white` overlay and
  // paint a white wash over the whole dark hero section.
  /^(from|via|to)-(white|cream)$/,
  new RegExp(`^(from|via|to)-(${NEUTRALS}|${ACCENTS})-${LIGHT_TINT}$`),
  new RegExp(`^(from|via|to)-(${ACCENTS})-50\/\d+$`),
];

const rendersLight = (token: string) => RENDERS_LIGHT.some((re) => re.test(token));

/**
 * Tokens that render light and are NOT remapped, on purpose.
 *
 * Every entry needs a reason. The admin console is dark in both themes, so its
 * light hairlines sit on a dark panel there too; a translucent white overlay on
 * a hero must stay translucent white in both themes.
 */
const EXCUSED = new Map<string, string>([
  // ── The hero/CTA sections are dark in both themes by design ──────────────
  ['border-white', 'translucent white hairline on always-dark chrome'],
  ['ring-white', 'focus/ring on always-dark chrome'],

  // ── Gradient stops that must stay BRIGHT ────────────────────────────────
  [
    'to-teal-300',
    'gradient TEXT stop (`from-emerald-400 to-teal-300 bg-clip-text`) — these headings are bright on purpose; darkening the stop would make the text unreadable on dark',
  ],
  [
    'from-slate-300',
    'silver (rank 2) medal chip in ContestDetailPage — a medal must stay silver in both themes',
  ],
  [
    'from-orange-300',
    'bronze (rank 3) medal chip in ContestDetailPage — bright on purpose, pairs with to-orange-500',
  ],

  // ── The admin console is dark in BOTH themes ────────────────────────────
  ['bg-slate-800', 'admin console panel — dark in both themes'],
  ['bg-slate-900', 'admin console shell — dark in both themes'],
  ['bg-slate-700', 'admin avatar/placeholder fill — dark in both themes'],
  ['text-slate-300', 'admin console body text — already light'],
  ['border-slate-700', 'admin console hairline — already dark'],
  ['border-slate-800', 'admin console hairline — already dark'],
  ['divide-slate-800', 'admin console table rule — already dark'],
  ['text-slate-400', 'muted text that is already light enough on dark'],
]);

// ── 4. The assertions ───────────────────────────────────────────────────────
const inScope = USED.filter(rendersLight);

describe('dark theme — every light-surface utility is accounted for', () => {
  it('parses the remap (a broken parse must not pass the next assertion)', () => {
    // If globals.css is restructured so this regex stops matching, COVERED would
    // be empty and every page would "fail" — or, worse, a future trim to zero
    // selectors would pass vacuously. Pin a floor.
    expect(COVERED.size).toBeGreaterThan(80);
    expect([...COVERED]).toContain('bg-white');
    expect([...COVERED]).toContain('bg-slate-50');
    expect([...COVERED]).toContain('text-slate-900');
  });

  it('found colour utilities to check (the scan itself is not vacuous)', () => {
    expect(inScope.length).toBeGreaterThan(20);
  });

  it('remaps or excuses every light-rendering utility used in src/', () => {
    const unaccounted = inScope.filter((t) => !COVERED.has(t) && !EXCUSED.has(t));
    const report = unaccounted
      .map((t) => `  ${t.padEnd(26)} ${[...usedTokens.get(t)!].slice(0, 3).join(', ')}`)
      .join('\n');
    expect(
      unaccounted,
      `These paint a light surface in dark mode. Add each to the .dark :where(...) remap ` +
        `in src/styles/globals.css — or to EXCUSED in this test with a reason:\n${report}`
    ).toEqual([]);
  });

  it('carries no stale excuse', () => {
    const stale = [...EXCUSED.keys()].filter((t) => !usedTokens.has(t));
    expect(stale, `EXCUSED entries nothing uses any more: ${stale.join(', ')}`).toEqual([]);
  });

  it('has no light boot splash left for a dark-mode visitor', () => {
    // Measured 2026-10-16: the built pages painted a cream #FFF8EE splash and a
    // cream body before React applied `.dark`, because the theme guard lived in
    // the repo-root index.html — a file Vike never uses as its document.
    expect(readRepo('vite.config.ts')).toMatch(/html\.dark\s+#boot-overlay\s*\{[^}]*#070b14/);
  });

  it('carries no excuse that the remap already handles', () => {
    // An excused token that IS remapped means the remap would be overridden by
    // the excuse's premise — one of the two is wrong.
    const redundant = [...EXCUSED.keys()].filter((t) => COVERED.has(t));
    expect(redundant, `already remapped in globals.css: ${redundant.join(', ')}`).toEqual([]);
  });
});

/**
 * The theme guard that runs BEFORE React — and the reason it is duplicated.
 *
 * It has to exist in two build paths (the Vite plugin that injects into every
 * prerendered page, and build.mjs's from-scratch SPA-fallback shell), so these
 * tests hold the two copies together instead of trusting them to stay in step.
 */
describe('theme FOUC guard — one behaviour, two build paths', () => {
  const MARKER = '<!-- __theme_guard_marker__ -->';
  const guardIn = (relative: string) => {
    const text = readRepo(relative);
    const at = text.indexOf(MARKER);
    if (at === -1) throw new Error(`no theme guard found in ${relative}`);
    return text.slice(at, text.indexOf('</script>', at) + '</script>'.length);
  };

  const viteGuard = guardIn('vite.config.ts');
  const buildGuard = guardIn('scripts/build.mjs');

  it('is byte-identical in vite.config.ts and scripts/build.mjs', () => {
    expect(buildGuard).toBe(viteGuard);
  });

  it('reads the same storage key ThemeContext writes', () => {
    const context = readRepo('src/context/ThemeContext.tsx');
    const key = /const STORAGE_KEY = '([^']+)'/.exec(context)?.[1];
    expect(key, 'STORAGE_KEY not found in ThemeContext.tsx').toBeTruthy();
    // A mismatch is invisible until a user's saved choice is ignored on reload.
    expect(viteGuard).toContain(`localStorage.getItem('${key}')`);
    expect(buildGuard).toContain(`localStorage.getItem('${key}')`);
  });

  it('applies both the class and color-scheme, and cannot break the boot', () => {
    for (const guard of [viteGuard, buildGuard]) {
      // `color-scheme` is what makes native scrollbars/controls dark.
      expect(guard).toMatch(/root\.style\.colorScheme = dark \? 'dark' : 'light'/);
      expect(guard).toContain("root.classList.add('dark')");
      // A blocked localStorage (private mode) must not throw during boot.
      expect(guard).toMatch(/try \{[\s\S]*\} catch \(e\) \{/);
    }
  });

  it('is injected into <head>, before anything paints', () => {
    // The plugin must target </head>, not </body>: a `<script>` at the end of
    // the body runs after the browser may already have painted the cream body.
    expect(readRepo('vite.config.ts')).toContain("html.replace('</head>', THEME_FOUC_GUARD");
  });

  it('is not duplicated back into index.html, which nothing serves', () => {
    // index.html is not the document Vike emits (measured: the built HTML has
    // none of its markers), so a guard living there is dead code that only
    // creates a second copy to drift.
    expect(readRepo('index.html')).not.toContain('growlancer-theme');
  });
});
