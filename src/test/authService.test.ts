/**
 * Unit tests for src/lib/services/authService.ts
 * Tests pure helpers (normalizeRole, createReferralCode) without mocking.
 * DB-dependent functions (fetchUserProfile, createUserProfile) are integration
 * tested with a Supabase mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeRole, createReferralCode } from '../lib/services/authService';

// ─── normalizeRole ───────────────────────────────────────────────────────────

describe('normalizeRole', () => {
  it('accepts "freelancer"', () => {
    expect(normalizeRole('freelancer')).toBe('freelancer');
  });

  it('accepts "client"', () => {
    expect(normalizeRole('client')).toBe('client');
  });

  it('accepts "admin"', () => {
    expect(normalizeRole('admin')).toBe('admin');
  });

  it('returns null for empty string', () => {
    expect(normalizeRole('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeRole(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(normalizeRole(null)).toBeNull();
  });

  it('returns null for number', () => {
    expect(normalizeRole(1)).toBeNull();
  });

  it('returns null for unknown string', () => {
    expect(normalizeRole('superadmin')).toBeNull();
  });

  it('returns null for uppercase "FREELANCER"', () => {
    // Role values are stored lowercase in DB — uppercase should be invalid
    expect(normalizeRole('FREELANCER')).toBeNull();
  });

  it('returns null for object', () => {
    expect(normalizeRole({ role: 'admin' })).toBeNull();
  });
});

// ─── createReferralCode ──────────────────────────────────────────────────────

describe('createReferralCode', () => {
  const pattern = /^GRW-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/;

  it('uses the canonical GRW-XXXX-XXXX format', () => {
    expect(createReferralCode()).toMatch(pattern);
  });

  it('generates different codes each call', () => {
    const codes = new Set(Array.from({ length: 50 }, () => createReferralCode()));
    expect(codes.size).toBeGreaterThan(45);
  });

  it('never encodes the role, even when a role prefix is passed', () => {
    // The old format was GRW-<ROLE>-<4 chars>, which leaked the owner's role.
    const parts = createReferralCode('FR').split('-');
    expect(parts).toHaveLength(3);
    expect(parts[1]).toHaveLength(4);
  });

  it('avoids characters that are easy to mistype', () => {
    for (let i = 0; i < 20; i += 1) {
      const body = createReferralCode().slice(4).replace('-', '');
      expect(body).not.toMatch(/[0O1ILU]/);
    }
  });

  it('keeps a stable length so the format cannot drift', () => {
    for (let i = 0; i < 20; i += 1) {
      const code = createReferralCode();
      expect(code).toHaveLength(13);
      expect(code.slice(0, 4)).toBe('GRW-');
    }
  });
});


// ─── fetchUserProfile with mock ──────────────────────────────────────────────

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      admin: {
        deleteUser: vi.fn(),
      },
    },
  },
}));

vi.mock('../lib/telemetry', () => ({
  captureError: vi.fn(),
}));

describe('fetchUserProfile (with Supabase mock)', () => {
  let mockSupabase: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { supabase } = await import('../lib/supabase');
    mockSupabase = supabase.from as ReturnType<typeof vi.fn>;
  });

  it('returns null when profile row is not found', async () => {
    mockSupabase.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    });

    const { fetchUserProfile } = await import('../lib/services/authService');
    const result = await fetchUserProfile('user-not-found');
    expect(result).toBeNull();
  });

  it('returns null when DB query returns an error', async () => {
    mockSupabase.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'DB connection error' },
            }),
          }),
        }),
      }),
    });

    const { fetchUserProfile } = await import('../lib/services/authService');
    const result = await fetchUserProfile('user_123');
    expect(result).toBeNull();
  });

  it('returns null for a suspended user', async () => {
    const profileData = { id: 'user_123', name: 'Test User', role: 'freelancer', avatar: null, country: null, is_pro: false, verification_status: 'none', created_at: new Date().toISOString() };
    const privateData = { email: 'test@example.com', phone: null, is_admin: false, suspended_at: new Date().toISOString(), onboarding_completed: true, referral_code: 'GRW-FR-ABCD' };

    mockSupabase
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: profileData, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: privateData, error: null }),
          }),
        }),
      });

    const { fetchUserProfile } = await import('../lib/services/authService');
    const result = await fetchUserProfile('user_123');
    expect(result).toBeNull();
  });

  it('returns full profile for a valid active user', async () => {
    const profileData = { id: 'user_123', name: 'Test User', role: 'freelancer', avatar: null, country: 'IN', is_pro: true, verification_status: 'verified', created_at: new Date().toISOString() };
    const privateData = { email: 'test@example.com', phone: '+91-9876543210', is_admin: false, suspended_at: null, onboarding_completed: true, referral_code: 'GRW-FR-ABCD' };

    mockSupabase
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: profileData, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: privateData, error: null }),
          }),
        }),
      });

    const { fetchUserProfile } = await import('../lib/services/authService');
    const result = await fetchUserProfile('user_123');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('user_123');
    expect(result?.name).toBe('Test User');
    expect(result?.role).toBe('freelancer');
    expect(result?.email).toBe('test@example.com');
    expect(result?.isPro).toBe(true);
    expect(result?.verificationStatus).toBe('verified');
    expect(result?.onboardingCompleted).toBe(true);
  });

  it('overrides role with admin when is_admin=true in profiles_private', async () => {
    const profileData = { id: 'admin_user', name: 'Admin User', role: 'freelancer', avatar: null, country: null, is_pro: false, verification_status: 'none', created_at: new Date().toISOString() };
    const privateData = { email: 'admin@growlanzo.com', phone: null, is_admin: true, suspended_at: null, onboarding_completed: true, referral_code: 'GRW-AD-AAAA' };

    mockSupabase
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: profileData, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: privateData, error: null }),
          }),
        }),
      });

    const { fetchUserProfile } = await import('../lib/services/authService');
    const result = await fetchUserProfile('admin_user');
    expect(result?.role).toBe('admin');
  });
});
