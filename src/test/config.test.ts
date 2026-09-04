/**
 * Unit tests for src/lib/config.ts
 * Pure math helpers — no mocking, no I/O.
 */
import { describe, it, expect } from 'vitest';
import {
  PLATFORM_CONFIG,
  calculatePlatformFee,
  calculateTotalWithFee,
  calculateFreelancerAmount,
} from '../lib/config';

describe('PLATFORM_CONFIG', () => {
  it('platform fee is exactly 5%', () => {
    expect(PLATFORM_CONFIG.fees.platform_percentage).toBe(5);
  });

  it('payment processing percentage is 2%', () => {
    expect(PLATFORM_CONFIG.fees.payment_processing_percentage).toBe(2);
  });

  it('withdrawal fee fixed is 0 (free withdrawals)', () => {
    expect(PLATFORM_CONFIG.fees.withdrawal_fee_fixed).toBe(0);
  });

  it('min project budget is 2000 INR', () => {
    expect(PLATFORM_CONFIG.limits.min_project_budget).toBe(2000);
  });

  it('premium plan price is ₹299/month', () => {
    expect(PLATFORM_CONFIG.subscriptions.premium_monthly.price).toBe(299);
  });

  it('premium plan proposals_per_month is 50', () => {
    expect(PLATFORM_CONFIG.subscriptions.premium_monthly.proposals_per_month).toBe(50);
  });

  it('free plan proposals_per_month is 5', () => {
    expect(PLATFORM_CONFIG.subscriptions.free.proposals_per_month).toBe(5);
  });
});

describe('calculatePlatformFee', () => {
  it('calculates 5% of 10000', () => {
    expect(calculatePlatformFee(10000)).toBe(500);
  });

  it('calculates 5% of 1000', () => {
    expect(calculatePlatformFee(1000)).toBe(50);
  });

  it('calculates 5% of 0', () => {
    expect(calculatePlatformFee(0)).toBe(0);
  });

  it('calculates correct fee for decimal amount', () => {
    expect(calculatePlatformFee(299)).toBeCloseTo(14.95, 2);
  });

  it('fee is always 5% of input regardless of amount', () => {
    const amounts = [100, 5000, 25000, 100000];
    for (const amount of amounts) {
      expect(calculatePlatformFee(amount)).toBeCloseTo(amount * 0.05, 5);
    }
  });
});

describe('calculateTotalWithFee', () => {
  it('returns amount + 5% fee', () => {
    expect(calculateTotalWithFee(10000)).toBe(10500);
  });

  it('returns 1.05x the input', () => {
    const amounts = [1000, 5000, 50000];
    for (const amount of amounts) {
      expect(calculateTotalWithFee(amount)).toBeCloseTo(amount * 1.05, 5);
    }
  });

  it('total = amount + fee', () => {
    const amount = 20000;
    expect(calculateTotalWithFee(amount)).toBe(amount + calculatePlatformFee(amount));
  });
});

describe('calculateFreelancerAmount', () => {
  it('freelancer receives the full bid amount — zero platform cut from freelancer', () => {
    expect(calculateFreelancerAmount(10000)).toBe(10000);
  });

  it('freelancer amount equals input for all values', () => {
    const amounts = [0, 1000, 50000, 1000000];
    for (const amount of amounts) {
      expect(calculateFreelancerAmount(amount)).toBe(amount);
    }
  });
});

// ─── Business-model invariant ────────────────────────────────────────────────
// The platform charges 5% on top of the bid. The freelancer gets the full bid.
// Client pays: bid + fee. Freelancer receives: bid. Platform earns: fee.
describe('business model invariants', () => {
  it('client total = freelancer amount + platform fee', () => {
    const bid = 15000;
    const clientTotal = calculateTotalWithFee(bid);
    const freelancerGets = calculateFreelancerAmount(bid);
    const fee = calculatePlatformFee(bid);
    expect(clientTotal).toBeCloseTo(freelancerGets + fee, 5);
  });

  it('platform earns exactly 5% on every transaction', () => {
    const bid = 8000;
    const fee = calculatePlatformFee(bid);
    const pctEarned = (fee / calculateTotalWithFee(bid)) * 100;
    // ~4.76% of total (5% on top of bid = 5/105 of total)
    expect(pctEarned).toBeCloseTo(4.762, 2);
  });
});
