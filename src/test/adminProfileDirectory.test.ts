/**
 * Unit tests for src/lib/adminProfileDirectory.ts
 *
 * Regression guard for the profiles PII split (migration 20261221000000):
 * `email` lives in profiles_private. Selecting it from profiles makes the
 * admin-data proxy reject the whole request, which silently blanked every
 * admin table that rendered user emails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const adminQueryMock = vi.fn();

vi.mock('../lib/adminDataProxy', () => ({
  adminQuery: (...args: unknown[]) => adminQueryMock(...args),
}));

const { fetchProfileDirectory } = await import('../lib/adminProfileDirectory');

beforeEach(() => {
  adminQueryMock.mockReset();
});

describe('fetchProfileDirectory', () => {
  it('takes names from profiles and emails from profiles_private', async () => {
    adminQueryMock.mockImplementation(async (opts: { table: string }) =>
      opts.table === 'profiles'
        ? { data: [{ id: 'u1', name: 'Asha' }, { id: 'u2', name: 'Ravi' }] }
        : { data: [{ id: 'u1', email: 'asha@example.com' }] },
    );

    const directory = await fetchProfileDirectory(['u1', 'u2']);

    expect(directory.get('u1')).toEqual({ name: 'Asha', email: 'asha@example.com' });
    // No private row yet — the entry still exists, with a null email.
    expect(directory.get('u2')).toEqual({ name: 'Ravi', email: null });
  });

  it('never asks the profiles table for email', async () => {
    adminQueryMock.mockResolvedValue({ data: [] });
    await fetchProfileDirectory(['u1']);

    const selects = adminQueryMock.mock.calls.map(([opts]) => opts);
    const publicQuery = selects.find((o) => o.table === 'profiles');
    const privateQuery = selects.find((o) => o.table === 'profiles_private');

    expect(publicQuery.select).toBe('id, name');
    expect(publicQuery.select).not.toContain('email');
    expect(privateQuery.select).toContain('email');
  });

  it('resolves emails for ids that have no public profile row', async () => {
    adminQueryMock.mockImplementation(async (opts: { table: string }) =>
      opts.table === 'profiles' ? { data: [] } : { data: [{ id: 'ghost', email: 'ghost@example.com' }] },
    );

    const directory = await fetchProfileDirectory(['ghost']);

    expect(directory.get('ghost')).toEqual({ name: null, email: 'ghost@example.com' });
  });

  it('de-duplicates ids and skips empty ones', async () => {
    adminQueryMock.mockResolvedValue({ data: [] });
    await fetchProfileDirectory(['u1', 'u1', null, undefined, '']);

    const idFilters = adminQueryMock.mock.calls.map(([opts]) => opts.in.id);
    expect(idFilters).toEqual([['u1'], ['u1']]);
  });

  it('performs no queries when there are no ids', async () => {
    const directory = await fetchProfileDirectory([]);

    expect(directory.size).toBe(0);
    expect(adminQueryMock).not.toHaveBeenCalled();
  });
});
