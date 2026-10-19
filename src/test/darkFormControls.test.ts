import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Dark theme — native controls, dropdown lists and floating panels.
 *
 * Three defects measured on the 2026-10-19 sweep, none of which the palette
 * remap could ever see (it only matches utility CLASSES, and these elements
 * carry none):
 *
 *   1. A native control with no `bg-*` class (124 of them across 24 files,
 *      including most `<select>`s) painted the BROWSER'S dark field colour:
 *      rgb(18,18,18) in Chrome, rgb(59,59,59) in headless Chromium. Measured on
 *      /services, /freelancers, /report and /contact — a neutral grey surface
 *      that belongs to no palette the product ships. The fix is a base-layer,
 *      zero-specificity rule so every existing `bg-*`/`hover:bg-*` still wins.
 *   2. The popup a `<select>` opens is painted by the browser too, and an
 *      option inside a translucent white select inherits white text — grey
 *      popup in dark, unreadable option in light. Both themes are pinned.
 *   3. Each floating menu remapped to `bg-white` (#0f172a), the SAME colour as
 *      the card it opens from, so a dropdown read as a flat grey block. The
 *      `menu-surface` hook lifts it one tone in dark and is inert in light.
 *
 * This guard reads globals.css and the panel call-sites, so a new dropdown that
 * forgets the hook — or a refactor that drops the rules — fails here instead of
 * shipping grey chrome to dark-mode users.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const CSS_RAW = read('src/styles/globals.css');
/** Comments describe these very rules, so scans run against a blanked copy. */
const CSS = CSS_RAW.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));

/**
 * The argument list of the `:where(…)` that precedes `needle`, matched with
 * BALANCED parens. A flat `[^)]*` stops at the first `)` — i.e. inside
 * `input:not([type='checkbox'])`, which truncated the selector list and made an
 * earlier version of this file silently assert against half a rule.
 */
function whereArgs(selector: string): string | null {
  const open = selector.indexOf(':where(');
  if (open === -1) return null;
  let depth = 0;
  for (let i = open + ':where('.length - 1; i < selector.length; i++) {
    if (selector[i] === '(') depth++;
    else if (selector[i] === ')') {
      depth--;
      if (depth === 0) return selector.slice(open + ':where('.length, i);
    }
  }
  return null;
}

/** Every floating dropdown panel in the app, with the file that owns it. */
const MENU_SURFACES = [
  'src/components/AccountMenu.tsx',
  'src/components/CountrySelect.tsx',
  'src/components/IndustrySelect.tsx',
  'src/components/NotificationsPanel.tsx',
  'src/pages/ClientInvitesPage.tsx',
  'src/pages/ClientProjectsPage.tsx',
  'src/pages/ClientProposalsPage.tsx',
  'src/pages/dashboard/NotificationsCenterPage.tsx',
];

describe('dark theme — native form controls', () => {
  it('gives an unstyled control a palette surface instead of the UA grey', () => {
    // The rule must exist, be scoped to .dark, and paint the palette tone.
    const at = CSS.indexOf('background-color: #0d1626');
    expect(at, 'no .dark rule paints #0d1626 — native controls fall back to the UA grey').toBeGreaterThan(-1);
    const selector = CSS.slice(CSS.lastIndexOf('}', at) + 1, at).trim();
    expect(selector.startsWith('.dark'), `the field rule must be scoped to .dark:\n  ${selector}`).toBe(true);

    const args = whereArgs(selector) || '';
    expect(args, 'could not read the :where(...) argument list').toContain('input');
    // Controls that are NOT text-ish fields must stay out of it.
    for (const type of ['checkbox', 'radio', 'range', 'file', 'color', 'submit', 'button', 'image']) {
      expect(args, `${type} should not be repainted`).toContain(`[type='${type}']`);
    }
    for (const tag of ['select', 'textarea']) {
      expect(args, `${tag} should be repainted`).toContain(tag);
    }
  });

  it('pins option colours in BOTH themes (the popup is browser-painted)', () => {
    const light = CSS.match(/(^|\n)\s*option,\s*\n\s*optgroup\s*\{(?<body>[^}]*)\}/);
    expect(light, 'option/optgroup has no light-mode colour pair').toBeTruthy();
    expect(light!.groups!.body).toMatch(/background-color:\s*#ffffff/);
    expect(light!.groups!.body).toMatch(/color:\s*#0f172a/);

    const dark = CSS.match(/\.dark[^{}]*:where\(option,\s*optgroup\)[^{}]*\{(?<body>[^}]*)\}/);
    expect(dark, 'option/optgroup has no dark-mode colour pair').toBeTruthy();
    expect(dark!.groups!.body).toMatch(/background-color:\s*#0f172a/);
    expect(dark!.groups!.body).toMatch(/color:\s*#e2e8f0/);
  });

  it('keeps the field rule under every utility (base layer, zero specificity)', () => {
    // A field that sets its own bg (the translucent hero search bar) must win.
    const ruleAt = CSS.indexOf('background-color: #0d1626');
    expect(ruleAt).toBeGreaterThan(-1);
    const before = CSS.slice(0, ruleAt);
    // It must sit in @layer base — utilities are emitted later and win there,
    // and state variants out-specify `:where()` regardless.
    const layerBase = before.lastIndexOf('@layer base');
    const layerComponents = before.lastIndexOf('@layer components');
    const layerUtilities = before.lastIndexOf('@layer utilities');
    expect(layerBase).toBeGreaterThan(layerComponents);
    expect(layerBase).toBeGreaterThan(layerUtilities);
    expect(before.slice(ruleAt - 400, ruleAt)).toContain(':where(');
  });
});

describe('dark theme — floating dropdown surfaces', () => {
  it('lifts the panel one tone above the card, with a border and a real shadow', () => {
    const rule = CSS.match(/html\.dark\s+\.menu-surface\s*\{(?<body>[^}]*)\}/);
    expect(rule, 'the .menu-surface dark rule is missing — panels blend into their card').toBeTruthy();
    expect(rule!.groups!.body).toMatch(/background-color:\s*#16233b/);
    expect(rule!.groups!.body).toMatch(/border-color:/);
    expect(rule!.groups!.body).toMatch(/box-shadow:/);
  });

  it('keeps every menu rule OUT of @layer and behind an html.dark prefix', () => {
    // Same measured reason as the state-variant block: inside a layer Tailwind
    // emits its own utilities afterwards and the tie is lost.
    const spans: { from: number; to: number }[] = [];
    let cursor = 0;
    while ((cursor = CSS.indexOf('@layer', cursor)) !== -1) {
      const open = CSS.indexOf('{', cursor);
      if (open === -1) break;
      let depth = 0;
      let end = -1;
      for (let i = open; i < CSS.length; i++) {
        if (CSS[i] === '{') depth++;
        else if (CSS[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end !== -1) spans.push({ from: cursor, to: end });
      cursor = end === -1 ? CSS.length : end + 1;
    }
    expect(spans.length, 'no @layer block found — this check would pass vacuously').toBeGreaterThan(0);

    for (const m of CSS.matchAll(/([^\n{}]*\.menu-surface[^{}]*)\{/g)) {
      const index = m.index ?? 0;
      expect(
        spans.some((s) => index > s.from && index < s.to),
        `this .menu-surface rule is inside an @layer and would lose the tie:\n  ${m[1].trim()}`
      ).toBe(false);
      expect(m[1].trim().startsWith('html.dark'), `needs the html.dark prefix:\n  ${m[1].trim()}`).toBe(true);
    }
  });

  it('keeps the hover pseudo OUTSIDE :where() (or it is zeroed and dead)', () => {
    const hover = CSS.match(/html\.dark[^{}]*\.menu-surface[^{}]*\.hover\\:bg-slate-50:hover[^{}]*\{/);
    expect(hover, 'the in-panel hover remap is missing (hover would sink, not lift)').toBeTruthy();
    expect(hover![0]).not.toMatch(/:hover\)/);
  });

  it('wires the hook into every floating panel call-site', () => {
    const missing = MENU_SURFACES.filter((file) => !/menu-surface/.test(read(file)));
    expect(missing, `these dropdown panels are not using menu-surface: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('dark theme — the checks themselves are not vacuous', () => {
  it('a sheet without the rules fails the same assertions', () => {
    // Simulate the pre-fix sheet: UA default field colour, no option pinning,
    // no elevated panel — then re-run the three shapes the tests above demand.
    const stripped = CSS
      .replace(/background-color: #0d1626/g, 'background-color: #121212')
      .replace(/:where\(option,\s*optgroup\)/g, ':where(option-nope, optgroup-nope)')
      .replace(/\.menu-surface/g, '.menu-panel-nope')
      .replace(/#16233b/g, '#0f172a');
    expect(stripped).not.toContain('background-color: #0d1626');
    expect(/html\.dark\s+\.menu-surface\s*\{/.test(stripped)).toBe(false);
    expect(/:where\(option,\s*optgroup\)/.test(stripped)).toBe(false);
    // ...and the positive matchers really do key off those strings.
    expect(/\.dark[^{}]*:where\([^)]*option-nope[^)]*\)/.test(stripped)).toBe(true);
  });

  it('found panels to check (the call-site scan is not empty)', () => {
    expect(MENU_SURFACES.length).toBeGreaterThan(4);
    for (const file of MENU_SURFACES) expect(read(file).length).toBeGreaterThan(200);
  });
});
