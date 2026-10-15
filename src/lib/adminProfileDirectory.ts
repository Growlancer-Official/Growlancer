/**
 * Admin profile directory — resolve display name + email for a set of profile ids.
 *
 * WHY THIS EXISTS: migration 20261221000000 (profiles PII-leak fix) moved
 * `email` (and phone / is_admin / onboarding_completed / suspended_at /
 * referral_code) off `public.profiles` into `public.profiles_private`. Any
 * `select('id, name, email')` against `profiles` now fails at PostgREST level,
 * and because these lookups were awaited inside `try { … }` blocks the failure
 * surfaced as *empty* admin tables (or a generic "Failed to fetch …" toast)
 * rather than as an obvious error.
 *
 * Always go through this helper when a screen needs a user's email.
 * `name` stays public; `email` comes from profiles_private.
 */
import { adminQuery } from './adminDataProxy';

export type ProfileDirectoryEntry = {
  name: string | null;
  email: string | null;
};

export async function fetchProfileDirectory(
  ids: Array<string | null | undefined>,
): Promise<Map<string, ProfileDirectoryEntry>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const directory = new Map<string, ProfileDirectoryEntry>();
  if (unique.length === 0) return directory;

  const [publicRes, privateRes] = await Promise.all([
    adminQuery<{ id: string; name: string | null }>({
      table: 'profiles',
      select: 'id, name',
      in: { id: unique },
      limit: unique.length,
    }),
    adminQuery<{ id: string; email: string | null }>({
      table: 'profiles_private',
      select: 'id, email',
      in: { id: unique },
      limit: unique.length,
    }),
  ]);

  const emailById = new Map((privateRes.data || []).map((p) => [p.id, p.email]));

  for (const profile of publicRes.data || []) {
    directory.set(profile.id, { name: profile.name, email: emailById.get(profile.id) ?? null });
  }
  // A profile_private row can outlive a missing public row (or be created
  // before it) — still resolve its email so callers never lose the address.
  for (const priv of privateRes.data || []) {
    if (!directory.has(priv.id)) directory.set(priv.id, { name: null, email: priv.email });
  }

  return directory;
}
