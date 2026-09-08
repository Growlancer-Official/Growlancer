import { describe, expect, it } from 'vitest';
import { packageCount, serviceFromPrice } from '../lib/servicePricing';

const pkg = (tier: string, price: number) => ({ tier, price, currency: 'INR' });

describe('serviceFromPrice', () => {
  it('uses the Basic tier when published', () => {
    const service = {
      price: 500,
      packages: [pkg('basic', 500), pkg('standard', 1500), pkg('premium', 4000)],
    };
    expect(serviceFromPrice(service)).toBe(500);
  });

  it('falls back to the lowest priced tier when Basic is missing/zero', () => {
    const service = {
      price: 0,
      packages: [pkg('standard', 1500), pkg('premium', 4000)],
    };
    expect(serviceFromPrice(service)).toBe(1500);
  });

  it('falls back to the legacy price column for single-price services', () => {
    const service = { price: 1200, packages: null };
    expect(serviceFromPrice(service)).toBe(1200);
    expect(serviceFromPrice({ price: null, packages: undefined })).toBe(0);
  });

  it('ignores zero/unpriced tiers', () => {
    const service = {
      price: 0,
      packages: [pkg('basic', 0), pkg('standard', 0), pkg('premium', 800)],
    };
    expect(serviceFromPrice(service)).toBe(800);
  });
});

describe('packageCount', () => {
  it('counts only packages with a real price', () => {
    expect(
      packageCount({ packages: [pkg('basic', 500), pkg('standard', 0), pkg('premium', 4000)] })
    ).toBe(2);
    expect(packageCount({ packages: null })).toBe(0);
    expect(packageCount({ packages: [pkg('basic', 500), pkg('standard', 1500), pkg('premium', 4000)] })).toBe(3);
  });
});
