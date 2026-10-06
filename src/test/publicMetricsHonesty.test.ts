import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Honest public numbers — the homepage hero hardcoded
 * "Trusted by 1000+ members across India" while the live DB held 4 real
 * members. That is exactly the fake social proof the honest-metrics rule
 * forbids, and no behavioural test can catch it because it is copy, not logic.
 *
 * The line must be sourced from get_public_platform_metrics() via
 * useAboutPageMetrics() — the same single source of truth as the About page —
 * so the rendered count can only ever be the real one.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const home = read('src/pages/HomePage.tsx');

describe('homepage social proof is DB-backed', () => {
  it('the hero member count comes from the live metrics hook', () => {
    expect(home).toContain('useAboutPageMetrics');
    expect(home).toMatch(/raw\.members/);
    expect(home).toMatch(/members\.toLocaleString\(/);
  });

  it('renders no hardcoded member count next to the trust line', () => {
    // catches the old `>1000+</span> members` shape (literal number then members)
    expect(home).not.toMatch(/>\s*[\d,]+\+?\s*<\/span>\s*members?\b/i);
    expect(home).not.toContain('1000+');
    // nothing numeric may sit between "Trusted by" and the dynamic value
    expect(home).not.toMatch(/Trusted by[^<]*\b\d[\d,]*\b/i);
  });

  it('hides the line until the real number arrives (no placeholder number)', () => {
    expect(home).toMatch(/\{members !== null && \(/);
  });
});
