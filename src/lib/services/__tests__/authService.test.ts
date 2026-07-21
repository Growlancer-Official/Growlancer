import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserProfile } from '../authService';
import { supabase } from '../../supabase';

vi.mock('../../supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('createUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recovers an existing profile by email when RPC creation fails', async () => {
    vi.mocked(supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint profiles_email_unique', code: '23505' },
    });

    const existingProfile = {
      id: 'new-user-id',
      email: 'user@example.com',
      name: 'User',
      role: 'freelancer',
      referral_code: 'GRW-FR-ABC1',
      is_pro: false,
      onboarding_completed: false,
      created_at: '2024-01-01T00:00:00.000Z',
    };

    const updateQuery = {
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    const profileTable = {
      update: vi.fn().mockReturnValue(updateQuery),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existingProfile, error: null }),
    };

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return profileTable;
      }
      return {};
    });

    const result = await createUserProfile(
      'new-user-id',
      'user@example.com',
      'User',
      'freelancer',
      'GRW-FR-ABC1'
    );

    expect(result?.email).toBe('user@example.com');
    expect(profileTable.update).toHaveBeenCalled();
  });
});
