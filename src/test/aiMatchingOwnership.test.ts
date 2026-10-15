import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * B1 — `ai-matching` used to authenticate the caller but never checked that
 * the project was theirs: a signed-in non-owner got `200 success`,
 * `ai_enhanced=true` and a real match list against someone else's project —
 * real AI spend per call, plus a full rewrite of that project's `ai_matches`
 * rows (the function runs on the service-role client, so RLS never sees it).
 *
 * Fix shape: the project fetch is OWNER-SCOPED in the WHERE clause
 * (`.eq('client_id', authData.user.id)`, id from the verified JWT, never the
 * request body) so a non-owner's request is indistinguishable from a missing
 * project (404, fail-closed), and the fetch happens BEFORE the AI gateway
 * call and before matches are deleted/rewritten.
 *
 * The runtime behaviour is asserted live by `scripts/e2e/ai-providers.mjs`
 * (`non-owner matching` must report ENFORCED, not_enforced fails the run);
 * this file locks the source-level invariant so a refactor can't silently
 * drop the guard between deploys.
 */

const functionsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/functions',
);

const rawSource = readFileSync(path.join(functionsDir, 'ai-matching/index.ts'), 'utf8');
const source = rawSource.replace(/\r\n/g, '\n');

/** Index of the owner-scoped project fetch, or -1 when the guard is absent. */
function ownerScopedFetchIndex(src: string): number {
  const fetchBlock = src.indexOf(".from('projects')");
  if (fetchBlock === -1) return -1;
  // The ownership predicate must be part of the projects query itself
  // (fail-closed WHERE clause), not a separate after-the-fact check.
  const window = src.slice(fetchBlock, fetchBlock + 600);
  if (!window.includes(".eq('id', project_id)")) return -1;
  const ownerScope = window.indexOf(".eq('client_id', authData.user.id)");
  if (ownerScope === -1) return -1;
  return fetchBlock + ownerScope;
}

/** Where the AI gateway spend begins (the semantic boost call site). */
function aiSpendIndex(src: string): number {
  return src.indexOf('await aiSemanticBoost(');
}

/** Where the project's existing matches get rewritten. */
function matchesRewriteIndex(src: string): number {
  return src.indexOf(".from('ai_matches')");
}

describe('ai-matching project-ownership guard (B1)', () => {
  it('the function file exists (guards against a broken path)', () => {
    expect(source.length).toBeGreaterThan(1000);
  });

  it('fetches the project owner-scoped in the WHERE clause', () => {
    const idx = ownerScopedFetchIndex(source);
    expect(idx).toBeGreaterThan(-1);
  });

  it('the caller id comes from the verified JWT, not the request body', () => {
    // The only auth identity in the function is authData.user.id from
    // supabaseAnon.auth.getUser(); the request body must never name the owner.
    expect(source).toContain('supabaseAnon.auth.getUser()');
    expect(source).not.toMatch(/eq\('client_id',\s*(?:req|body|payload)/);
  });

  it('ownership is checked before any AI gateway spend', () => {
    const owner = ownerScopedFetchIndex(source);
    const spend = aiSpendIndex(source);
    expect(owner).toBeGreaterThan(-1);
    expect(spend).toBeGreaterThan(-1);
    expect(owner).toBeLessThan(spend);
  });

  it('ownership is checked before matches are deleted or rewritten', () => {
    const owner = ownerScopedFetchIndex(source);
    const rewrite = matchesRewriteIndex(source);
    expect(owner).toBeGreaterThan(-1);
    expect(rewrite).toBeGreaterThan(-1);
    expect(owner).toBeLessThan(rewrite);
  });

  it('a non-owner request returns 404, indistinguishable from a missing project', () => {
    // Both failure paths must share the single 404 response shape.
    const notFoundResponses = source.match(/status: 404/g) ?? [];
    expect(notFoundResponses.length).toBe(1);
  });

  // ── Negative control: the detector above must be able to fail. ────────────
  // Reintroduce the exact defect (strip the ownership predicate from the
  // query) and prove every guarded assertion turns red — otherwise these
  // tests could pass against a guard-less file forever.
  it('detector fails when the ownership predicate is stripped (negative control)', () => {
    const defect = source.replace(".eq('client_id', authData.user.id)", '');
    expect(defect).not.toBe(source); // the mutation must actually change the file
    expect(ownerScopedFetchIndex(defect)).toBe(-1);

    const owner = ownerScopedFetchIndex(defect);
    const spend = aiSpendIndex(defect);
    const rewrite = matchesRewriteIndex(defect);
    // With the guard gone there is no ordering left to satisfy…
    expect(owner).toBe(-1);
    // …so "ownership before spend/rewrite" is no longer provable.
    expect(owner !== -1 && owner < spend).toBe(false);
    expect(owner !== -1 && owner < rewrite).toBe(false);
  });
});
