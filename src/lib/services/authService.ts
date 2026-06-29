/**
 * Auth Service — Pure data-access primitives for authentication.
 *
 * These functions handle only Supabase queries and transforms.
 * They contain NO React state, NO lifecycle, NO side effects beyond DB I/O.
 *
 * AuthContext (React) imports these and manages React state,
 * session lifecycle, and UI-level orchestration.
 */

import { supabase } from '../supabase';
import type { AuthUser, UserRole } from '../../types/auth';
import { captureError } from '../telemetry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALLOWED_SIGNUP_ROLES: UserRole[] = ['freelancer', 'client'];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Validates and normalises a raw role value from the database.
 * Returns `null` for invalid/unknown roles.
 */
export function normalizeRole(rawRole: unknown): UserRole | null {
  if (rawRole === 'freelancer' || rawRole === 'client' || rawRole === 'admin') {
    return rawRole;
  }

  if (rawRole !== undefined && rawRole !== null) {
    captureError('Invalid role detected in profile payload', {
      source: 'auth',
      rawRole,
    });
  }

  return null;
}

/**
 * Generates a unique referral code string.
 */
export function createReferralCode(prefix: string): string {
  return `GRW-${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Data-access functions
// ---------------------------------------------------------------------------

/**
 * Fetches a single user profile by ID from the profiles table.
 * Returns `null` if not found, suspended, or on error.
 * Suspended users are treated as non-existent (prevents dashboard access).
 */
export async function fetchUserProfile(userId: string): Promise<AuthUser | null> {
  try {
    // Use limit(1) instead of .single() to avoid 'multiple rows returned' errors
    // in case of unexpected duplicates (e.g., from failed cleanup or race conditions)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    // 🚫 SUSPENDED USER BLOCK — treat as non-existent
    if (data.suspended_at) {
      return null;
    }

    const normalizedRole = normalizeRole(data.role);
    if (!normalizedRole) {
      return null;
    }

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      role: normalizedRole,
      avatar: data.avatar || undefined,
      isPro: data.is_pro || false,
      referralCode: data.referral_code || undefined,
      createdAt: data.created_at || undefined,
      onboardingCompleted: data.onboarding_completed || false,
    };
  } catch {
    return null;
  }
}

/**
 * Creates (or updates) a user profile row via upsert.
 * Returns the full profile on success, or `null` on failure.
 *
 * @param userId  - Supabase Auth user ID
 * @param email   - User email address
 * @param name    - Display name
 * @param role    - Validated user role
 * @param referralCode - Optional explicit referral code (generated if omitted)
 */
export async function createUserProfile(
  userId: string,
  email: string,
  name: string,
  role: UserRole,
  referralCode?: string,
): Promise<AuthUser | null> {
  const safeRole = ALLOWED_SIGNUP_ROLES.includes(role) ? role : 'freelancer';
  const code = referralCode ?? createReferralCode(safeRole.substring(0, 2).toUpperCase());

  // Try RPC first (SECURITY DEFINER bypasses RLS for unverified users)
  const { data: rpcData, error: rpcError } = await supabase.rpc('create_user_profile' as any, {
    p_id: userId,
    p_email: email,
    p_name: name,
    p_role: safeRole,
    p_referral_code: code,
  });

  if (rpcError) {
    console.warn('[Auth] create_user_profile RPC failed (non-fatal):', rpcError?.message || rpcError);
    
    // 🆕 Check if the email already exists (duplicate email with different auth ID)
    // This can happen if user signs up again with same email after previous account was deleted
    const errMsg = rpcError?.message || '';
    const isDupEmail = errMsg.includes('profiles_email_unique') || 
                       errMsg.includes('duplicate key value') ||
                       String(rpcError?.code) === '23505';
    if (isDupEmail) {
      try {
        // Try updating the existing profile by email instead
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            id: userId,
            name: name,
            role: safeRole,
            referral_code: code,
            updated_at: new Date().toISOString(),
          })
          .eq('email', email);
        
        if (!updateError) {
          console.log('[Auth] Updated existing profile by email for:', email);
          return fetchUserProfile(userId);
        }
      } catch {
        // fall through to direct insert fallback
      }
    }
    
    // 🆕 Fallback: try direct insert (works when email is confirmed / session is valid)
    try {
      const { error: insertError } = await supabase.from('profiles').upsert({
        id: userId,
        email: email,
        name: name,
        role: safeRole,
        referral_code: code,
        is_pro: false,
        onboarding_completed: false,
        created_at: new Date().toISOString(),
      }, { onConflict: 'id', ignoreDuplicates: false });
      
      if (insertError) {
        console.warn('[Auth] Direct profile insert also failed (non-fatal):', insertError.message);
        return null;
      }
      
      // Direct insert succeeded! Fetch and return
      return fetchUserProfile(userId);
    } catch {
      return null;
    }
  }
  
  console.log('[Auth] create_user_profile RPC success:', JSON.stringify(rpcData));

  return fetchUserProfile(userId);
}

// ---------------------------------------------------------------------------
// Account Deletion Functions
// ---------------------------------------------------------------------------

/**
 * Requests account deletion for the current user.
 * Creates a deletion request with a 7-day cooldown period.
 * @param userId - The user's ID
 * @param reason - Reason for deletion
 * @returns The result of the deletion request
 */
export async function requestAccountDeletion(
  userId: string,
  reason: string
): Promise<{ success: boolean; error?: string; requestId?: string; scheduledDeletion?: string }> {
  try {
    const { data, error } = await supabase.rpc('request_account_deletion' as any, {
      p_user_id: userId,
      p_reason: reason,
    });

    if (error) {
      captureError('Failed to request account deletion', {
        source: 'auth',
        userId,
      });
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; error?: string; request_id?: string; scheduled_deletion_at?: string } | null;
    if (!result?.success) {
      return { success: false, error: result?.error || 'Failed to create deletion request' };
    }

    return {
      success: true,
      requestId: result.request_id,
      scheduledDeletion: result.scheduled_deletion_at,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    captureError('Exception requesting account deletion', {
      source: 'auth',
      userId,
    });
    return { success: false, error: message };
  }
}

/**
 * Cancels an active account deletion request.
 * @param userId - The user's ID
 * @returns Success status
 */
export async function cancelAccountDeletionRequest(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('cancel_account_deletion' as any, {
      p_user_id: userId,
    });

    if (error) {
      captureError('Failed to cancel deletion request', {
        source: 'auth',
        userId,
      });
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; error?: string } | null;
    if (!result?.success) {
      return { success: false, error: result?.error || 'Failed to cancel deletion request' };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    captureError('Exception cancelling deletion request', {
      source: 'auth',
      userId,
    });
    return { success: false, error: message };
  }
}

/**
 * Checks the status of a user's deletion request.
 * @param userId - The user's ID
 * @returns Deletion request status or null if none exists
 */
export async function checkDeletionStatus(
  userId: string
): Promise<{
  hasRequest: boolean;
  status?: string;
  reason?: string;
  createdAt?: string;
  scheduledDeletionAt?: string;
  confirmedAt?: string;
  cancelledAt?: string;
} | null> {
  try {
    const { data, error } = await supabase.rpc('check_deletion_status' as any, {
      p_user_id: userId,
    });

    if (error) {
      captureError('Failed to check deletion status', {
        source: 'auth',
        userId,
      });
      return null;
    }

    const result = data as { has_request: boolean; status?: string; reason?: string; created_at?: string; scheduled_deletion_at?: string; confirmed_at?: string; cancelled_at?: string } | null;
    if (!result?.has_request) {
      return { hasRequest: false };
    }

    return {
      hasRequest: true,
      status: result.status,
      reason: result.reason,
      createdAt: result.created_at,
      scheduledDeletionAt: result.scheduled_deletion_at,
      confirmedAt: result.confirmed_at,
      cancelledAt: result.cancelled_at,
    };
  } catch {
    return null;
  }
}

/**
 * Deletes the user's authentication account (last step after confirmation).
 * This is called after the 7-day cooldown and admin processing.
 * @param userId - The user's ID
 * @returns Success status
 */
export async function deleteAuthAccount(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      captureError('Failed to delete auth account', {
        source: 'auth',
        userId,
      });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    captureError('Exception deleting auth account', {
      source: 'auth',
      userId,
    });
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Two-Factor Authentication (2FA) Functions
// ---------------------------------------------------------------------------

export interface MFAStatus {
  mfaEnabled: boolean;
  mfaMethod?: string;
  backupEmail?: string;
  trustedDevices?: unknown[];
  lastVerifiedAt?: string;
  recoveryCodesRemaining: number;
  createdAt?: string;
  factors?: Array<{ id: string; type: string; status: string }>;
  totpFactors?: Array<{ id: string; type: string; status: string }>;
}

export interface MFAEnrollResult {
  success: boolean;
  factorId?: string;
  qrCode?: string;
  secret?: string;
  uri?: string;
  recoveryCodes?: string[];
  error?: string;
}

export interface MFAVerifyResult {
  success: boolean;
  verified?: boolean;
  error?: string;
}

export interface MFARecoveryCodesResult {
  success: boolean;
  codes?: string[];
  error?: string;
}

export interface MFARecoveryVerifyResult {
  success: boolean;
  valid?: boolean;
  error?: string;
}

export interface MFABackupEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Retrieves combined MFA status from both local settings and Supabase Auth factors.
 * Calls the get_mfa_status RPC and supabase.auth.mfa.listFactors().
 */
export async function getMFAStatus(): Promise<MFAStatus> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user?.id) {
      return { mfaEnabled: false, recoveryCodesRemaining: 0 };
    }

    const { data: mfaSettings, error: settingsError } = await supabase
      .rpc('get_mfa_status' as any, { p_user_id: user.user.id });

    if (settingsError) {
      captureError('Failed to get MFA status', { source: 'auth' });
      return { mfaEnabled: false, recoveryCodesRemaining: 0 };
    }

    // Also get Supabase Auth MFA factors
    const { data: mfaFactors } = await supabase.auth.mfa.listFactors();
    const settings = mfaSettings as { mfa_enabled?: boolean; mfa_method?: string; backup_email?: string; trusted_devices?: unknown[]; last_verified_at?: string; recovery_codes_remaining?: number; created_at?: string } | null;

    return {
      mfaEnabled: settings?.mfa_enabled ?? false,
      mfaMethod: settings?.mfa_method,
      backupEmail: settings?.backup_email,
      trustedDevices: settings?.trusted_devices,
      lastVerifiedAt: settings?.last_verified_at,
      recoveryCodesRemaining: settings?.recovery_codes_remaining ?? 0,
      createdAt: settings?.created_at,
      factors: (mfaFactors?.all as unknown as Array<{ id: string; type: string; status: string }>) || [],
      totpFactors: (mfaFactors?.totp as unknown as Array<{ id: string; type: string; status: string }>) || [],
    };
  } catch (err) {
    captureError('Exception getting MFA status', { source: 'auth' });
    return { mfaEnabled: false, recoveryCodesRemaining: 0 };
  }
}

/**
 * Enrolls the user in TOTP MFA via Supabase Auth and generates recovery codes.
 * Returns QR code data for display and the generated recovery codes.
 */
export async function enrollMFA(): Promise<MFAEnrollResult> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    // Enroll in TOTP via Supabase Auth MFA
    const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
    });

    if (enrollError) {
      captureError('Failed to enroll MFA', { source: 'auth' });
      return { success: false, error: enrollError.message };
    }

    // Generate recovery codes
    const { data: recoveryCodes, error: recoveryError } = await supabase
      .rpc('generate_recovery_codes' as any, { p_user_id: user.user.id });

    if (recoveryError) {
      console.error('Recovery code generation failed:', recoveryError);
    }

    return {
      success: true,
      factorId: enrollData?.id,
      qrCode: enrollData?.totp?.qr_code,
      secret: enrollData?.totp?.secret,
      uri: enrollData?.totp?.uri,
      recoveryCodes: (recoveryCodes as unknown as string[]) || [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    captureError('Exception enrolling MFA', { source: 'auth' });
    return { success: false, error: message };
  }
}

/**
 * Verifies a TOTP code by creating a challenge and verifying it.
 * On success, enables MFA in the user settings.
 *
 * @param factorId - The factor ID from enrollment
 * @param code - The 6-digit TOTP code from the authenticator app
 */
export async function verifyMFA(factorId: string, code: string): Promise<MFAVerifyResult> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!factorId || !code) {
      return { success: false, error: 'factorId and code are required' };
    }

    // Create a challenge
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError) {
      captureError('MFA challenge failed', { source: 'auth' });
      return { success: false, error: challengeError.message };
    }

    // Verify the challenge with the TOTP code
    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });

    if (verifyError) {
      return { success: false, error: 'Invalid verification code. Please try again.' };
    }

    // Enable MFA in our local settings
    await supabase.rpc('enable_user_mfa' as any, {
      p_user_id: user.user.id,
      p_totp_secret: '',
    });

    return {
      success: true,
      verified: (verifyData as any)?.verified || false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    captureError('Exception verifying MFA', { source: 'auth' });
    return { success: false, error: message };
  }
}

/**
 * Disables MFA for the current user.
 * Unenrolls all TOTP factors from Supabase Auth and clears local settings.
 */
export async function disableMFA(): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get current factors
    const { data: factors } = await supabase.auth.mfa.listFactors();

    // Unenroll all TOTP factors
    if (factors?.totp) {
      for (const factor of factors.totp) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (unenrollError) {
          console.error('Failed to unenroll factor:', factor.id, unenrollError);
        }
      }
    }

    // Disable in local settings
    await supabase.rpc('disable_user_mfa' as any, { p_user_id: user.user.id });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    captureError('Exception disabling MFA', { source: 'auth' });
    return { success: false, error: message };
  }
}

/**
 * Generates new recovery codes for the current user.
 * Invalidates any previously generated unused codes.
 */
export async function generateRecoveryCodes(): Promise<MFARecoveryCodesResult> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: codes, error } = await supabase
      .rpc('generate_recovery_codes' as any, { p_user_id: user.user.id });

    if (error) {
      captureError('Failed to generate recovery codes', { source: 'auth' });
      return { success: false, error: error.message };
    }

    return {
      success: true,
      codes: (codes as unknown as string[]) || [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    captureError('Exception generating recovery codes', { source: 'auth' });
    return { success: false, error: message };
  }
}

/**
 * Verifies a recovery code against stored hashes.
 * If valid, marks the code as used.
 *
 * @param code - The recovery code in XXXXX-XXXXX format
 */
export async function verifyRecoveryCode(code: string): Promise<MFARecoveryVerifyResult> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!code) {
      return { success: false, error: 'Recovery code is required' };
    }

    const { data: verifyData, error } = await supabase
      .rpc('verify_recovery_code' as any, { p_user_id: user.user.id, p_code: code });

    if (error) {
      captureError('Failed to verify recovery code', { source: 'auth' });
      return { success: false, error: error.message };
    }

    const verifyResult = verifyData as { valid?: boolean } | null;
    if (!verifyResult?.valid) {
      return { success: false, error: 'Invalid or already used recovery code' };
    }

    return { success: true, valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    captureError('Exception verifying recovery code', { source: 'auth' });
    return { success: false, error: message };
  }
}

/**
 * Sets or updates the backup email for MFA recovery.
 *
 * @param email - The backup email address
 */
export async function setBackupEmail(email: string): Promise<MFABackupEmailResult> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!email || !email.includes('@')) {
      return { success: false, error: 'Valid email is required' };
    }

    const { error } = await supabase
      .from('user_mfa_settings' as any)
      .upsert({
        user_id: user.user.id,
        backup_email: email,
      } as any, { onConflict: 'user_id' });

    if (error) {
      captureError('Failed to set backup email', { source: 'auth' });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    captureError('Exception setting backup email', { source: 'auth' });
    return { success: false, error: message };
  }
}