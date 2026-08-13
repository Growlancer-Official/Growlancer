// ────────────────────────────────────────────────────────────────────────────
// Display-name change lock
// ----------------------------------------------------------------------------
// For security (anti-impersonation / referral farming) a user's display name
// can only be changed once every 30 days. profiles.name_changed_at is stamped
// by a DB trigger whenever the name actually changes (and at onboarding).
// ────────────────────────────────────────────────────────────────────────────

export const NAME_CHANGE_LOCK_DAYS = 30;

export interface NameChangeLock {
  /** True when the name cannot be changed right now. */
  locked: boolean;
  /** Human-readable date when the lock expires (en-IN format), or null. */
  unlockDate: string | null;
}

export function getNameChangeLock(nameChangedAt: string | null | undefined): NameChangeLock {
  if (!nameChangedAt) return { locked: false, unlockDate: null };
  const changed = new Date(nameChangedAt);
  if (Number.isNaN(changed.getTime())) return { locked: false, unlockDate: null };
  const unlock = new Date(changed.getTime() + NAME_CHANGE_LOCK_DAYS * 24 * 60 * 60 * 1000);
  return {
    locked: Date.now() < unlock.getTime(),
    unlockDate: unlock.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}
