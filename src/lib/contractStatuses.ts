/**
 * Shared contract-status buckets used by both the freelancer and client
 * contracts pages (tab filtering + auto-select of the user's current stage).
 */

/** Contract statuses considered in-progress work — shown under the Active tab. */
export const ACTIVE_STATUSES = ['active', 'in_progress', 'submitted', 'revision_requested', 'approved'];

/** Contract statuses considered pre-work — shown under the Pending tab. */
export const PENDING_STATUSES = ['pending', 'draft'];

/** Returns true when the status belongs to the in-progress (Active) bucket. */
export const isActiveContract = (status: string | null | undefined) =>
  ACTIVE_STATUSES.includes(status || '');

/** Returns true when the status belongs to the pre-work (Pending) bucket. */
export const isPendingContract = (status: string | null | undefined) =>
  PENDING_STATUSES.includes(status || '');
