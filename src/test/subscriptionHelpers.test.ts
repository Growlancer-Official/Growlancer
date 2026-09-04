/**
 * Unit tests for src/lib/subscriptionHelpers.ts
 * Pure helper functions — no mocking needed.
 * Service methods (DB calls) are tested with a mock in separate integration tests.
 */
import { describe, it, expect } from 'vitest';
import {
  isProSubscription,
  subscriptionIsActive,
  type SubscriptionWithPlan,
} from '../lib/subscriptionHelpers';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSub(
  status: string,
  planName = 'Premium Monthly',
  planPrice = 299,
  trialEndDate?: string
): SubscriptionWithPlan {
  return {
    id: 'sub_test',
    user_id: 'user_123',
    plan_id: 'premium_monthly',
    status,
    plan: 'pro',
    start_date: new Date().toISOString(),
    trial_end_date: trialEndDate ?? null,
    trial_start_date: null,
    cancel_at_period_end: false,
    auto_renew: false,
    payment_provider: null,
    payment_subscription_id: null,
    subscription_end_date: null,
    expiry_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subscription_plans: {
      id: 'premium_monthly',
      name: planName,
      description: 'Premium plan',
      price: planPrice,
      interval: 'month',
      features: ['ai_assistant'],
      is_active: true,
      role: 'freelancer',
      trial_days: 7,
      ai_messages_limit: 1000,
      ai_priority: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  } as unknown as SubscriptionWithPlan;
}

// ─── isProSubscription ───────────────────────────────────────────────────────

describe('isProSubscription', () => {
  it('returns false for null', () => {
    expect(isProSubscription(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isProSubscription(undefined)).toBe(false);
  });

  it('returns true for active Premium plan', () => {
    expect(isProSubscription(makeSub('active'))).toBe(true);
  });

  it('returns true for active plan with name including "pro"', () => {
    expect(isProSubscription(makeSub('active', 'Pro Monthly', 299))).toBe(true);
  });

  it('returns false for cancelled status', () => {
    expect(isProSubscription(makeSub('cancelled'))).toBe(false);
  });

  it('returns false for expired status', () => {
    expect(isProSubscription(makeSub('expired'))).toBe(false);
  });

  it('returns false for pending status', () => {
    expect(isProSubscription(makeSub('pending'))).toBe(false);
  });

  it('returns false for active status with missing plan', () => {
    const sub = makeSub('active');
    sub.subscription_plans = undefined;
    expect(isProSubscription(sub)).toBe(false);
  });

  it('returns false for active plan with price 0 and no pro/premium in name', () => {
    expect(isProSubscription(makeSub('active', 'Free Plan', 0))).toBe(false);
  });

  describe('trial subscriptions', () => {
    it('returns true for trial with future end date', () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ahead
      expect(isProSubscription(makeSub('trial', 'Premium Monthly', 299, futureDate))).toBe(true);
    });

    it('returns false for trial with past end date (expired trial)', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
      expect(isProSubscription(makeSub('trial', 'Premium Monthly', 299, pastDate))).toBe(false);
    });

    it('returns false for trial with no end date', () => {
      const sub = makeSub('trial', 'Premium Monthly', 299, undefined);
      // trial_end_date is null
      expect(isProSubscription(sub)).toBe(false);
    });

    it('returns false for trial with invalid end date string', () => {
      expect(isProSubscription(makeSub('trial', 'Premium Monthly', 299, 'not-a-date'))).toBe(false);
    });
  });
});

// ─── subscriptionIsActive ────────────────────────────────────────────────────

describe('subscriptionIsActive', () => {
  it('returns false for null', () => {
    expect(subscriptionIsActive(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(subscriptionIsActive(undefined)).toBe(false);
  });

  it('returns true for status active', () => {
    expect(subscriptionIsActive(makeSub('active'))).toBe(true);
  });

  it('returns true for status trial', () => {
    expect(subscriptionIsActive(makeSub('trial'))).toBe(true);
  });

  it('returns false for status cancelled', () => {
    expect(subscriptionIsActive(makeSub('cancelled'))).toBe(false);
  });

  it('returns false for status expired', () => {
    expect(subscriptionIsActive(makeSub('expired'))).toBe(false);
  });

  it('returns false for status pending', () => {
    expect(subscriptionIsActive(makeSub('pending'))).toBe(false);
  });

  it('returns false when subscription has no status', () => {
    const sub = makeSub('active');
    (sub as any).status = undefined;
    expect(subscriptionIsActive(sub)).toBe(false);
  });
});
