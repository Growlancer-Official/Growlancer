/**
 * Guard: referral codes are SAME-SIDE — a freelancer's code only works for
 * other freelancers, a client's only for other clients (founder decision,
 * 2026-10-22).
 *
 * The rule is enforced in two places on the server (a single gate is none):
 *   1. process_referral                    — rejects the code at record time
 *      with a plain-language error the onboarding UI already surfaces.
 *   2. award_referral_bonus_if_eligible    — re-checks at payout, expiring any
 *      row recorded before the migration or by an account that changed role.
 *
 * These tests pin that both gates survive future rewrites of the functions,
 * plus the client-side mirrors: the live validation on the onboarding page
 * (which catches the typo while typing instead of at submit) and the honest
 * copy on both referral dashboards and the share message.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const MIGRATION = read('supabase/migrations/20270204000000_same_role_referrals.sql');
const ONBOARDING = read('src/pages/OnboardingPage.tsx');
const REFERRALS_PAGE = read('src/pages/ReferralsPage.tsx');
const CLIENT_REFERRALS_PAGE = read('src/pages/ClientReferralsPage.tsx');
const SHARE = read('src/lib/referralShare.ts');
const GROW_COINS = read('src/lib/growCoins.ts');

describe('same-side referrals — record time', () => {
  it('process_referral compares the referrer role to the referee role', () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.process_referral\(/);
    // The gate reads both roles and fails closed on an unresolvable role.
    expect(MIGRATION).toMatch(/v_referrer_role IS DISTINCT FROM 'admin'/);
    expect(MIGRATION).toMatch(/v_referred_role != v_referrer_role/);
    expect(MIGRATION).toMatch(/v_referrer_role IS NULL/);
    expect(MIGRATION).toMatch(/v_referred_role IS NULL/);
  });

  it('rejects with a plain-language, same-side-specific error', () => {
    expect(MIGRATION).toMatch(/freelancers can only refer other freelancers/);
    expect(MIGRATION).toMatch(/clients can only refer other clients/);
    expect(MIGRATION).toMatch(/'error_code', 'role_mismatch'/);
  });

  it('keeps the pre-existing guards: self-signup, normalization, duplicates', () => {
    expect(MIGRATION).toMatch(/p_new_user_id IS DISTINCT FROM auth\.uid\(\)/);
    expect(MIGRATION).toMatch(/normalize_referral_code/);
    expect(MIGRATION).toMatch(/User already referred/);
  });
});

describe('same-side referrals — payout time', () => {
  it('the award RPC re-checks roles and expires mismatched rows without paying', () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.award_referral_bonus_if_eligible\(p_referred_user_id uuid\)/);
    expect(MIGRATION).toMatch(/'reason', 'role_mismatch'/);
    // Expiry, not deletion: the row stops looking pending, history stays.
    expect(MIGRATION).toMatch(/SET status = 'expired'/);
  });

  it('preserves the engagement condition, cap and idempotency from the coin migration', () => {
    expect(MIGRATION).toMatch(/v_bonus constant integer := 10/);
    expect(MIGRATION).toMatch(/v_cap constant integer := 20/);
    expect(MIGRATION).toMatch(/c\.status = 'completed'/);
    expect(MIGRATION).toMatch(/iv\.status = 'verified'/);
    expect(MIGRATION).toMatch(/bonus_claimed/);
    expect(MIGRATION).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it('stays server-only — the payout gate is never client-callable', () => {
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.award_referral_bonus_if_eligible\(uuid\) FROM PUBLIC, anon, authenticated/
    );
  });

  it('carries a fail-closed assertion checked against the live catalog', () => {
    expect(MIGRATION).toMatch(/same-side referral migration failed its own assertions/);
    expect(MIGRATION).toMatch(/pg_get_functiondef/);
    expect(MIGRATION).toMatch(/lost its role gate/);
  });
});

describe('same-side referrals — onboarding mirror', () => {
  it('the live validation compares the referrer role to the chosen role', () => {
    expect(ONBOARDING).toMatch(/'idle' \| 'checking' \| 'valid' \| 'invalid' \| 'wrong-role'/);
    expect(ONBOARDING).toMatch(/select\('id, name, role'\)/);
    expect(ONBOARDING).toMatch(/setReferralStatus\('wrong-role'\)/);
    // An admin's code is exempt, matching the server gate.
    expect(ONBOARDING).toMatch(/data\.role !== 'admin'/);
  });

  it('explains the same-side rule instead of a generic failure', () => {
    expect(ONBOARDING).toMatch(/Referral codes are same-side only/);
    expect(ONBOARDING).toMatch(/code can't be used by a/);
  });

  it('a wrong-role code is never submitted — only valid codes are applied', () => {
    expect(ONBOARDING).toMatch(/referralStatus === 'valid' && referralCode\.trim\(\)/);
  });
});

describe('same-side referrals — honest copy', () => {
  it('both dashboards say codes are same-side', () => {
    expect(REFERRALS_PAGE).toMatch(/Same Side Only/);
    expect(CLIENT_REFERRALS_PAGE).toMatch(/same-side: clients refer clients, freelancers refer freelancers/);
    expect(CLIENT_REFERRALS_PAGE).toMatch(/a client code can only refer other clients/);
  });

  it('the share message names its audience so recipients are pre-qualified', () => {
    expect(SHARE).toMatch(/Growlanzo clients only/);
    expect(SHARE).toMatch(/Growlanzo freelancers only/);
  });

  it('the bonus descriptions say who each code can refer', () => {
    expect(GROW_COINS).toMatch(/you can only refer other freelancers/);
    expect(GROW_COINS).toMatch(/you can only refer other clients/);
  });
});
