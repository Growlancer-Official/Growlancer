import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A page whose loader bails out before clearing its loading flag shows a
 * skeleton until the component unmounts — the "section loads forever" report.
 *
 * The shape that caused it: `loading` starts true, the loader marks itself
 * loading inside a try/finally, but a guard ABOVE the try returns first:
 *
 *     const fetchItems = useCallback(async () => {
 *       if (!user) return;              // ← loading stays true forever
 *       setLoading(true);
 *       try { ... } finally { setLoading(false); }
 *     }, [user]);
 *
 * `user` can genuinely be null for a signed-in account (auth still settling,
 * profile read failed, role mismatch), so this is not a theoretical path. Every
 * guard in the app now clears its own flag before returning; this test keeps it
 * that way.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..');

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !full.includes(`${path.sep}test${path.sep}`)) out.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
}

type Finding = { file: string; line: number; guard: string };

/** Loaders that can return without clearing the flag they are about to set. */
function hangingLoaders(): { findings: Finding[]; scanned: number } {
  const findings: Finding[] = [];
  let scanned = 0;

  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const flags = [...src.matchAll(/const \[(\w+),\s*(set\w+)\]\s*=\s*useState(?:<[^>]*>)?\(true\)/g)].map(
      (m) => ({ name: m[1], setter: m[2] }),
    );
    if (!flags.length) continue;

    for (const flag of flags) {
      const setTrue = new RegExp(`${flag.setter}\\(\\s*true\\s*\\)`, 'g');
      let match: RegExpExecArray | null;
      while ((match = setTrue.exec(src))) {
        const before = src.slice(0, match.index);
        const starts = [
          before.lastIndexOf('useCallback(async'),
          before.lastIndexOf('async function'),
          before.lastIndexOf('= async ('),
          before.lastIndexOf('async ('),
        ].filter((i) => i >= 0);
        if (!starts.length) continue;
        const start = Math.max(...starts);
        const prelude = src.slice(start, match.index);
        const tryAt = prelude.indexOf('try {');
        const guard = tryAt === -1 ? prelude : prelude.slice(0, tryAt);
        scanned += 1;

        const guardMatch = /if \([^)]*\)\s*return;/.exec(guard);
        if (guardMatch) {
          findings.push({
            file: path.relative(ROOT, file).split(path.sep).join('/'),
            line: src.slice(0, start + guardMatch.index).split('\n').length,
            guard: guardMatch[0],
          });
        }
      }
    }
  }

  return { findings, scanned };
}

describe('loaders always clear their loading flag', () => {
  const { findings, scanned } = hangingLoaders();

  it('scans a meaningful number of loaders', () => {
    // Guards against the scanner silently matching nothing and passing vacuously.
    expect(scanned).toBeGreaterThan(50);
  });

  it('no loader returns before clearing the flag it sets', () => {
    const detail = findings.map((f) => `  ${f.file}:${f.line}  ${f.guard}`).join('\n');
    expect(findings, `these loaders can leave a page on its skeleton forever:\n${detail}`).toEqual([]);
  });
});
