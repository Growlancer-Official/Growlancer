/**
 * Service Consolidation — barrel exports
 *
 * All data-access services live in src/lib/services/.
 * They use the typed supabase client as the single data access layer.
 * No React imports, no state — hooks handle that.
 */

export { CacheManager } from './cacheManager';
export {
  fetchUserProfile,
  createUserProfile,
  normalizeRole,
  createReferralCode,
  ALLOWED_SIGNUP_ROLES,
} from './authService';

export type {
  AuthUser,
  AuthResponse,
  UserRole,
} from '../../types/auth';