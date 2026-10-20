import { supabase } from './supabase';

// ────────────────────────────────────────────────────────────────────────────
// GROW COIN — frontend model for the referral-reward currency
//
// Mirrors the server contract in
// supabase/migrations/20270129000000_grow_coin_referral_rewards.sql:
//   • 1 Grow Coin = ₹1, whole coins only.
//   • A referral pays 10 coins, only after the referred user's first completed
//     contract or verified KYC — never on signup.
//   • Milestones pay the USER directly: 10 coins on verified KYC (real
//     provider), 20 coins on their first completed project (freelancer or
//     client). Each pays once per user.
//   • Minimum redemption is 100 coins.
//   • The balance is derived from the ledger server-side; this file never
//     "computes" a stored balance.
// ────────────────────────────────────────────────────────────────────────────

export const GROW_COIN = {
  /** ₹ value of one coin. Used for display only; the server owns the math. */
  valueInr: 1,
  /** Role-aware: freelancer gets 10 coins when their referral completes a contract; client gets 10 coins when their referral passes KYC. Both pay only after real engagement, never on signup. */
  referralBonus: 10,
  /** Milestone bonuses (once per user each, server-enforced). */
  kycBonus: 10,
  firstProjectBonus: 20,
  minRedemption: 100,
  monthlyBonusCap: 20,
  /** Premium (₹299/month) is priced in coins 1:1. Display fallback only. */
  premiumCost: 299,
} as const;

export type GrowCoinState = {
  balance: number;
  reserved: number;
  available: number;
  lifetimeEarned: number;
  redeemed: number;
  withdrawn: number;
  earnedThisMonth: number;
  monthlyCap: number;
};

export type GrowCoinLeader = {
  rank: number;
  name: string;
  avatar: string | null;
  referrals: number;
  isYou: boolean;
};

const EMPTY_STATE: GrowCoinState = {
  balance: 0,
  reserved: 0,
  available: 0,
  lifetimeEarned: 0,
  redeemed: 0,
  withdrawn: 0,
  earnedThisMonth: 0,
  monthlyCap: GROW_COIN.monthlyBonusCap,
};

/**
 * Format coins consistently everywhere: "🪙 240 Grow Coins".
 * Negative amounts are rendered with a leading minus and never as a balance.
 */
export function formatGrowCoins(amount: number, opts: { withLabel?: boolean; compact?: boolean } = {}): string {
  const { withLabel = true, compact = false } = opts;
  const safe = Number.isFinite(Number(amount)) ? Math.trunc(Number(amount)) : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const digits = compact && abs >= 1000
    ? new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(abs)
    : new Intl.NumberFormat('en-IN').format(abs);
  return withLabel ? `🪙 ${sign}${digits} Grow Coins` : `🪙 ${sign}${digits}`;
}

/** Number-only helper for places that already render their own coin icon. */
export function formatCoinAmount(amount: number): string {
  const safe = Number.isFinite(Number(amount)) ? Math.trunc(Number(amount)) : 0;
  return new Intl.NumberFormat('en-IN').format(safe);
}

/**
 * Client-side preview of the server discount rule.
 *
 * The server recomputes this from the authoritative balance — this function
 * exists so the checkout can show an honest number, and is asserted against
 * the same rules in src/test/growCoins.test.ts. It never sends a discount.
 */
export function previewCoinDiscount(
  coinsRequested: number,
  availableCoins: number,
  orderTotalInr: number
): { coinsUsed: number; discountInr: number; payableInr: number; reason?: string } {
  const total = Math.max(Number(orderTotalInr) || 0, 0);
  const requested = Math.trunc(Number(coinsRequested) || 0);
  const available = Math.max(Math.trunc(Number(availableCoins) || 0), 0);

  if (requested <= 0) {
    return { coinsUsed: 0, discountInr: 0, payableInr: total };
  }
  if (requested < GROW_COIN.minRedemption) {
    return { coinsUsed: 0, discountInr: 0, payableInr: total, reason: `Minimum ${GROW_COIN.minRedemption} coins` };
  }
  if (available < GROW_COIN.minRedemption) {
    return { coinsUsed: 0, discountInr: 0, payableInr: total, reason: `You need at least ${GROW_COIN.minRedemption} coins` };
  }

  // Razorpay requires a payable amount: coins never cover the last ₹1.
  const maxDiscount = Math.floor(total) - 1;
  if (maxDiscount < GROW_COIN.minRedemption) {
    return { coinsUsed: 0, discountInr: 0, payableInr: total, reason: 'This order is too small to use coins' };
  }

  const coinsUsed = Math.min(requested, available, maxDiscount);
  const discountInr = coinsUsed * GROW_COIN.valueInr;
  return { coinsUsed, discountInr, payableInr: total - discountInr };
}

/**
 * Returns the referral bonus description for the given role.
 * Freelancer referrals pay when their referral completes a contract as freelancer.
 * Client referrals pay when their referral passes KYC verification.
 * Admin sees the default freelancer description.
 * Both pay only after real engagement, never on signup.
 */
export function getReferralBonusDescription(role: 'freelancer' | 'client' | 'admin'): string {
  if (role === 'freelancer') {
    return '10 Grow Coins when your referral completes their first contract as a freelancer (or passes KYC verification) — never at signup.';
  }
  if (role === 'client') {
    return '10 Grow Coins when your referral passes KYC verification — never at signup.';
  }
  // admin
  return '10 Grow Coins when your referral completes their first contract as a freelancer (or passes KYC verification) — never at signup.';
}

/**
 * Returns the first-project bonus description for the given role.
 * Both freelancer and client earn 20 coins on their first completed project.
 * Admin sees the same description.
 */
export function getFirstProjectBonusDescription(role: 'freelancer' | 'client' | 'admin'): string {
  return '20 Grow Coins when your first project completes (once per user).';
}

/**
 * Returns the KYC bonus description (same for all roles).
 * Admin sees the same description.
 */
export function getKycBonusDescription(role: 'freelancer' | 'client' | 'admin'): string {
  return '10 Grow Coins when your identity verification is verified by a real provider.';
}

/** Stable per-action key so a double click cannot debit twice. */
export function newCoinRequestKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts: still unique enough for idempotency.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

type BalanceResponse = {
  success?: boolean;
  error?: string;
  balance?: number;
  reserved?: number;
  available?: number;
  lifetime_earned?: number;
  redeemed?: number;
  withdrawn?: number;
  earned_this_month?: number;
  monthly_cap?: number;
};

export async function fetchGrowCoinState(userId: string): Promise<GrowCoinState> {
  const { data, error } = await (supabase.rpc as any)('get_grow_coin_balance', { p_user_id: userId });
  if (error) throw new Error(error.message);
  const row = (data || {}) as BalanceResponse;
  if (row.success === false) {
    throw new Error(row.error || 'Could not load Grow Coins');
  }
  return {
    balance: Number(row.balance) || 0,
    reserved: Number(row.reserved) || 0,
    available: Number(row.available) || 0,
    lifetimeEarned: Number(row.lifetime_earned) || 0,
    redeemed: Number(row.redeemed) || 0,
    withdrawn: Number(row.withdrawn) || 0,
    earnedThisMonth: Number(row.earned_this_month) || 0,
    monthlyCap: Number(row.monthly_cap) || GROW_COIN.monthlyBonusCap,
  };
}

export async function fetchGrowCoinLeaderboard(limit = 10): Promise<GrowCoinLeader[]> {
  const { data, error } = await (supabase.rpc as any)('get_grow_coin_leaderboard', { p_limit: limit });
  if (error) throw new Error(error.message);
  return ((data || []) as any[]).map((row) => ({
    rank: Number(row.rank) || 0,
    name: String(row.display_name || 'Growlancer member'),
    avatar: (row.avatar as string | null) ?? null,
    referrals: Number(row.referrals) || 0,
    isYou: row.is_self === true,
  }));
}

export async function redeemGrowCoinsForCash(coins: number, requestKey: string) {
  const { data, error } = await (supabase.rpc as any)('redeem_grow_coins_for_cash', {
    p_amount_coins: coins,
    p_idempotency_key: requestKey,
  });
  if (error) throw new Error(error.message);
  if (data?.success === false) throw new Error(data.error || 'Redemption failed');
  return data;
}

export async function redeemGrowCoinsForPremium(requestKey: string) {
  const { data, error } = await (supabase.rpc as any)('redeem_grow_coins_for_premium', {
    p_idempotency_key: requestKey,
  });
  if (error) throw new Error(error.message);
  if (data?.success === false) throw new Error(data.error || 'Redemption failed');
  return data;
}

export const GROW_COIN_EMPTY_STATE = EMPTY_STATE;
