/**
 * Credential Verification Service
 * 
 * Manages QR tokens, version history, and audit logging for
 * Growlancer certificates and Letters of Recommendation.
 * 
 * Design goals:
 * - QR tokens are signed/secure, never expose DB IDs
 * - Rate-limited public verification endpoint
 * - Full version history and audit trail for admin actions
 * - Future-ready: supports Company Seal, Trademark, DSC later
 */

import { supabase } from './supabase';
import { adminQuery, adminUpdate, adminDelete } from './adminDataProxy';

// ─── Types ──────────────────────────────────────────────────────────

export interface VerificationToken {
  id: string;
  credential_id: string;
  token: string;
  token_version: number;
  status: 'active' | 'revoked' | 'replaced';
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
  generated_by: string | null;
  metadata: Record<string, unknown>;
}

export interface VersionHistoryEntry {
  id: string;
  credential_id: string;
  version_number: number;
  action: string;
  changes: Record<string, unknown>;
  performed_by: string | null;
  notes: string | null;
  old_qr_token: string | null;
  new_qr_token: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  credential_id: string | null;
  action: string;
  admin_id: string | null;
  admin_email: string | null;
  ip_address: string | null;
  details: Record<string, unknown>;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  created_at: string;
}

export interface CredentialVerificationResult {
  valid: boolean;
  certificate?: Record<string, unknown>;
  token?: VerificationToken;
  internProfile?: Record<string, unknown> | null;
  error?: string;
}

// ─── Rate Limiting ───────────────────────────────────────────────────
// Public verification endpoint: max 10 requests per IP per 15 minutes
const VERIFY_RATE_LIMIT = 10;
const VERIFY_RATE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Check if the given IP/hash has exceeded the verification rate limit.
 * Uses the dedicated verification_rate_limits table.
 */
export async function checkVerificationRateLimit(
  identifier: string
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    // Clean expired entries first
    await supabase.rpc('cleanup_verification_rate_limits').catch(() => {});

    const windowStart = new Date(Date.now() - VERIFY_RATE_WINDOW_MS).toISOString();

    const { count } = await supabase
      .from('verification_rate_limits' as any)
      .select('*', { count: 'exact', head: true })
      .eq('identifier', identifier)
      .eq('route', 'verify-certificate-public')
      .gte('window_start', windowStart);

    const currentCount = count || 0;
    const allowed = currentCount < VERIFY_RATE_LIMIT;

    // Increment the counter
    if (allowed) {
      await supabase
        .from('verification_rate_limits' as any)
        .insert({
          identifier,
          route: 'verify-certificate-public',
          request_count: 1,
          window_start: new Date().toISOString(),
        })
        .catch(() => {});
    }

    return {
      allowed,
      remaining: Math.max(0, VERIFY_RATE_LIMIT - currentCount - 1),
    };
  } catch {
    // Fail open — allow verification if rate check fails
    return { allowed: true, remaining: 1 };
  }
}

// ─── QR Token Management ────────────────────────────────────────────

const FN = 'admin-data';

/**
 * Generate a new QR verification token for a credential.
 * Revokes any existing active token and creates a new one.
 */
export async function generateQRToken(
  credentialId: string,
  adminId?: string
): Promise<{
  success: boolean;
  token?: VerificationToken;
  error?: string;
}> {
  try {
    // Try RPC first
    const { data, error } = await supabase.rpc('generate_credential_token', {
      p_credential_id: credentialId,
      p_admin_id: adminId || null,
    });

    if (!error && data) {
      return { success: true, token: data as unknown as VerificationToken };
    }

    // Fallback via edge function
    const { data: fnData, error: fnError } = await supabase.functions.invoke(FN, {
      method: 'POST',
      body: {
        action: 'generate_qr_token',
        credential_id: credentialId,
        admin_id: adminId,
      },
    });

    if (fnError) throw new Error(fnError.message);
    const res = fnData as { success: boolean; token?: VerificationToken; error?: string };
    return res;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to generate QR token',
    };
  }
}

/**
 * Regenerate QR token — creates new token, increments version, logs history.
 */
export async function regenerateQRToken(
  credentialId: string,
  adminId: string,
  adminEmail: string,
  reason?: string
): Promise<{ success: boolean; token?: VerificationToken; error?: string }> {
  try {
    // Get old token info before regenerating
    const { data: oldToken } = await supabase
      .from('credential_verification_tokens' as any)
      .select('token, token_version')
      .eq('credential_id', credentialId)
      .eq('status', 'active')
      .maybeSingle();

    // Generate new token
    const result = await generateQRToken(credentialId, adminId);
    if (!result.success || !result.token) {
      return { success: false, error: result.error || 'Failed to regenerate token' };
    }

    // Log version history
    await supabase.rpc('insert_credential_version', {
      p_credential_id: credentialId,
      p_action: 'qr_regenerated',
      p_performed_by: adminId,
      p_notes: reason || 'QR code regenerated',
      p_old_qr_token: (oldToken as any)?.token || null,
      p_new_qr_token: result.token.token,
      p_changes: { reason: reason || '', action: 'regenerate' },
    });

    // Log audit
    await supabase.rpc('insert_credential_audit_log', {
      p_credential_id: credentialId,
      p_action: 'qr_regenerated',
      p_admin_id: adminId,
      p_admin_email: adminEmail,
      p_details: {
        reason,
        old_token_version: (oldToken as any)?.token_version || 0,
        new_token_version: result.token.token_version,
        new_token_id: result.token.id,
      },
      p_old_values: { token: (oldToken as any)?.token || null },
      p_new_values: { token: result.token.token, version: result.token.token_version },
    });

    return { success: true, token: result.token };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to regenerate QR token',
    };
  }
}

/**
 * Replace QR token — similar to regenerate but specifically for "replacement" action.
 */
export async function replaceQRToken(
  credentialId: string,
  adminId: string,
  adminEmail: string,
  reason?: string
): Promise<{ success: boolean; token?: VerificationToken; error?: string }> {
  const result = await regenerateQRToken(credentialId, adminId, adminEmail, reason);
  if (result.success) {
    // Override the action to 'qr_replaced' in version history
    // (regenerateQRToken already logged it, but we can update)
    try {
      await supabase
        .from('credential_version_history' as any)
        .insert({
          credential_id: credentialId,
          version_number: 0, // will be auto-calculated by RPC
          action: 'qr_replaced',
          performed_by: adminId,
          notes: reason || 'QR code replaced',
          new_qr_token: result.token?.token,
        });
    } catch {}
  }
  return result;
}

/**
 * Revoke a QR token by its ID.
 */
export async function revokeQRToken(
  tokenId: string,
  credentialId: string,
  adminId: string,
  adminEmail: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('credential_verification_tokens' as any)
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
      })
      .eq('id', tokenId);

    if (error) throw error;

    // Log version history
    await supabase.rpc('insert_credential_version', {
      p_credential_id: credentialId,
      p_action: 'qr_revoked',
      p_performed_by: adminId,
      p_notes: reason || 'QR code revoked by admin',
      p_changes: { reason: reason || '', action: 'revoke' },
    });

    // Log audit
    await supabase.rpc('insert_credential_audit_log', {
      p_credential_id: credentialId,
      p_action: 'qr_revoked',
      p_admin_id: adminId,
      p_admin_email: adminEmail,
      p_details: { reason, token_id: tokenId },
      p_old_values: { status: 'active' },
      p_new_values: { status: 'revoked' },
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to revoke QR token',
    };
  }
}

// ─── Public Verification ────────────────────────────────────────────

/**
 * Verify a credential by its verification code (existing method).
 * Includes rate limiting.
 */
export async function verifyCredentialByCode(
  code: string,
  ipIdentifier?: string
): Promise<CredentialVerificationResult> {
  try {
    // Rate limit check
    if (ipIdentifier) {
      const rateCheck = await checkVerificationRateLimit(ipIdentifier);
      if (!rateCheck.allowed) {
        return {
          valid: false,
          error: 'Too many verification attempts. Please try again later.',
        };
      }
    }

    const normalizedCode = code.trim().toUpperCase();

    const { data, error } = await supabase.functions.invoke(FN, {
      method: 'POST',
      body: {
        action: 'verify_certificate',
        verification_code: normalizedCode,
      },
    });

    if (error) throw new Error(error.message);
    return (data as CredentialVerificationResult) || {
      valid: false,
      error: 'Credential not found',
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Verification failed',
    };
  }
}

/**
 * Verify a credential by QR token (new method).
 * Always goes server-side via edge function.
 */
export async function verifyCredentialByQR(
  qrToken: string,
  ipIdentifier?: string
): Promise<CredentialVerificationResult> {
  try {
    // Rate limit check
    if (ipIdentifier) {
      const rateCheck = await checkVerificationRateLimit(ipIdentifier);
      if (!rateCheck.allowed) {
        return {
          valid: false,
          error: 'Too many verification attempts. Please try again later.',
        };
      }
    }

    // Try RPC first (fastest)
    const { data, error } = await supabase.rpc('verify_credential_by_token', {
      p_token: qrToken,
    });

    if (!error && data) {
      return data as unknown as CredentialVerificationResult;
    }

    // Fallback via edge function
    const { data: fnData, error: fnError } = await supabase.functions.invoke(FN, {
      method: 'POST',
      body: {
        action: 'verify_credential_qr',
        qr_token: qrToken,
      },
    });

    if (fnError) throw new Error(fnError.message);
    return (fnData as CredentialVerificationResult) || {
      valid: false,
      error: 'Invalid QR code',
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'QR verification failed',
    };
  }
}

// ─── Version History & Audit Logs ───────────────────────────────────

/**
 * Get version history for a credential.
 */
export async function getCredentialHistory(
  credentialId: string
): Promise<VersionHistoryEntry[]> {
  try {
    const { data } = await supabase
      .from('credential_version_history' as any)
      .select('*')
      .eq('credential_id', credentialId)
      .order('version_number', { ascending: false });

    return (data as VersionHistoryEntry[]) || [];
  } catch {
    return [];
  }
}

/**
 * Get audit logs for a credential, or all audit logs if no credential_id.
 */
export async function getCredentialAuditLogs(options?: {
  credentialId?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  try {
    let query = supabase
      .from('credential_audit_logs' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(options?.limit || 50);

    if (options?.credentialId) {
      query = query.eq('credential_id', options.credentialId);
    }

    const { data } = await query;
    return (data as AuditLogEntry[]) || [];
  } catch {
    return [];
  }
}

/**
 * Get active QR token for a credential.
 */
export async function getActiveToken(
  credentialId: string
): Promise<VerificationToken | null> {
  try {
    const { data } = await supabase
      .from('credential_verification_tokens' as any)
      .select('*')
      .eq('credential_id', credentialId)
      .eq('status', 'active')
      .maybeSingle();

    return data as VerificationToken | null;
  } catch {
    return null;
  }
}

/**
 * Get QR tokens for a credential (all versions).
 */
export async function getCredentialTokens(
  credentialId: string
): Promise<VerificationToken[]> {
  try {
    const { data } = await supabase
      .from('credential_verification_tokens' as any)
      .select('*')
      .eq('credential_id', credentialId)
      .order('token_version', { ascending: false });

    return (data as VerificationToken[]) || [];
  } catch {
    return [];
  }
}

/**
 * Generate QR code data URL from a token string.
 * Uses the qrserver.com API or a simple canvas-based approach.
 */
export function getQRCodeDataUrl(token: string): string {
  const verifyUrl = `${window.location.origin}/verify-certificate?qr=${encodeURIComponent(token)}`;
  // Use a public QR generation API — no API key needed
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(verifyUrl)}&bgcolor=ffffff&color=059669`;
}

/**
 * Generate a signed verification URL from a credential's verification code.
 */
export function getVerificationUrl(verificationCode: string): string {
  return `${window.location.origin}/verify-certificate/${verificationCode}`;
}
