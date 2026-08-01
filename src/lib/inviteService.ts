/**
 * Invite Service — Invite User feature (Settings → Account → Invite User).
 *
 * Real backend integration:
 * - createInvitation  → inserts a user_invitations row + sends a real magic-link
 *                       style invite email via Supabase Auth (signInWithOtp with
 *                       shouldCreateUser + invite metadata).
 * - resendInvitation  → refreshes the invite token + resends the email.
 * - cancelInvitation  → marks the invitation cancelled.
 * - listInvitations   → live list with real-time subscription (pending/accepted/
 *                       expired/cancelled states).
 *
 * Duplicate invitations are prevented by a unique (invited_by, email) index.
 */

import { supabase, realtimeChannels } from './supabase';
import { validateEmail } from '../utils/validation';

export type InviteRole = 'freelancer' | 'client';
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface UserInvitation {
  id: string;
  invited_by: string;
  email: string;
  role: InviteRole;
  status: InviteStatus;
  invite_token?: string | null;
  expires_at: string;
  accepted_at?: string | null;
  created_at: string;
  updated_at: string;
}

const INVITE_EMAIL_REDIRECT = `${window.location.origin}/auth/callback?type=invite`;

function isExpired(inv: { status: string; expires_at: string }): boolean {
  return inv.status === 'pending' && new Date(inv.expires_at).getTime() < Date.now();
}

/** Maps DB rows, computing live 'expired' state for display. */
function mapInvitation(row: Record<string, unknown>): UserInvitation {
  const invitation: UserInvitation = {
    id: String(row.id),
    invited_by: String(row.invited_by),
    email: String(row.email),
    role: (row.role === 'client' ? 'client' : 'freelancer') as InviteRole,
    status: (row.status as InviteStatus) || 'pending',
    invite_token: row.invite_token ? String(row.invite_token) : null,
    expires_at: String(row.expires_at),
    accepted_at: row.accepted_at ? String(row.accepted_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
  if (isExpired(invitation)) invitation.status = 'expired';
  return invitation;
}

export const inviteService = {
  /**
   * Creates an invitation and emails a real magic-link invite.
   * Returns { success, error?, invitation? }.
   */
  async createInvitation(
    inviterId: string,
    email: string,
    role: InviteRole
  ): Promise<{ success: boolean; error?: string; invitation?: UserInvitation }> {
    const normalizedEmail = email.trim().toLowerCase();

    const validation = validateEmail(normalizedEmail);
    if (!validation.isValid) {
      return { success: false, error: validation.error || 'Please enter a valid email address' };
    }

    // 1. Persist the invitation row (unique (inviter, email) prevents duplicates).
    //    invite_token is generated here so the FIRST invite email already carries
    //    a valid token (DB also defaults it, belt-and-suspenders).
    const insertResult = await supabase
      .from('user_invitations' as any)
      .insert({
        invited_by: inviterId,
        email: normalizedEmail,
        role,
        invite_token: crypto.randomUUID(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    const insertError = insertResult.error;
    const row = (insertResult.data as unknown as Record<string, unknown>) || null;

    if (insertError) {
      // Duplicate invitations are blocked by the unique index
      if (String(insertError.code) === '23505' || insertError.message.includes('duplicate')) {
        return { success: false, error: 'This person has already been invited.' };
      }
      return { success: false, error: insertError.message };
    }

    // 2. Send a real invite email — magic-link flow creates the account on first click.
    //    Invite metadata carries the role + token so the signup callback can
    //    auto-create the correct profile and mark the invitation accepted.
    const token = row ? String(row.invite_token || '') : '';
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${INVITE_EMAIL_REDIRECT}&invite_token=${encodeURIComponent(token)}&invite_role=${role}`,
        data: {
          invite_token: token,
          invited_by: inviterId,
          invited_role: role,
        },
      },
    });

    if (otpError) {
      // Email failed — still keep the row so the inviter can retry (resend)
      return {
        success: false,
        error: otpError.message.includes('rate limit')
          ? 'Too many emails were sent recently. Please wait a while and try again.'
          : otpError.message,
      };
    }

    return { success: true, invitation: mapInvitation(row as Record<string, unknown>) };
  },

  /** Resends an invite email for a pending invitation (refreshes token + expiry). */
  async resendInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const updateResult = await supabase
      .from('user_invitations' as any)
      .update({
        status: 'pending',
        expires_at: newExpiry,
        invite_token: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitationId)
      .select()
      .single();
    const updateError = updateResult.error;
    const row = (updateResult.data as unknown as Record<string, unknown>) || null;

    if (updateError) return { success: false, error: updateError.message };

    const token = row ? String(row.invite_token || '') : '';
    const email = String(row?.email || '');
    const role = (row?.role === 'client' ? 'client' : 'freelancer') as InviteRole;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${INVITE_EMAIL_REDIRECT}&invite_token=${encodeURIComponent(token)}&invite_role=${role}`,
        data: {
          invite_token: token,
          invited_role: role,
        },
      },
    });

    if (otpError) {
      return {
        success: false,
        error: otpError.message.includes('rate limit')
          ? 'Too many emails were sent recently. Please wait a while and try again.'
          : otpError.message,
      };
    }

    return { success: true };
  },

  /** Cancels a pending invitation. */
  async cancelInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
      .from('user_invitations' as any)
      .update({
        status: 'cancelled',
        invite_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitationId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  /** Lists the inviter's invitations (live via subscription). */
  async listInvitations(inviterId: string): Promise<UserInvitation[]> {
    const result = await supabase
      .from('user_invitations' as any)
      .select('*')
      .eq('invited_by', inviterId)
      .order('created_at', { ascending: false });

    if (result.error) return [];
    const rows = (result.data as unknown as Record<string, unknown>[]) || [];
    return rows.map(mapInvitation);
  },

  /** Real-time subscription for invitation status changes. */
  subscribe(inviterId: string, onUpdate: (invitations: UserInvitation[]) => void): { unsubscribe: () => void } {
    const channel = realtimeChannels.profiles(`invites:${inviterId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_invitations',
          filter: `invited_by=eq.${inviterId}`,
        },
        async () => {
          const list = await inviteService.listInvitations(inviterId);
          onUpdate(list);
        }
      )
      .subscribe();

    return { unsubscribe: () => { channel.unsubscribe(); } };
  },
};
