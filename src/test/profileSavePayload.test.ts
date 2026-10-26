import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * The profile edit form exposes professional title, education and
 * certifications, counts them in the completion score and renders them — but
 * `handleProfileSave` used to omit all three from BOTH `freelancer_profiles`
 * payloads (update + insert). Every save silently discarded them, so a saved
 * title still showed "Not set" after reload. Caught by end-to-end dashboard
 * QA; locked here at the source level.
 *
 * Rule: every editable, completion-scored field must be written by BOTH save
 * branches — form → payload → DB cannot drift again.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(root, 'src/pages/dashboard/ProfessionalProfilePage.tsx'), 'utf8').replace(/\r\n/g, '\n');

const saveFn = src.slice(
  src.indexOf('const handleProfileSave'),
  src.indexOf('// ── Account Save'),
);

/** Both freelancer_profiles write branches: `.from('freelancer_profiles').update/insert({ … })`. */
const payloads = (): { kind: string; body: string }[] =>
  Array.from(
    saveFn.matchAll(/from\('freelancer_profiles'\)\s*\.\s*(update|insert)\(\{([\s\S]*?)\} as any\)/g),
  ).map((m) => ({ kind: m[1], body: m[2] }));

const SCORED_FIELDS = ['title', 'education', 'certifications'] as const;

describe('profile save payload (freelancer_profiles)', () => {
  it('handleProfileSave exists and writes freelancer_profiles in both branches', () => {
    expect(saveFn).toContain('handleProfileSave');
    const p = payloads();
    expect(p.map((x) => x.kind).sort()).toEqual(['insert', 'update']);
  });

  it.each(SCORED_FIELDS)('both save branches persist `%s`', (field) => {
    for (const { kind, body } of payloads()) {
      expect(
        body,
        `freelancer_profiles.${kind}() must include ${field}: formData.${field} — the form edits it and completion scores it, so dropping it resets the field on every save`,
      ).toContain(`${field}: formData.${field}`);
    }
  });

  it('the title input stays bound to the same formData field it saves', () => {
    // The Professional Title input must read/write formData.title so what the
    // user types is exactly what the payload persists.
    expect(src).toMatch(/value=\{formData\.title\} onChange=\{\(e\) => setFormData\(\{ \.\.\.formData, title: e\.target\.value \}\)\}/);
  });
});
