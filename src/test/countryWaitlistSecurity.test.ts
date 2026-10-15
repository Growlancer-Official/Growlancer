import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Security invariants for the country waitlist.
 *
 * CLAUDE.md §6: never accept a user_id (or, here, an email) from the request
 * body and act on it — identity must come from auth.getUser()/auth.uid().
 * CLAUDE.md §2/§8: financial/private tables are written only by SECURITY DEFINER
 * functions, and no permissive RLS write policy is left open.
 *
 * These are source-level guards: they fail on the shape of the code, which is
 * exactly the class of mistake that keeps reappearing (a permissive policy, a
 * body-supplied identity), not on a behaviour that only shows up in production.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const MIGRATION = 'supabase/migrations/20270119000028_country_waitlist_interest.sql';

describe('country waitlist client never supplies identity', () => {
  const client = read('src/lib/countryWaitlist.ts');

  it('joins the waitlist with the country only', () => {
    expect(client).toContain("'join_country_waitlist'");
    // Only p_country is sent — the RPC derives email/name from the caller rows.
    expect(client).toMatch(/p_country:\s*country/);
    expect(client).not.toContain('p_email');
    expect(client).not.toContain('p_user_id');
    expect(client).not.toContain('p_name');
  });

  it('never writes the waitlist table directly', () => {
    // Direct writes would need a permissive RLS INSERT policy, which the
    // migration deliberately removed.
    expect(client).not.toMatch(/\.from\(\s*['"]waitlist['"]\s*\)/);
  });

  it('logs failures instead of swallowing them (no empty catch)', () => {
    expect(client).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
    const catches = client.match(/catch\s*\(/g) ?? [];
    const logs = client.match(/console\.error\(/g) ?? [];
    expect(logs.length).toBeGreaterThanOrEqual(catches.length);
  });
});

describe('country waitlist migration keeps its guarantees', () => {
  const sql = read(MIGRATION);

  it('removes every client INSERT policy on the waitlist table', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Allow insert for join_waitlist RPC" ON public.waitlist');
    expect(sql).toContain('DROP POLICY IF EXISTS "Users can join waitlist" ON public.waitlist');
    // and asserts none came back
    expect(sql).toMatch(/cmd = 'INSERT'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'assertion failed: waitlist still accepts client INSERT policies/);
  });

  it('checks admin status on the server, from profiles_private', () => {
    expect(sql).toContain('FROM public.profiles_private pp');
    expect(sql).toContain('is_admin');
    expect(sql).toContain("'Unauthorized: admin access required'");
  });

  it('derives the capture identity from auth.uid()', () => {
    expect(sql).toContain('v_caller uuid := auth.uid();');
    expect(sql).toMatch(/IF v_caller IS NULL THEN/);
  });

  it('keeps the public aggregate RPC free of PII', () => {
    // country_waitlist_counts must select a count, never an email/name/id.
    const fn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.country_waitlist_counts'),
      sql.indexOf('COMMENT ON FUNCTION public.country_waitlist_counts'),
    );
    expect(fn).toContain('count(*)');
    expect(fn).not.toContain('w.email');
    expect(fn).not.toContain('w.name');
  });

  it('asserts the grant matrix by OID, not by a guessed signature', () => {
    expect(sql).toContain('to_regprocedure(');
    expect(sql).toContain("has_function_privilege('anon'");
  });

  it('widens signup_source to the values the app actually sends', () => {
    // The shipped CHECK only allowed direct_signup/google_oauth/linkedin_oauth,
    // while the app sends oauth + homepage (+ onboarding_dropdown).
    for (const value of ['oauth', 'homepage', 'onboarding_dropdown']) {
      expect(sql).toContain(`'${value}'`);
    }
  });

  it('fixes the uuid-into-bigint read in join_waitlist', () => {
    expect(sql).toContain('SELECT w.id INTO v_existing_id');
    expect(sql).toContain('v_existing_id uuid;');
    expect(sql).toMatch(/p\.prosrc LIKE '%v_existing_id bigint%'/);
  });
});
