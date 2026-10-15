import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locks the signup-profile guarantee added by
 * supabase/migrations/20270119000026_signup_profile_trigger.sql.
 *
 * The incident: a LinkedIn OAuth sign-up created an auth.users row and nothing
 * else (no profiles, no profiles_private, no wallet) because the profile leg was
 * a single browser RPC call, and PostgREST killed that request mid-flight
 * ("Warp server error: Thread killed by timeout manager", 2026-10-10 16:27:13Z)
 * while the client aborts after 15 s. That account could never finish
 * onboarding — the user experienced it as "signup hi nahi hota".
 *
 * These assertions read the migration itself, so a future edit that quietly
 * drops the trigger, the backfill, the fail-soft recording or the detector turns
 * the build red instead of silently eating sign-ups again.
 */
const THIS_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(THIS_FILE), '../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');

const MIGRATION_NAME = '20270119000026_signup_profile_trigger.sql';
const MIGRATION = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_NAME), 'utf8').replace(/\r\n/g, '\n');

/** The fail-soft handler and its record, as one falsifiable predicate. */
function hasFailSoftRecord(src: string): boolean {
  return /EXCEPTION WHEN OTHERS THEN[\s\S]{0,600}?INSERT INTO public\.signup_profile_failures \(user_id, email, error\)/.test(
    src,
  );
}

/** How many idempotency guards the migration carries. */
function conflictGuards(src: string): number {
  return (src.match(/ON CONFLICT \(id\) DO NOTHING/g) ?? []).length;
}

describe('signup profile trigger migration', () => {
  it('attaches an AFTER INSERT trigger on auth.users', () => {
    expect(MIGRATION).toContain('DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users');
    expect(MIGRATION).toMatch(/CREATE TRIGGER on_auth_user_created\s+AFTER INSERT ON auth\.users\s+FOR EACH ROW/);
    expect(MIGRATION).toContain('EXECUTE FUNCTION public.handle_new_auth_user_profile()');
    // AFTER (not BEFORE): a BEFORE trigger would hold the auth row while other
    // writers race it, and the wallet trigger chain belongs to the same txn.
    expect(MIGRATION).not.toMatch(/CREATE TRIGGER on_auth_user_created\s+BEFORE/);
  });

  it('creates both profile rows idempotently, profiles first', () => {
    const profilesInsert = MIGRATION.indexOf('INSERT INTO public.profiles (id, name, role, created_at)');
    const privateInsert = MIGRATION.indexOf(
      'INSERT INTO public.profiles_private (id, email, referral_code, onboarding_completed)',
    );
    expect(profilesInsert).toBeGreaterThan(-1);
    expect(privateInsert).toBeGreaterThan(-1);
    // profiles_private / wallets / notification_preferences all reference
    // profiles(id) ON DELETE CASCADE, so profiles must be written first.
    expect(profilesInsert).toBeLessThan(privateInsert);
    expect(conflictGuards(MIGRATION)).toBeGreaterThanOrEqual(2);
  });

  it('never lets a profile failure block the signup, and records it instead', () => {
    // A hard failure here would reject every new GitHub/LinkedIn user outright.
    expect(MIGRATION).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(hasFailSoftRecord(MIGRATION)).toBe(true);
    expect(MIGRATION).toContain('CREATE TABLE IF NOT EXISTS public.signup_profile_failures');
    // …and the record table itself is server-only.
    expect(MIGRATION).toContain('ALTER TABLE public.signup_profile_failures ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION).toContain(
      'REVOKE ALL ON public.signup_profile_failures FROM PUBLIC, anon, authenticated',
    );
  });

  it('repairs the accounts that were created while nothing created profiles', () => {
    const backfill = MIGRATION.slice(MIGRATION.indexOf('$backfill$'));
    expect(backfill).toMatch(/FROM auth\.users u\s+LEFT JOIN public\.profiles p ON p\.id = u\.id\s+WHERE p\.id IS NULL/);
    expect(backfill).toContain('PERFORM public.ensure_signup_profile(');
    expect(backfill).toContain('u.deleted_at IS NULL');
  });

  it('makes the whole class self-detecting through the hourly sweep', () => {
    expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION public.signup_ghost_accounts()');
    expect(MIGRATION).toContain("position('signup_ghost_account' in v_body)");
    expect(MIGRATION).toContain('EXECUTE v_body;');
    // The patch must abort on an anchor miss rather than silently no-op.
    expect(MIGRATION).toContain("RAISE EXCEPTION 'anchor not found in check_security_drift()");
  });

  it('is server-only: no app role may call the new writers or detector', () => {
    for (const fn of [
      'public.ensure_signup_profile(uuid, text, jsonb, timestamptz)',
      'public.signup_ghost_accounts()',
      'public.handle_new_auth_user_profile()',
    ]) {
      expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated`);
    }
    expect(MIGRATION).toContain("has_function_privilege('anon', v_oid, 'EXECUTE')");
    expect(MIGRATION).toContain("has_function_privilege('authenticated', v_oid, 'EXECUTE')");
  });

  it('carries a positive control that fails the deploy if the trigger stops working', () => {
    const assertions = MIGRATION.slice(MIGRATION.indexOf('$assertions$'));
    expect(assertions).toContain('positive control failed');
    expect(assertions).toContain('INSERT INTO auth.users (');
    expect(assertions).toContain("SELECT count(*) INTO v_rows FROM public.wallets WHERE user_id = v_probe");
    // The planted ghost must be reported by the detector…
    expect(assertions).toContain('FROM public.signup_ghost_accounts() g WHERE g.user_id = v_probe');
    // …and the probe must not survive the migration.
    expect(assertions).toContain("set_config('app.user_delete_in_progress', '1', true)");
    expect(assertions).toContain('probe auth row still present');
  });

  it('no later migration may drop the trigger (or the profile legs come back)', () => {
    const later = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && f > MIGRATION_NAME);
    const offenders = later.filter((f) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      return /DROP\s+TRIGGER[^;]*on_auth_user_created/i.test(sql);
    });
    expect(offenders, `migrations dropping on_auth_user_created: ${offenders.join(', ')}`).toEqual([]);
  });

  it('negative control — each predicate is falsifiable on the real file text', () => {
    // Deleting the failure record must break the "never blocks signup" rule.
    const withoutRecord = MIGRATION.replace(
      'INSERT INTO public.signup_profile_failures (user_id, email, error)',
      '-- removed by the negative control',
    );
    expect(hasFailSoftRecord(MIGRATION)).toBe(true);
    expect(hasFailSoftRecord(withoutRecord)).toBe(false);

    // Dropping the AFTER INSERT clause must break the attach check.
    const withoutTrigger = MIGRATION.replace(
      'CREATE TRIGGER on_auth_user_created\n  AFTER INSERT ON auth.users',
      'CREATE TRIGGER on_auth_user_created\n  BEFORE INSERT ON auth.users',
    );
    expect(withoutTrigger).not.toBe(MIGRATION); // the mutation really applied
    expect(withoutTrigger).not.toMatch(/CREATE TRIGGER on_auth_user_created\s+AFTER INSERT ON auth\.users/);

    // Losing the conflict guards would make the trigger non-idempotent.
    expect(conflictGuards(MIGRATION)).toBeGreaterThanOrEqual(2);
    expect(conflictGuards(MIGRATION.replace(/ON CONFLICT \(id\) DO NOTHING/g, ''))).toBe(0);
  });
});
