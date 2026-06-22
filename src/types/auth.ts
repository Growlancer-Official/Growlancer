/**
 * Canonical auth types used by both the service layer and AuthContext.
 * These resolve field discrepancies between previous duplicate interfaces.
 */

export type UserRole = 'freelancer' | 'client' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  isPro: boolean;
  referralCode?: string;
  createdAt?: string;
  onboardingCompleted?: boolean;
}

export interface AuthResponse {
  success: boolean;
  user?: AuthUser;
  error?: string;
  message?: string;
}