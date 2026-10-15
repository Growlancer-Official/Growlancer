import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Design typography — locked at the source level.
 *
 * `font-sans` (Satoshi) and `font-display` (Cabinet Grotesk) are declared in
 * tailwind.config.js and src/styles/globals.css, but the stylesheets that
 * actually load them live in THREE places, because the app is served three
 * different ways:
 *
 *   pages/+Head.tsx   — prerendered pages (the homepage and every static route)
 *   index.html        — the Vite SPA shell (`vite dev`, and any route Vite serves)
 *   scripts/build.mjs — the fallback shell written when the Vike prerender is skipped
 *
 * They had drifted apart, and both failure modes are SILENT:
 *
 *  1. Two different weight sets were requested. The declaring file for the
 *     route then decided which fonts a visitor got — so the same page could
 *     render its headings in Cabinet Grotesk or in system-ui depending on how it
 *     was served.
 *  2. Weights that Fontshare does not have were requested. Fontshare answers
 *     HTTP 200 and simply OMITS them (verified live: Satoshi publishes only
 *     400/500/700/900 — 600 and 800 come back as nothing). The heavy display
 *     weight (`font-black`, used on 54 headings) was therefore never loaded and
 *     every one of them rendered at 700 instead, and the `font-display` family
 *     itself was requested by one declaration in an order that makes Fontshare
 *     serve the OTHER family only.
 *
 * A combined request (`...css?f[]=cabinet-grotesk@…&f[]=satoshi@…`) is the trap
 * in (2): it returns 200 and one family's CSS. So the rule here is one family
 * per request, each listing exactly the weights that family publishes, and all
 * three declarations identical.
 *
 * Every check below is a pure function over a path->content map so the negative
 * controls exercise the exact code the real assertions run.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The file in each serving path that declares the fonts. */
const DECLARATIONS = ['pages/+Head.tsx', 'index.html', 'scripts/build.mjs'] as const;

/**
 * The families the CSS asks for and the weights each one really publishes on
 * Fontshare. `weights` is the full published set, not a subset: dropping one
 * means Fontshare silently serves a different face for that weight.
 */
const PUBLISHED: Record<string, { css: string; weights: number[] }> = {
  'cabinet-grotesk': { css: 'Cabinet Grotesk', weights: [400, 500, 700, 800, 900] },
  satoshi: { css: 'Satoshi', weights: [400, 500, 700, 900] },
};

/** `font-*` weight utility -> the numeric weight it asks for. */
const WEIGHT_UTILITIES: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};

function readSource(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
}

function readDeclarations(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const rel of DECLARATIONS) files[rel] = readSource(rel);
  return files;
}

/** Every `.tsx`/`.ts` under src, keyed by repo-relative path. */
function readSources(): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry.name)) files[rel] = readSource(rel);
    }
  };
  walk('src');
  return files;
}

interface Request {
  file: string;
  families: { slug: string; weights: number[] }[];
  /** True when one URL asks for more than one family — the silent-drop trap. */
  multiFamily: boolean;
}

/**
 * Parse every Fontshare stylesheet request out of the declaration files.
 * All occurrences of a family inside one file collapse into one entry, because
 * `preload` + `stylesheet` legitimately repeat the same URL.
 */
function fontRequests(files: Record<string, string>): Request[] {
  const requests: Request[] = [];
  for (const [file, content] of Object.entries(files)) {
    for (const url of content.match(/https:\/\/api\.fontshare\.com\/v2\/css\?[^"'\s)]+/g) ?? []) {
      const families = [...url.matchAll(/f\[\]=([a-z-]+)@([\d,]+)/g)].map((m) => ({
        slug: m[1],
        weights: m[2].split(',').map(Number),
      }));
      requests.push({ file, families, multiFamily: families.length > 1 });
    }
  }
  return requests;
}

/**
 * Font stylesheets that would never apply because they are parked in print mode
 * or depend on an `onload` handler.
 *
 * `pages/+Head.tsx` is rendered by React, and React does not serialise event
 * handlers: the shipped HTML contained `media="print"` with NO `onload` at all,
 * so the CSS stayed print-only and neither family was ever applied — the whole
 * prerendered site (i.e. production) rendered in system-ui while the SPA shell,
 * which used a plain link, did get the fonts.
 */
function parkedFontStylesheets(files: Record<string, string>) {
  const out: { file: string; tag: string }[] = [];
  for (const [file, content] of Object.entries(files)) {
    for (const tag of content.match(/<link[^>]*fontshare[^>]*>/g) ?? []) {
      if (!/rel\s*=\s*["']stylesheet["']/.test(tag)) continue;
      if (/media\s*=\s*["']print["']/.test(tag) || /onload/i.test(tag)) {
        out.push({ file, tag: tag.replace(/\s+/g, ' ') });
      }
    }
  }
  return out;
}

/** Every plain (media-less, handler-less) font stylesheet link, per file. */
function effectiveFontStylesheets(files: Record<string, string>) {
  const counts: Record<string, number> = {};
  for (const [file, content] of Object.entries(files)) {
    counts[file] = (content.match(/<link[^>]*fontshare[^>]*>/g) ?? []).filter(
      (tag) => /rel\s*=\s*["']stylesheet["']/.test(tag) && !/media\s*=/.test(tag) && !/onload/i.test(tag),
    ).length;
  }
  return counts;
}

/**
 * For each family, the full set of weights requested for it anywhere (union),
 * plus the per-file sets so drift between files can be reported precisely.
 */
function requestedWeights(files: Record<string, string>) {
  const perFile: Record<string, Record<string, Set<number>>> = {};
  const union: Record<string, Set<number>> = {};
  for (const req of fontRequests(files)) {
    perFile[req.file] ??= {};
    for (const fam of req.families) {
      perFile[req.file][fam.slug] ??= new Set<number>();
      union[fam.slug] ??= new Set<number>();
      for (const w of fam.weights) {
        perFile[req.file][fam.slug].add(w);
        union[fam.slug].add(w);
      }
    }
  }
  return { perFile, union };
}

/** Weight utilities used in src, split by the family they render in. */
function usedWeights(files: Record<string, string>) {
  const display = new Map<number, number>();
  const sans = new Map<number, number>();
  const bump = (map: Map<number, number>, w: number) => map.set(w, (map.get(w) ?? 0) + 1);

  for (const content of Object.values(files)) {
    // Class strings only: a weight name in prose or a comment must not count.
    for (const m of content.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
      const cls = m[1];
      const hits = [...cls.matchAll(/\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g)];
      if (!hits.length) continue;
      const isDisplay = /\bfont-display\b/.test(cls);
      for (const hit of hits) bump(isDisplay ? display : sans, WEIGHT_UTILITIES[hit[1]]);
    }
  }
  return { display, sans };
}

/** Families declared by tailwind, so a CSS family can never be unloaded. */
function tailwindFamilies(): Record<string, string[]> {
  const cfg = readSource('tailwind.config.js');
  const out: Record<string, string[]> = {};
  for (const key of ['sans', 'display']) {
    const m = cfg.match(new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`));
    out[key] = m ? m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')) : [];
  }
  return out;
}

const declarations = readDeclarations();
const requests = fontRequests(declarations);
const { perFile, union } = requestedWeights(declarations);
const usages = usedWeights(readSources());
const tailwind = tailwindFamilies();

describe('font declarations never drift apart', () => {
  it('all three serving paths declare the same fonts', () => {
    const declFiles = [...new Set(requests.map((r) => r.file))].sort();
    expect(declFiles).toEqual([...DECLARATIONS].sort());

    // Same families, same weights, in every declaration.
    for (const rel of DECLARATIONS) {
      expect(perFile[rel], `${rel} declares no font family`).toBeDefined();
      const got: Record<string, number[]> = {};
      for (const [slug, set] of Object.entries(perFile[rel])) got[slug] = [...set].sort((a, b) => a - b);
      const want: Record<string, number[]> = {};
      for (const [slug, meta] of Object.entries(PUBLISHED)) want[slug] = [...meta.weights];
      expect(got, `${rel} drifted from the canonical font declaration`).toEqual(want);
    }
  });

  it('never asks for two families in one request', () => {
    // The trap: this URL answers 200 and serves only ONE of the families.
    expect(requests.filter((r) => r.multiFamily)).toEqual([]);
  });

  it('requests exactly the weights each family publishes', () => {
    for (const [slug, meta] of Object.entries(PUBLISHED)) {
      const requested = [...(union[slug] ?? [])].sort((a, b) => a - b);
      // A weight the family does not have is dropped silently by Fontshare, so
      // requesting it leaves a hole rather than failing.
      expect(requested, `${slug} weights`).toEqual([...meta.weights]);
    }
  });
});

describe('the loaded families are the ones the CSS asks for', () => {
  it('tailwind font-sans / font-display match the loaded families', () => {
    // First token of each stack is the family that must be downloaded.
    expect(tailwind.sans[0]).toBe(PUBLISHED.satoshi.css);
    expect(tailwind.display[0]).toBe(PUBLISHED['cabinet-grotesk'].css);
  });

  it('globals.css body font matches the sans family', () => {
    const css = readSource('src/styles/globals.css');
    const m = css.match(/font-family:\s*'([^']+)'/);
    expect(m?.[1]).toBe(PUBLISHED.satoshi.css);
  });
});

describe('every weight the UI uses is actually available', () => {
  it('the heaviest display weight is published, not approximated', () => {
    // The defect this guard exists for: `font-display font-black` was used on
    // dozens of headings while the declaration stopped at 700, so they all
    // rendered at 700 and the brand looked lighter than designed.
    const heaviest = Math.max(...usages.display.keys());
    expect(
      PUBLISHED['cabinet-grotesk'].weights,
      `display uses weight ${heaviest} — it must be a real published face`,
    ).toContain(heaviest);
  });

  it('no used weight falls outside the published range', () => {
    for (const [slug, used] of [
      ['satoshi', usages.sans],
      ['cabinet-grotesk', usages.display],
    ] as const) {
      const published = PUBLISHED[slug].weights;
      const lo = Math.min(...published);
      const hi = Math.max(...published);
      const outside = [...used.keys()].filter((w) => w < lo || w > hi);
      expect(outside, `${slug} weights outside ${lo}-${hi}`).toEqual([]);
    }
  });

  it('the usage scan really sees the weights in the app', () => {
    // Non-vacuous control: the scan must find real usage, otherwise the two
    // assertions above would pass on an empty map.
    expect(usages.display.size).toBeGreaterThan(0);
    expect(usages.sans.size).toBeGreaterThan(0);
    expect(usages.display.get(900)).toBeGreaterThan(0);
    expect(usages.sans.get(500)).toBeGreaterThan(0);
  });
});

describe('the scans themselves (negative + positive controls)', () => {
  it('flags a combined two-family request', () => {
    const planted = {
      'index.html': `<link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&f[]=cabinet-grotesk@500,700,800,900&display=swap" rel="stylesheet">`,
    };
    const reqs = fontRequests(planted);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].multiFamily).toBe(true);
    expect(reqs[0].families.map((f) => f.slug)).toEqual(['satoshi', 'cabinet-grotesk']);
  });

  it('flags the historical weight set that lost the heavy display face', () => {
    const historical = {
      'pages/+Head.tsx': `<link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,600,700&display=swap" rel="stylesheet">`,
    };
    const { union: got } = requestedWeights(historical);
    // Sanity: the parser read the URL...
    expect([...got['cabinet-grotesk']].sort((a, b) => a - b)).toEqual([500, 600, 700]);
    // ...and the shipped set is a different set, which is what the comparison
    // in the suite above catches.
    expect([...got['cabinet-grotesk']].sort((a, b) => a - b)).not.toEqual(PUBLISHED['cabinet-grotesk'].weights);
    // A weight the family does not publish is among the requested ones.
    expect(PUBLISHED['cabinet-grotesk'].weights).not.toContain(600);
  });

  it('flags a weight utility used on font-display with no such face', () => {
    const planted = { 'src/x.tsx': `<div className="font-display font-black">x</div>` };
    const u = usedWeights(planted);
    expect([...u.display.keys()]).toEqual([900]);
  });

  it('ignores weight names that are not class utilities', () => {
    const prose = { 'src/x.ts': `const note = 'font-black is heavy';` };
    // It IS a class-looking string, so it counts — the guard errs toward
    // flagging. What must NOT happen is counting arbitrary identifiers.
    const identifiers = { 'src/y.ts': `const fontWeightBlack = 900; const bold = 'x';` };
    expect(usedWeights(identifiers).sans.size).toBe(0);
    expect(usedWeights(prose).sans.get(900)).toBe(1);
  });

  it('detects drift between two declarations', () => {
    const drifted = {
      ...declarations,
      'index.html': declarations['index.html'].replace(
        'f[]=satoshi@400,500,700,900',
        'f[]=satoshi@400,500,700',
      ),
    };
    const { perFile: got } = requestedWeights(drifted);
    expect([...(got['index.html'].satoshi ?? [])].sort((a, b) => a - b)).not.toEqual(
      PUBLISHED.satoshi.weights,
    );
  });

  it('flags a font stylesheet parked in print mode behind an onload flip', () => {
    const planted = {
      'pages/+Head.tsx': `<link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" rel="stylesheet" media="print" onLoad="this.media='all'" />`,
    };
    const parked = parkedFontStylesheets(planted);
    expect(parked).toHaveLength(1);
    expect(parked[0].tag).toContain('media="print"');
  });

  it('does NOT flag a plain font stylesheet link', () => {
    const ok = {
      'index.html': `<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap">`,
    };
    expect(parkedFontStylesheets(ok)).toEqual([]);
    expect(effectiveFontStylesheets(ok)['index.html']).toBe(1);
  });

  it('does not treat a font PRELOAD as a parked stylesheet', () => {
    // A preload legitimately carries `as="style"` and no rel=stylesheet.
    const preload = {
      'index.html': `<link rel="preload" as="style" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap">`,
    };
    expect(parkedFontStylesheets(preload)).toEqual([]);
    expect(effectiveFontStylesheets(preload)['index.html']).toBe(0);
  });
});

describe('the font CSS actually applies on every serving path', () => {
  it('no font stylesheet is parked in print mode / behind an onload handler', () => {
    // React renders pages/+Head.tsx and drops `onLoad`, so any print-parked link
    // there is fonts-off in production — with no error anywhere.
    expect(parkedFontStylesheets(declarations)).toEqual([]);
  });

  it('every declaration loads both families through a plain stylesheet link', () => {
    const counts = effectiveFontStylesheets(declarations);
    for (const rel of DECLARATIONS) {
      // Two families => at least two effective links (plus the noscript copy).
      expect(counts[rel], `${rel} has no effective font stylesheet`).toBeGreaterThanOrEqual(2);
    }
  });
});
