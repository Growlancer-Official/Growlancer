import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locks the whole-surface authorization fixes from
 * supabase/migrations/20270119000019_surface_audit_authorization_fixes.sql.
 *
 * Why this exists: `scripts/e2e/surface-audit.mjs` walks the rest of the live
 * surface (every private table, every anon-executable helper that takes a
 * caller-supplied id) the way a browser reaches it. It found seven defects that
 * the curated pentest never touched, and three of them were critical — an
 * UNAUTHENTICATED caller could read every payout method, delete one, and flip
 * one to default, because the guard was written as
 *
 *     IF p_user_id <> auth.uid() THEN
 *
 * For an anonymous caller `auth.uid()` is NULL, so that comparison is NULL, so
 * the branch never ran. The guard reads as a guard and behaves as nothing.
 *
 * That shape is the thing to lock: it is invisible in review, it has now
 * appeared three times (raise_contract_dispute, the payout trio, and two
 * money-path functions nobody had looked at), and it fails OPEN. These
 * assertions read the migration text, so the fix and its test cannot drift.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20270119000019_surface_audit_authorization_fixes.sql',
);
const SQL = fs.readFileSync(MIGRATION, 'utf8');

/** Counts non-overlapping occurrences of a literal substring. */
function count(haystack: string, needle: string): number {
  expect(needle.length, 'needle must not be empty (a zero-length match is vacuous)').toBeGreaterThan(0);
  return haystack.split(needle).length - 1;
}

/**
 * The SQL with line comments removed.
 *
 * Some assertions below are about what the migration DOES, and this migration's
 * own prose quotes the broken guard in order to explain it. Asserting on
 * comment-stripped text is what keeps "the migration documents the bad shape"
 * from being indistinguishable from "the migration contains the bad shape"
 * (the lesson from 20270119000018).
 */
const SQL_NO_COMMENTS = SQL.replace(/--[^\n]*/g, '');

/** One `CREATE POLICY "name" ...;` statement, by its policy name. */
function policyBlock(name: string): string {
  const start = SQL.indexOf(`CREATE POLICY "${name}"`);
  expect(start, `migration lost the policy "${name}"`).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf(';', start));
}

describe('surface-audit authorization fixes (20270119000019)', () => {
  it('makes every affected guard NULL-safe, not merely different', () => {
    // The two accepted safe forms, used together: an explicit NULL branch, and
    // IS DISTINCT FROM (which can never itself yield NULL).
    expect(count(SQL, 'auth.uid() IS NULL THEN')).toBeGreaterThanOrEqual(5);
    expect(count(SQL, 'IS DISTINCT FROM auth.uid()')).toBeGreaterThanOrEqual(4);

    // The broken shape must survive ONLY as (a) prose explaining it, (b) the two
    // anchor strings these patches search for, and (c) the deliberately-planted
    // positive control that section 7 creates and drops again. Pinning the exact
    // count is deliberately brittle: a new executed `<> auth.uid()` guard — the
    // whole point of this file — changes the number and fails here.
    expect(count(SQL, '<> auth.uid()')).toBe(7);
    expect(count(SQL, '!= auth.uid()')).toBe(0);

    // The only two anchors are the two live guards being patched.
    expect(count(SQL, "IF v_contract.client_id <> auth.uid() THEN")).toBe(1);
    expect(count(SQL, "IF v_withdrawal.user_id <> auth.uid() AND NOT EXISTS (")).toBe(1);
    // ...and the planted control is created AND dropped inside the same block.
    const controls = SQL.slice(SQL.indexOf('$controls$'), SQL.indexOf('$assertions$'));
    expect(count(controls, 'IF p_user_id <> auth.uid() THEN')).toBe(1);
    expect(controls).toContain('DROP FUNCTION public.__surface_audit_null_unsafe();');
  });

  it('recreates the payout trio with the guard AND narrows the grant', () => {
    for (const fn of ['get_payout_methods', 'delete_payout_method', 'set_default_payout_method']) {
      expect(SQL).toContain(`FUNCTION public.${fn}`);
    }
    // A fixed guard plus an unchanged grant is only half a fix: a later edit to
    // the guard would silently re-open the endpoint.
    expect(count(SQL, 'REVOKE EXECUTE ON FUNCTION public.get_payout_methods(uuid) FROM PUBLIC, anon;')).toBe(1);
    expect(count(SQL, 'REVOKE EXECUTE ON FUNCTION public.delete_payout_method(uuid, uuid) FROM PUBLIC, anon;')).toBe(1);
    expect(count(SQL, 'REVOKE EXECUTE ON FUNCTION public.set_default_payout_method(uuid, uuid) FROM PUBLIC, anon;')).toBe(1);
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.get_payout_methods(uuid) TO authenticated, service_role;');
  });

  it('makes the internal money/audit/reputation writers server-only', () => {
    for (const fn of ['_refund_audit', '_refund_history_event', '_refund_notify', 'update_reputation_score']) {
      expect(SQL).toContain(`REVOKE EXECUTE ON FUNCTION public.${fn}(`);
      expect(SQL).toContain(`TO service_role;`);
    }
    // update_reputation_score is the ONLY writer of the merit-ranking columns,
    // so it must never be reachable by an app role (20261202000000 revoked it
    // once already; a later CREATE OR REPLACE reset the ACL to PUBLIC).
    expect(SQL).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.update_reputation_score\(uuid\)\s+FROM PUBLIC, anon, authenticated;/,
    );
  });

  it('breaks the workspace RLS recursion without trading it for a leak', () => {
    // The membership test moves into a SECURITY DEFINER helper that takes the
    // ids as ARGUMENTS. That fixes both defects at once: no policy has to
    // evaluate workspace_members' own policy (the 42P17 recursion), and no
    // clause can collapse to `wm.workspace_id = wm.workspace_id` through an
    // unqualified name.
    expect(SQL).toContain('FUNCTION public.is_workspace_member(p_workspace_id uuid, p_user_id uuid)');
    const helper = SQL.slice(
      SQL.indexOf('FUNCTION public.is_workspace_member'),
      SQL.indexOf('$function$;', SQL.indexOf('FUNCTION public.is_workspace_member')),
    );
    expect(helper).toContain('SECURITY DEFINER');
    expect(helper).toContain("SET search_path TO 'public', 'pg_catalog'");
    expect(helper).toContain('wm.workspace_id = p_workspace_id');
    expect(helper).toContain('wm.user_id = p_user_id');

    // All three policies must route through it. Asserted PER POLICY, not by a
    // total count: a single policy reverted to `USING (true)` still left the
    // overall count above a threshold, which is how a first version of this test
    // let exactly that regression through.
    for (const [policy, table] of [
      ['Members view own workspaces', 'workspaces'],
      ['Members view workspace members', 'workspace_members'],
      ['Members view activity logs', 'workspace_activity_logs'],
    ] as const) {
      const block = policyBlock(policy);
      expect(block, `${policy} lost its role scope`).toContain('TO authenticated');
      expect(block, `${policy} no longer routes through the helper`).toContain(
        'public.is_workspace_member(',
      );
      expect(block, `${policy} must be scoped to ${table}`).toContain(table);
    }
    // ...and authenticated must keep EXECUTE, or the fix denies everyone.
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated, service_role;');
  });

  it('repairs the two other tautological / dead policies', () => {
    // Unqualified `freelancer_id` resolved to services.freelancer_id, so the
    // "the offer must name the service's real owner" rule compared a column to
    // itself and constrained nothing.
    expect(SQL).toContain('services.freelancer_id = service_offers.freelancer_id');
    // The second razorpay_transactions policy compared two razorpay_orders
    // columns to each other; the correctly-correlated policy remains.
    expect(SQL).toContain(
      'DROP POLICY IF EXISTS "Users read own razorpay transactions" ON public.razorpay_transactions;',
    );
    expect(SQL).not.toContain('CREATE POLICY "Users read own razorpay transactions"');
  });

  it('detects the classes rather than only fixing the instances', () => {
    expect(SQL).toContain('FUNCTION public.null_unsafe_auth_guard()');
    expect(SQL).toContain('FUNCTION public.self_referential_policy_predicate()');

    const nullDetector = SQL.slice(
      SQL.indexOf('FUNCTION public.null_unsafe_auth_guard()'),
      SQL.indexOf('$function$;', SQL.indexOf('FUNCTION public.null_unsafe_auth_guard()')),
    );
    // Both comparison spellings, in both operand orders, plus the set form.
    expect(nullDetector).toContain("body ~ '(<>|!=)\\s*auth\\.uid\\(\\)'");
    expect(nullDetector).toContain("body ~ 'auth\\.uid\\(\\)\\s*(<>|!=)'");
    expect(nullDetector).toContain('not\\s+in');
    // ...and both safe forms excluded, or every correct guard would be flagged.
    expect(nullDetector).toContain('IS\\s+(NOT\\s+)?DISTINCT\\s+FROM');
    expect(nullDetector).toContain('auth\\.uid\\(\\)\\s+IS\\s+(NOT\\s+)?NULL');
    // Comments are stripped before matching, so the detector's own explanation
    // of the broken shape cannot make it flag itself.
    expect(nullDetector).toContain("regexp_replace(pg_get_functiondef(p.oid), '--[");

    const policyDetector = SQL.slice(
      SQL.indexOf('FUNCTION public.self_referential_policy_predicate()'),
      SQL.indexOf('$function$;', SQL.indexOf('FUNCTION public.self_referential_policy_predicate()')),
    );
    expect(policyDetector).toContain('([a-z_]+)\\.([a-z_]+)\\s*=\\s*\\1\\.\\2');
    expect(policyDetector).toContain("'self_reference'");
  });

  it('ships positive AND negative controls for both detectors', () => {
    // A detector that silently matches nothing is worse than no detector, so
    // the migration must plant a violator, require it to be flagged, and also
    // plant a CLEAN example and require it NOT to be flagged.
    expect(SQL).toContain('public.__surface_audit_null_unsafe');
    expect(SQL).toContain('public.__surface_audit_null_safe');
    expect(SQL).toContain('__surface_audit_tautology');
    expect(SQL).toContain('__surface_audit_recursion');
    expect(SQL).toContain('POSITIVE CONTROL FAILED');
    expect(SQL).toContain('NEGATIVE CONTROL FAILED');
    // The controls must clean up after themselves: a leftover probe function
    // would itself be found by the detector on the next sweep.
    expect(SQL).toContain("DROP FUNCTION public.__surface_audit_null_unsafe()");
    expect(SQL).toContain("DROP FUNCTION public.__surface_audit_null_safe()");
    expect(SQL).toContain('DROP TABLE public.__surface_audit_violator;');
    // ...and the helper's own semantics are asserted, or a helper that always
    // returns false would satisfy every policy while breaking the feature.
    expect(SQL).toContain('is_workspace_member(NULL, NULL)');
  });

  it('patches the two money-path guards by anchor, not by retyping them', () => {
    // release_milestone and process_withdrawal_complete are long bodies; the fix
    // replaces just the guard line, which only works if the anchor still matches.
    // Asserted per guard AND by count: a threshold-style check let a removed
    // RAISE slip through, because the other guard's identical message was
    // enough to satisfy `toContain`.
    // Slice to the END of that block, not to some later marker: a wider slice
    // swallowed every other RAISE in the file and made the count meaningless.
    const guards = SQL.slice(
      SQL.indexOf('$patch_guards$'),
      SQL.indexOf('$patch_guards$;') + '$patch_guards$;'.length,
    );
    expect(guards).toContain('release_milestone() guard anchor not found');
    expect(guards).toContain('process_withdrawal_complete() guard anchor not found');
    // Four guards in this block: "function not found" + "anchor not found" for
    // each of the two functions. Two of each, so removing either a missing-entity
    // check or an anchor-miss check fails this test.
    expect(count(guards, "RAISE EXCEPTION '")).toBe(4);
    expect(count(guards, 'position(v_anchor in v_src) = 0')).toBe(2);
    expect(count(guards, ') not found — cannot patch its guard')).toBe(2);
    expect(count(guards, 'guard anchor not found — patch would be a silent no-op')).toBe(2);
    // The service-role path each of them relies on is preserved EXPLICITLY rather
    // than accidentally (before the fix it worked only because `x <> NULL` is NULL).
    // Doubled quotes: inside the DO block these are SQL string literals building
    // the replacement, so the source reads ''role'' / ''service_role''.
    expect(guards).toContain("current_setting(''role'', true) IS DISTINCT FROM ''service_role''");
    expect(guards).toContain('EXECUTE v_src;');
  });

  it('patches the hourly sweep by anchor, failing loudly if the anchor moves', () => {
    // A `replace()` whose anchor no longer matches is a SILENT no-op — the
    // migration would report success while changing nothing.
    expect(count(SQL, "RAISE EXCEPTION 'check_security_drift() anchor not found — the patch would have been a silent no-op'")).toBe(1);
    expect(count(SQL, "RAISE EXCEPTION 'check_security_drift() patch produced no change'")).toBe(1);
    expect(count(SQL, 'IF v_new = v_src THEN')).toBe(1);
    // Exactly three anchor guards in total: two money-path functions + the sweep.
    expect(count(SQL, 'anchor not found')).toBe(3);
    // Idempotent re-run guard.
    expect(SQL).toContain("IF v_src LIKE '%null_unsafe_auth_guard%' THEN");
  });

  it('fails closed on the live schema before it is allowed to commit', () => {
    // Every fix gets an assertion against the live catalog, so a partial apply
    // cannot land: if any of these is false the migration aborts and changes
    // nothing.
    expect(SQL).toContain('$assertions$');
    for (const marker of [
      'still EXECUTE-granted to anon',
      'internal writer(s) still reachable by an app role',
      'workspace policies route through is_workspace_member()',
      'self-referential policy predicates remain',
      'NULL-unsafe auth guards remain',
      'non-correlated razorpay_transactions policy is still present',
      'authenticated cannot execute is_workspace_member()',
    ]) {
      expect(SQL, `missing fail-closed assertion: ${marker}`).toContain(marker);
    }
    // A detector asserted by counting its rows would be vacuous for a set-returning
    // function whose predicate is broken… but for a scalar it is ALWAYS 1. Both
    // new detectors are set-returning, so counting rows is correct here; assert
    // the shape so a future edit cannot swap in a scalar and keep the count.
    expect(SQL).toContain('RETURNS TABLE(function_name text)');
    expect(SQL).toContain('RETURNS TABLE(table_name text, policy_name text, kind text)');
  });
});
