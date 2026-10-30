import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copy may not spell money as "Rs 299" / "INR 299" / "$299".
 *
 * Growlanzo is an INR product: every amount on screen comes from
 * `formatCurrency` / the `₹` glyph so the currency follows the user's country.
 * The element audit's currency rule flags `(Rs\.?\s?\d)`, `(INR\s?\d)`,
 * `(\$\s?\d)` and `(€\s?\d)` as broken currency, and it caught the new Premium
 * page's info copy (`Pro (Rs 299/month) …`) on all three viewports — a real
 * shipped-string defect, not a formatter bug. This test runs the same patterns
 * over every rendered .tsx file so the next one fails at PR time instead of in
 * the audit.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// `$` and `€` are checked by the audit against RENDERED text only: a source
// scan cannot tell copy from a `.replace()` token (`$1`) or a template splice,
// and both exist in this repo. "Rs"/"INR" have no such legitimate use.
const BAD_CURRENCY = [
  { pattern: /\bRs\.?\s?\d/, label: '"Rs 299"' },
  { pattern: /\bINR\s?\d/, label: '"INR 299"' },
];

function tsxFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'test' || entry.name === '__snapshots__') continue;
        walk(full);
      } else if (entry.name.endsWith('.tsx')) {
        out.push(full);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
}

const FILES = tsxFiles();

describe('no rendered copy spells currency as a literal prefix', () => {
  it('scans the rendered surface', () => {
    expect(FILES.length).toBeGreaterThan(80);
  });

  it.each(BAD_CURRENCY)('no .tsx uses %s', ({ pattern }) => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const source = fs.readFileSync(file, 'utf8');
      const match = source.match(pattern);
      if (match) offenders.push(`${path.relative(ROOT, file).split(path.sep).join('/')}: ${match[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the ₹ glyph the product does use is present on the paid plan', () => {
    const page = fs
      .readFileSync(path.join(ROOT, 'src/pages/ProSubscriptionPage.tsx'), 'utf8')
      .replace(/\r\n/g, '\n');
    expect(page).toContain('₹199/month');
    // 199 is the ONLY paid price — the costlier tier must stay gone.
    expect(page).not.toContain('₹299');
    expect(page).not.toContain('₹499');
  });
});
