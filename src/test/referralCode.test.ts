import { describe, it, expect } from 'vitest';
import {
  REFERRAL_CODE_ALPHABET,
  buildReferralLink,
  formatReferralCode,
  generateReferralCode,
  isValidReferralCode,
  normalizeReferralCode,
} from '../lib/referralCode';

const MODERN_CODE = 'GRW-7K2M-9QXT';

describe('normalizeReferralCode', () => {
  it('strips dashes and spaces and upper-cases the code', () => {
    expect(normalizeReferralCode('grw 7k2m 9qxt')).toBe('GRW7K2M9QXT');
    expect(normalizeReferralCode('GRW-7K2M-9QXT')).toBe('GRW7K2M9QXT');
  });

  it('reads the code out of a pasted invite link', () => {
    expect(normalizeReferralCode('https://growlancer.com/signup?ref=GRW-7K2M-9QXT')).toBe('GRW7K2M9QXT');
    expect(normalizeReferralCode('https://growlancer.com/signup?ref=grw7k2m9qxt&utm=x')).toBe('GRW7K2M9QXT');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeReferralCode('')).toBe('');
    expect(normalizeReferralCode(null)).toBe('');
    expect(normalizeReferralCode(undefined)).toBe('');
    expect(normalizeReferralCode('   ')).toBe('');
  });
});

describe('formatReferralCode', () => {
  it('renders the modern code in groups of four', () => {
    expect(formatReferralCode('GRW7K2M9QXT')).toBe(MODERN_CODE);
    expect(formatReferralCode('grw-7k2m-9qxt')).toBe(MODERN_CODE);
  });

  it('leaves a legacy code exactly as stored so old shares keep working', () => {
    expect(formatReferralCode('GRW-FR-1A2B3C')).toBe('GRW-FR-1A2B3C');
  });

  it('is idempotent', () => {
    expect(formatReferralCode(formatReferralCode('GRW7K2M9QXT'))).toBe(MODERN_CODE);
  });
});

describe('isValidReferralCode', () => {
  it('accepts modern and legacy codes', () => {
    expect(isValidReferralCode('GRW-7K2M-9QXT')).toBe(true);
    expect(isValidReferralCode('grw7k2m9qxt')).toBe(true);
    expect(isValidReferralCode('GRW-FR-1A2B3C')).toBe(true);
  });

  it('rejects junk', () => {
    expect(isValidReferralCode('')).toBe(false);
    expect(isValidReferralCode('ABCDEFGH')).toBe(false);
    expect(isValidReferralCode('GRW-')).toBe(false);
  });
});

describe('generateReferralCode', () => {
  const pattern = new RegExp(
    `^GRW-[${REFERRAL_CODE_ALPHABET}]{4}-[${REFERRAL_CODE_ALPHABET}]{4}$`
  );

  it('matches the GRW-XXXX-XXXX shape', () => {
    for (let i = 0; i < 25; i += 1) {
      expect(generateReferralCode()).toMatch(pattern);
    }
  });

  it('never uses the ambiguous characters 0, O, 1, I, L or U', () => {
    for (let i = 0; i < 100; i += 1) {
      const body = generateReferralCode().replace(/^GRW-/, '').replace(/-/g, '');
      expect(body).not.toMatch(/[0O1ILU]/);
    }
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateReferralCode()));
    expect(codes.size).toBe(200);
  });

  it('validates as a referral code', () => {
    expect(isValidReferralCode(generateReferralCode())).toBe(true);
  });
});

describe('buildReferralLink', () => {
  it('builds the signup URL with the formatted code', () => {
    expect(buildReferralLink('GRW7K2M9QXT', 'https://growlancer.com')).toBe(
      'https://growlancer.com/signup?ref=GRW-7K2M-9QXT'
    );
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(buildReferralLink(MODERN_CODE, 'https://growlancer.com/')).toBe(
      'https://growlancer.com/signup?ref=GRW-7K2M-9QXT'
    );
  });

  it('returns an empty string when there is no code', () => {
    expect(buildReferralLink('', 'https://growlancer.com')).toBe('');
  });
});
