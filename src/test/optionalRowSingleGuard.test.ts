// Regression lock: querying an OPTIONAL row with .single() makes PostgREST
// answer HTTP 406 (PGRST116 "JSON object requested, multiple (or no) rows")
// instead of returning null. On 2026-10-14 a live audit of the freelancer
// dashboard caught this exact wire-level defect on /dashboard/feed: every
// profile-less freelancer load produced a reproducible non-2xx.
//
// `freelancer_profiles` rows are created only by onboarding, so "row missing"
// is a normal state, not an error — .maybeSingle() is the correct API.
// This test fails if any query re-introduces .single() against that table.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const SRC = path.resolve(__dirname, '..');

describe('optional freelancer_profiles reads', () => {
  const offenders: string[] = [];

  for (const file of walk(SRC)) {
    // Skip this test file itself (it names the pattern in prose/comments).
    if (file === __filename) continue;
    const source = readFileSync(file, 'utf8');
    // Match: from('freelancer_profiles') … … .single() before the next query start.
    const queryPattern = /\.from\(\s*['"]freelancer_profiles['"]\s*\)([\s\S]*?)(?:\.from\(|$)/g;
    for (const match of source.matchAll(queryPattern)) {
      // Strip the correct calls first — whatever remains that is `.single()` is a
      // plain single and therefore a 406 waiting to happen. Line comments too: prose
      // that MENTIONS .single() must not trip the guard (the first version did exactly
      // that; strip the comment lines instead of weakening the check).
      const segment = match[1]
        .replace(/\.maybeSingle\(\)/g, '')
        .replace(/\/\/[^\n]*/g, '');
      if (/\.single\(\)/.test(segment)) {
        const line = source.slice(0, match.index! + match[0].indexOf('.single()')).split('\n').length;
        offenders.push(`${path.relative(SRC, file)}:${line}`);
      }
    }
  }

  it('never uses .single() against the optional freelancer_profiles table', () => {
    expect(offenders, `use .maybeSingle() instead:\n${offenders.join('\n')}`).toEqual([]);
  });
});
