/**
 * Email Notification Service
 * Frontend bridge to the email-notifications edge function.
 * Fires transactional emails for: withdrawals, disputes, escrow, milestones, verification, account suspension.
 * 
 * Call these fire-and-forget after successful backend operations.
 */

import { supabase } from './supabase';

type EmailType =
  | 'withdrawal_completed'
  | 'withdrawal_failed'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'escrow_funded'
  | 'milestone_released'
  | 'verification_approved'
  | 'verification_rejected'
  | 'account_suspended'
  | 'admin_notification';

interface EmailData {
  recipient_email: string;
  recipient_name: string;
  [key: string]: unknown;
}

/**
 * Send a transactional email via the email-notifications edge function.
 * Fire-and-forget — errors are logged but not thrown so they never block the caller.
 */
async function sendEmail(type: EmailType, data: EmailData): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('email-notifications', {
      method: 'POST',
      body: { type, data },
    });
    if (error) {
      console.error(`[EmailNotification] ${type} failed:`, error.message);
    }
  } catch (err) {
    console.error(`[EmailNotification] ${type} error:`, err);
  }
}

/**
 * Send an admin notification email (for contact inquiries, support tickets, etc.)
 */
export async function sendAdminNotification(params: {
  subject: string;
  message: string;
  requester_name: string;
  requester_email: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    // Use admin-data edge function since it already has Brevo integration
    const { error } = await supabase.functions.invoke('admin-data', {
      method: 'POST',
      body: {
        action: 'send_admin_notification',
        subject: params.subject,
        message: params.message,
        requester_name: params.requester_name,
        requester_email: params.requester_email,
        details: params.details || {},
      },
    });
    if (error) {
      console.error('[AdminNotification] failed:', error.message);
    }
  } catch (err) {
    console.error('[AdminNotification] error:', err);
  }
}

export const emailNotificationService = {
  // ─── Withdrawals ──────────────────────────────────────────────

  async withdrawalCompleted(params: {
    recipientEmail: string;
    recipientName: string;
    amount: number;
    netAmount: number;
    method: string;
  }): Promise<void> {
    await sendEmail('withdrawal_completed', {
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      amount: params.amount,
      net_amount: params.netAmount,
      method: params.method,
    });
  },

  async withdrawalFailed(params: {
    recipientEmail: string;
    recipientName: string;
    amount: number;
    reason: string;
  }): Promise<void> {
    await sendEmail('withdrawal_failed', {
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      amount: params.amount,
      reason: params.reason,
    });
  },

  // ─── Disputes ─────────────────────────────────────────────────

  async disputeOpened(params: {
    recipientEmail: string;
    recipientName: string;
    disputeId: string;
    reason: string;
    role: 'client' | 'freelancer';
  }): Promise<void> {
    await sendEmail('dispute_opened', {
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      dispute_id: params.disputeId,
      reason: params.reason,
      role: params.role,
    });
  },

  async disputeResolved(params: {
    recipientEmail: string;
    recipientName: string;
    disputeId: string;
    resolution: string;
    outcome: string;
  }): Promise<void> {
    await sendEmail('dispute_resolved', {
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      dispute_id: params.disputeId,
      resolution: params.resolution,
      outcome: params.outcome,
    });
  },

  // ─── Escrow & Milestones ──────────────────────────────────────

  async escrowFunded(params: {
    recipientEmail: string;
    recipientName: string;
    projectTitle: string;
    amount: number;
  }): Promise<void> {
    await sendEmail('escrow_funded', {
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      project_title: params.projectTitle,
      amount: params.amount,
    });
  },

  async milestoneReleased(params: {
    recipientEmail: string;
    recipientName: string;
    projectTitle: string;
    amount: number;
  }): Promise<void> {
    await sendEmail('milestone_released', {
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      project_title: params.projectTitle,
      amount: params.amount,
    });
  },

  // ─── Verification ─────────────────────────────────────────────

  async verificationApproved(params: {
    recipientEmail: string;
    recipientName: string;
  }): Promise<void> {
    await sendEmail('verification_approved', {
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
    });
  },

  async verificationRejected(params: {
    recipientEmail: string;
    recipientName: string;
    rejectionReason: string;
  }): Promise<void> {
    await sendEmail('verification_rejected', {
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      rejection_reason: params.rejectionReason,
    });
  },

  // ─── Account ──────────────────────────────────────────────────

  async accountSuspended(params: {
    recipientEmail: string;
    recipientName: string;
    reason?: string;
  }): Promise<void> {
    await sendEmail('account_suspended', {
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName,
      reason: params.reason,
    });
  },
};
