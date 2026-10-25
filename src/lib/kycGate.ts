import { supabase } from './supabase';
import { IDENTITY_VERIFICATION_ENABLED } from './featureFlags';

/**
 * KYC gate for CRITICAL actions only (orders, escrow funding, withdrawals).
 * Browsing the dashboard is always open — this is called at the point of
 * action, returns whether the user may proceed, and hands back the KYC page
 * path (+ redirect target) when they can't.
 *
 * Identity verification is DEFERRED for launch (`IDENTITY_VERIFICATION_ENABLED`
 * is false), so the gate is open: users complete their profile instead. The
 * original check is kept below, unchanged, for the day the feature returns —
 * turning the flag on restores it without touching a single call site. Server
 * ownership/permission checks are independent of this client-side gate.
 */
export async function requireKycForAction(
  user: { id: string } | null | undefined
): Promise<{ verified: boolean; kycPath: string; status: string | null }> {
  if (!IDENTITY_VERIFICATION_ENABLED) {
    return { verified: true, kycPath: '', status: 'deferred' };
  }
  if (!user?.id) {
    return { verified: false, kycPath: '/login', status: null };
  }
  try {
    const { data } = await supabase
      .from('profiles')
      .select('verification_status, role')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.role === 'admin') {
      return { verified: true, kycPath: '', status: 'verified' };
    }
    const status = data?.verification_status || 'none';
    // Role from the DB (single source of truth) decides which KYC page to send.
    const isClient = (data as any)?.role === 'client';
    const kycPath = isClient ? '/client/verification' : '/dashboard/identity-verification';
    return { verified: status === 'verified', kycPath, status };
  } catch {
    // Fail open on transient errors — never block a real action because of a
    // network blip; the server still enforces ownership checks on every RPC.
    return { verified: true, kycPath: '', status: null };
  }
}
