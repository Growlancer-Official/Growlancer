import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabase = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  functions: {
    invoke: vi.fn(),
  },
}));

vi.mock('../supabase', () => ({
  supabase: mockSupabase,
}));

import { verifyCredentialByCode } from '../credentialVerification';

describe('verifyCredentialByCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a rate-limited result when the verification quota is exceeded', async () => {
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ count: 10 }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    mockSupabase.from.mockReturnValue(queryBuilder);
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null });
    mockSupabase.functions.invoke.mockResolvedValue({ data: { valid: true }, error: null });

    const result = await verifyCredentialByCode('ABC123', 'test-ip');

    expect(result.valid).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.error).toContain('Too many verification attempts');
  });
});
