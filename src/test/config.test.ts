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

  it('premium plan price is ₹199/month — the only paid price', () => {
    expect(PLATFORM_CONFIG.subscriptions.premium_monthly.price).toBe(199);
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
  // Freelancer-side commission: the client pays the agreed amount and nothing
  // is added on top (migration 20270203000000).
  it('returns the agreed amount unchanged', () => {
    expect(calculateTotalWithFee(10000)).toBe(10000);
  });

  it('adds no commission for any amount', () => {
    const amounts = [1000, 5000, 50000];
    for (const amount of amounts) {
      expect(calculateTotalWithFee(amount)).toBe(amount);
    }
  });

  it('total is the amount, never amount + fee', () => {
    const amount = 20000;
    expect(calculateTotalWithFee(amount)).toBe(amount);
    expect(calculateTotalWithFee(amount)).not.toBe(amount + calculatePlatformFee(amount));
  });

  it('never charges a negative or non-finite amount', () => {
    expect(calculateTotalWithFee(-500)).toBe(0);
    expect(calculateTotalWithFee(Number.NaN)).toBe(0);
  });
});

describe('calculateFreelancerAmount', () => {
  it('deducts the 5% commission from the released gross', () => {
    expect(calculateFreelancerAmount(10000)).toBe(9500);
  });

  it('is gross − fee for every amount, rounded to paisa', () => {
    const amounts = [0, 1000, 50000, 299, 999.99];
    for (const amount of amounts) {
      expect(calculateFreelancerAmount(amount)).toBeCloseTo(
        Math.max(amount - calculatePlatformFee(amount), 0),
        2,
      );
    }
  });

  it('never returns a negative payout', () => {
    expect(calculateFreelancerAmount(-100)).toBe(0);
    expect(calculateFreelancerAmount(0)).toBe(0);
  });
});

// ─── Business-model invariant (freelancer-side 5%) ───────────────────────────
// Client pays the agreed amount. The freelancer receives it minus 5%.
// freeloancer_net + platform_fee = client_total_charged.
describe('business model invariants', () => {
  it('client total = freelancer net + platform fee', () => {
    const bid = 15000;
    const clientTotal = calculateTotalWithFee(bid);
    const freelancerGets = calculateFreelancerAmount(bid);
    const fee = calculatePlatformFee(bid);
    expect(clientTotal).toBeCloseTo(freelancerGets + fee, 2);
    expect(clientTotal).toBe(bid);
  });

  it('platform earns exactly 5% of the released gross', () => {
    const bid = 8000;
    const fee = calculatePlatformFee(bid);
    expect((fee / bid) * 100).toBeCloseTo(5, 5);
  });

  it('matches the documented example: ₹10,000 → ₹500 fee → ₹9,500 net', () => {
    expect(calculatePlatformFee(10000)).toBe(500);
    expect(calculateFreelancerAmount(10000)).toBe(9500);
    expect(calculateTotalWithFee(10000)).toBe(10000);
  });
});
