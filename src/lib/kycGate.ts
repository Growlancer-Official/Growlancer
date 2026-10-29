import { supabase } from './supabase';
import { KYC_REQUIRED_FOR_ACTIONS } from './featureFlags';

/**
 * KYC gate for CRITICAL actions only (orders, escrow funding, withdrawals).
 * Browsing the dashboard is always open — this is called at the point of
 * action, returns whether the user may proceed, and hands back the KYC page
 * path (+ redirect target) when they can't.
 *
 * The gate is switched by `KYC_REQUIRED_FOR_ACTIONS` (lib/featureFlags.ts),
 * currently false: the light KYC flow is live for both roles, but the phone
 * criterion depends on the project's SMS provider, so blocking escrow and
 * withdrawals on it would strand real money. Flip that constant on in the same
 * release that enables SMS — the check below already implements the rule. Server
 * ownership/permission checks are independent of this client-side gate.
 */
export async function requireKycForAction(
  user: { id: string } | null | undefined
): Promise<{ verified: boolean; kycPath: string; status: string | null }> {
  if (!KYC_REQUIRED_FOR_ACTIONS) {
    return { verified: true, kycPath: '', status: 'not_required' };
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
