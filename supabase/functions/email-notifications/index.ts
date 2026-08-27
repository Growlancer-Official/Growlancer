// Email Notifications Edge Function
// Sends real transactional email notifications (email service currently disabled):
//   1) Withdrawal completed
//   2) Withdrawal failed (funds returned to wallet)
//   3) Dispute opened (both parties)
//   4) Dispute resolved (both parties)
//   5) Escrow funded (notify freelancer to start work)
//   6) Milestone released (notify freelancer funds landed)
//   7) Identity verification approved/rejected
//   8) Account suspended (with reason if provided)
//
// Reuses the same branded template pattern from proposal-notifications

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail } from '../_shared/brevo.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app'

// ─── Per-user rate limiting (in-memory sliding window) ────────────────────
// Prevents an authenticated user from using this endpoint as an email
// spam relay. Max EMAIL_SENDS_PER_WINDOW per EMAIL_WINDOW_MINUTES.
const EMAIL_WINDOW_MINUTES = 60;
const EMAIL_SENDS_PER_WINDOW = 10;
const sendLog = new Map<string, number[]>(); // userId -> [timestamps]

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - EMAIL_WINDOW_MINUTES * 60 * 1000;
  const hits = (sendLog.get(userId) ?? []).filter(t => t > windowStart);
  if (hits.length >= EMAIL_SENDS_PER_WINDOW) return true;
  hits.push(now);
  sendLog.set(userId, hits);
  // Memory safety: prune stale entries when the map grows large.
  if (sendLog.size > 5000) {
    for (const [k, v] of sendLog) {
      if (!v.some(t => t > windowStart)) sendLog.delete(k);
    }
  }
  return false;
}

// ─── HTML Escape Helper ─────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
}

function buildSupportTicketHtml(name: string, ticketId: string, ticketSubject?: string): string {
  const safeName = escapeHtml(name || 'there')
  const safeSubject = escapeHtml(ticketSubject || 'AI Chat Escalation')
  const shortId = ticketId ? escapeHtml(String(ticketId).slice(0, 8).toUpperCase()) : '—'
  return baseEmailHtml(
    'Support Request Received',
    `
    <p style="margin:0 0 16px;color:#334155;">Hi ${safeName},</p>
    <p style="margin:0 0 16px;color:#334155;">
      Your request <strong>${safeSubject}</strong> has been received by the Growlancer support team.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:0 0 16px;">
      <p style="margin:0 0 4px;color:#475569;font-size:13px;">Ticket ID</p>
      <p style="margin:0;font-weight:700;color:#0f172a;font-size:15px;">${shortId}</p>
    </div>
    <p style="margin:0 0 16px;color:#334155;">
      Our support team typically reviews and responds within <strong>24 hours</strong>. If you don't hear from us,
      check your spam folder or reply to this email.
    </p>
    <p style="margin:0;color:#64748b;font-size:13px;">— Growlancer Support Team</p>
    `
  )
}

const ALLOWED_ORIGINS = [
  'https://growlancer-mrkhan154212s-projects.vercel.app',
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
  'http://localhost:5173',
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// ─── Email Sender (Brevo) ────────────────────────────────────────────────
// Real transactional email via the shared Brevo helper. Falls back to a
// logged no-op (email_sent: false) when BREVO_API_KEY is missing.
async function sendNotificationEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  void toName; // reserved for future personalization
  return sendEmail({ to, subject, html: htmlContent });
}

function baseEmailHtml(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #f1f5f9; padding: 24px 12px; margin: 0; -webkit-font-smoothing: antialiased;">
  <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;"><tr><td style="padding: 24px 16px;" align="center"><![endif]-->
  <div style="max-width: 600px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06);">
    <!-- Logo Bar -->
    <div style="background: #ffffff; padding: 20px 24px 0; text-align: center;">
      <img src="https://growlancer.vercel.app/UpdatedLogo.webp" alt="Growlancer" style="height: 40px; width: auto;" />
    </div>
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); margin: 12px 12px 0; border-radius: 12px; padding: 28px 24px; text-align: center;">
      <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin: 0; letter-spacing: -0.3px;">${title}</h1>
    </div>
    <!-- Body -->
    <div style="padding: 28px 24px; line-height: 1.6;">
      ${bodyHtml}
    </div>
    <!-- Footer -->
    <div style="padding: 20px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <tr>
          <td style="padding-bottom: 12px;">
            <a href="${APP_URL}" target="_blank" rel="noopener noreferrer" style="color: #059669; font-size: 12px; font-weight: 600; text-decoration: none; padding: 0 8px;">Website</a>
            <span style="color: #cbd5e1; font-size: 12px;">|</span>
            <a href="${APP_URL}/help-center" target="_blank" rel="noopener noreferrer" style="color: #059669; font-size: 12px; font-weight: 600; text-decoration: none; padding: 0 8px;">Help Center</a>
            <span style="color: #cbd5e1; font-size: 12px;">|</span>
            <a href="${APP_URL}/contact" target="_blank" rel="noopener noreferrer" style="color: #059669; font-size: 12px; font-weight: 600; text-decoration: none; padding: 0 8px;">Contact</a>
          </td>
        </tr>
        <tr>
          <td>
            <p style="color: #94a3b8; font-size: 11px; margin: 0; line-height: 1.5;">Growlancer — AI-Powered Freelancing Marketplace</p>
          </td>
        </tr>
      </table>
    </div>
  </div>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`
}

// ─── Email Builders ────────────────────────────────────────────────────────

/** 1. Withdrawal Completed */
function buildWithdrawalCompletedHtml(name: string, amount: number, netAmount: number, method: string): string {
  const body = `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7; margin: 0 0 20px;">Hi ${escapeHtml(name)},</p>
    <div style="margin: 0 0 24px; padding: 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 14px; text-align: center;">
      <p style="font-size: 36px; margin: 0 0 8px; line-height: 1;">🎉</p>
      <h2 style="font-size: 18px; color: #065f46; margin: 0 0 4px; font-weight: 800;">Withdrawal Processed!</h2>
      <p style="font-size: 14px; color: #047857; margin: 0;">
        Your withdrawal of <strong>${formatCurrency(amount)}</strong> has been successfully processed.
      </p>
    </div>
    <div style="margin: 0 0 24px; padding: 18px 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
      <table width="100%" cellpadding="4" cellspacing="0" style="font-size: 14px; color: #475569;">
        <tr><td style="font-weight: 600; color: #0f172a; width: 110px;">Amount</td><td>${formatCurrency(amount)}</td></tr>
        <tr><td style="font-weight: 600; color: #0f172a;">Net Received</td><td>${formatCurrency(netAmount)}</td></tr>
        <tr><td style="font-weight: 600; color: #0f172a;">Method</td><td>${escapeHtml(method)}</td></tr>
      </table>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 24px;">
      The funds should appear in your account within 1–3 business days depending on your payment provider.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="background: #059669; border-radius: 12px; padding: 14px 32px;" bgcolor="#059669">
              <a href="${APP_URL}/dashboard/wallet" target="_blank" rel="noopener noreferrer" style="display: inline-block; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">View Wallet →</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0;">— The Growlancer Team</p>`
  return baseEmailHtml('Withdrawal Processed ✅', body)
}

/** 2. Withdrawal Failed */
function buildWithdrawalFailedHtml(name: string, amount: number, reason: string): string {
  const body = `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7; margin: 0 0 20px;">Hi ${escapeHtml(name)},</p>
    <div style="margin: 0 0 24px; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 14px; text-align: center;">
      <p style="font-size: 36px; margin: 0 0 8px; line-height: 1;">❌</p>
      <h2 style="font-size: 18px; color: #991b1b; margin: 0 0 4px; font-weight: 800;">Withdrawal Failed</h2>
      <p style="font-size: 14px; color: #7f1d1d; margin: 0;">
        Your withdrawal of <strong>${formatCurrency(amount)}</strong> could not be processed.
      </p>
    </div>
    <div style="margin: 0 0 24px; padding: 18px 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #991b1b; margin: 0 0 8px; font-weight: 700;">📋 Reason for Failure</h3>
      <p style="font-size: 14px; color: #7f1d1d; margin: 0; line-height: 1.5;">${escapeHtml(reason || 'An unexpected error occurred. Please try again.')}</p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 24px;">
      The full amount of <strong>${formatCurrency(amount)}</strong> has been returned to your Growlancer wallet.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="background: #059669; border-radius: 12px; padding: 14px 32px;" bgcolor="#059669">
              <a href="${APP_URL}/dashboard/wallet" target="_blank" rel="noopener noreferrer" style="display: inline-block; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">Check Wallet →</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0;">
      If the issue persists, please <a href="mailto:support@growlancer.com" style="color: #059669; font-weight: 600;">contact support</a>.
    </p>`
  return baseEmailHtml('Withdrawal Failed 💔', body)
}

/** 3. Dispute Opened */
function buildDisputeOpenedHtml(name: string, disputeId: string, reason: string, role: 'client' | 'freelancer'): string {
  const roleLabel = role === 'client' ? 'the client' : 'the freelancer';
  const body = `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7; margin: 0 0 20px;">Hi ${escapeHtml(name)},</p>
    <div style="margin: 0 0 24px; padding: 20px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 14px; text-align: center;">
      <p style="font-size: 36px; margin: 0 0 8px; line-height: 1;">⚠️</p>
      <h2 style="font-size: 18px; color: #92400e; margin: 0 0 4px; font-weight: 800;">Dispute Opened</h2>
      <p style="font-size: 14px; color: #92400e; margin: 0;">
        A dispute has been opened on one of your contracts by ${roleLabel}.
      </p>
    </div>
    <div style="margin: 0 0 24px; padding: 18px 20px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #92400e; margin: 0 0 8px; font-weight: 700;">📋 Dispute Details</h3>
      <p style="font-size: 14px; color: #92400e; margin: 0 0 4px;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
      <p style="font-size: 14px; color: #92400e; margin: 0;"><strong>Case ID:</strong> #${escapeHtml(disputeId.slice(0, 8))}</p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 24px;">
      Our team will review the case and reach a resolution. You may be asked to provide additional information or evidence.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="background: #059669; border-radius: 12px; padding: 14px 32px;" bgcolor="#059669">
              <a href="${APP_URL}/dashboard/disputes" target="_blank" rel="noopener noreferrer" style="display: inline-block; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">View Dispute Details →</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0;">— The Growlancer Team</p>`
  return baseEmailHtml('Dispute Opened ⚠️', body)
}

/** 4. Dispute Resolved */
function buildDisputeResolvedHtml(name: string, disputeId: string, resolution: string, outcome: string): string {
  const isFavorable = outcome === 'resolved';
  const emoji = isFavorable ? '✅' : '🔄';
  const titleText = isFavorable ? 'Dispute Resolved in Your Favor' : 'Dispute Resolved';
  const color = isFavorable ? '#065f46' : '#92400e';
  const bgColor = isFavorable ? '#f0fdf4' : '#fffbeb';
  const borderColor = isFavorable ? '#86efac' : '#fde68a';

  const body = `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7; margin: 0 0 20px;">Hi ${escapeHtml(name)},</p>
    <div style="margin: 0 0 24px; padding: 20px; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 14px; text-align: center;">
      <p style="font-size: 36px; margin: 0 0 8px; line-height: 1;">${emoji}</p>
      <h2 style="font-size: 18px; color: ${color}; margin: 0 0 4px; font-weight: 800;">${titleText}</h2>
      <p style="font-size: 14px; color: ${color}; margin: 0;">
        Dispute <strong>#${escapeHtml(disputeId.slice(0, 8))}</strong> has been resolved.
      </p>
    </div>
    <div style="margin: 0 0 24px; padding: 18px 20px; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 12px;">
      <h3 style="font-size: 14px; color: ${color}; margin: 0 0 8px; font-weight: 700;">📋 Resolution</h3>
      <p style="font-size: 14px; color: ${color}; margin: 0; line-height: 1.5;">${escapeHtml(resolution)}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="background: #059669; border-radius: 12px; padding: 14px 32px;" bgcolor="#059669">
              <a href="${APP_URL}/dashboard/disputes" target="_blank" rel="noopener noreferrer" style="display: inline-block; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">View Details →</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0;">
      If you have any questions about this resolution, please <a href="mailto:support@growlancer.com" style="color: #059669; font-weight: 600;">contact our support team</a>.
    </p>`
  return baseEmailHtml(isFavorable ? 'Dispute Resolved ✅' : 'Dispute Updated 💙', body)
}

/** 5. Escrow Funded */
function buildEscrowFundedHtml(name: string, projectTitle: string, amount: number): string {
  const body = `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7; margin: 0 0 20px;">Hi ${escapeHtml(name)},</p>
    <div style="margin: 0 0 24px; padding: 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 14px; text-align: center;">
      <p style="font-size: 36px; margin: 0 0 8px; line-height: 1;">💰</p>
      <h2 style="font-size: 18px; color: #065f46; margin: 0 0 4px; font-weight: 800;">Escrow Funded!</h2>
      <p style="font-size: 14px; color: #047857; margin: 0;">
        The client has funded the escrow for <strong>${escapeHtml(projectTitle)}</strong>.
      </p>
    </div>
    <div style="margin: 0 0 24px; padding: 18px 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #065f46; margin: 0 0 8px; font-weight: 700;">💰 Amount Funded</h3>
      <p style="font-size: 24px; color: #059669; margin: 0; font-weight: 800;">${formatCurrency(amount)}</p>
      <p style="font-size: 13px; color: #047857; margin: 4px 0 0;">✅ Ready to start working</p>
    </div>
    <div style="margin: 0 0 24px; padding: 18px 20px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #1e40af; margin: 0 0 12px; font-weight: 700;">🚀 Your Next Steps</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px; color: #1e3a5f;">
        <tr><td width="28" style="padding: 4px 8px 4px 0; vertical-align: top; font-weight: 700; color: #2563eb;">1.</td><td style="padding: 4px 0;">Review the project requirements carefully</td></tr>
        <tr><td width="28" style="padding: 4px 8px 4px 0; vertical-align: top; font-weight: 700; color: #2563eb;">2.</td><td style="padding: 4px 0;">Use the workspace to collaborate with your client</td></tr>
        <tr><td width="28" style="padding: 4px 8px 4px 0; vertical-align: top; font-weight: 700; color: #2563eb;">3.</td><td style="padding: 4px 0;">Submit milestones for payment as you complete them</td></tr>
      </table>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="background: #059669; border-radius: 12px; padding: 14px 32px;" bgcolor="#059669">
              <a href="${APP_URL}/dashboard/contracts" target="_blank" rel="noopener noreferrer" style="display: inline-block; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">Go to Workspace →</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0;">— The Growlancer Team</p>`
  return baseEmailHtml('Escrow Funded — Start Working! 🚀', body)
}

/** 6. Milestone Released */
function buildMilestoneReleasedHtml(name: string, projectTitle: string, amount: number): string {
  const body = `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7; margin: 0 0 20px;">Hi ${escapeHtml(name)},</p>
    <div style="margin: 0 0 24px; padding: 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 14px; text-align: center;">
      <p style="font-size: 36px; margin: 0 0 8px; line-height: 1;">💵</p>
      <h2 style="font-size: 18px; color: #065f46; margin: 0 0 4px; font-weight: 800;">Milestone Payment Released!</h2>
      <p style="font-size: 14px; color: #047857; margin: 0;">
        A milestone payment has been released for <strong>${escapeHtml(projectTitle)}</strong>.
      </p>
    </div>
    <div style="margin: 0 0 24px; padding: 18px 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; text-align: center;">
      <h3 style="font-size: 13px; color: #065f46; margin: 0 0 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Amount Received</h3>
      <p style="font-size: 28px; color: #059669; margin: 0 0 4px; font-weight: 800;">${formatCurrency(amount)}</p>
      <p style="font-size: 13px; color: #047857; margin: 0;">✅ Funds added to your wallet balance</p>
    </div>
    <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
      The funds are now available in your Growlancer wallet. You can withdraw them at any time.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="background: #059669; border-radius: 12px; padding: 14px 32px;" bgcolor="#059669">
              <a href="${APP_URL}/dashboard/wallet" target="_blank" rel="noopener noreferrer" style="display: inline-block; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">View Wallet →</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0;">— The Growlancer Team</p>`
  return baseEmailHtml('Milestone Payment Released 💵', body)
}

/** 7. Identity Verification Approved/Rejected */
function buildVerificationEmailHtml(name: string, status: 'approved' | 'rejected', rejectionReason?: string): string {
  const isApproved = status === 'approved';
  const body = isApproved ? `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7; margin: 0 0 20px;">Hi ${escapeHtml(name)},</p>
    <div style="margin: 0 0 24px; padding: 20px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 14px; text-align: center;">
      <p style="font-size: 36px; margin: 0 0 8px; line-height: 1;">✅</p>
      <h2 style="font-size: 18px; color: #065f46; margin: 0 0 4px; font-weight: 800;">Identity Verified!</h2>
      <p style="font-size: 14px; color: #047857; margin: 0;">Your identity verification has been approved.</p>
    </div>
    <div style="margin: 0 0 24px; padding: 18px 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #065f46; margin: 0 0 8px; font-weight: 700;">🎉 You're Verified!</h3>
      <p style="font-size: 14px; color: #047857; margin: 0; line-height: 1.5;">
        Your account now has the verified badge. This increases trust with clients and unlocks additional platform features.
      </p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 24px;">
      You can see your verified status on your profile and in your account settings.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="background: #059669; border-radius: 12px; padding: 14px 32px;" bgcolor="#059669">
              <a href="${APP_URL}/dashboard/settings" target="_blank" rel="noopener noreferrer" style="display: inline-block; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">View Profile →</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>` : `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7; margin: 0 0 20px;">Hi ${escapeHtml(name)},</p>
    <div style="margin: 0 0 24px; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 14px; text-align: center;">
      <p style="font-size: 36px; margin: 0 0 8px; line-height: 1;">📋</p>
      <h2 style="font-size: 18px; color: #991b1b; margin: 0 0 4px; font-weight: 800;">Verification Update</h2>
      <p style="font-size: 14px; color: #7f1d1d; margin: 0;">Your identity verification could not be approved at this time.</p>
    </div>
    ${rejectionReason ? `
    <div style="margin: 0 0 24px; padding: 18px 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #991b1b; margin: 0 0 8px; font-weight: 700;">📋 Reason</h3>
      <p style="font-size: 14px; color: #7f1d1d; margin: 0; line-height: 1.5;">${escapeHtml(rejectionReason)}</p>
    </div>` : ''}
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 24px;">
      You can resubmit your verification with corrected documents at any time.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="background: #059669; border-radius: 12px; padding: 14px 32px;" bgcolor="#059669">
              <a href="${APP_URL}/dashboard/settings" target="_blank" rel="noopener noreferrer" style="display: inline-block; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">Resubmit Verification →</a>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>`;
  return baseEmailHtml(isApproved ? 'Identity Verified ✅' : 'Verification Update 📋', body)
}

/** 8. Account Suspended */
function buildAccountSuspendedHtml(name: string, reason?: string): string {
  const body = `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7; margin: 0 0 20px;">Hi ${escapeHtml(name)},</p>
    <div style="margin: 0 0 24px; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 14px; text-align: center;">
      <p style="font-size: 36px; margin: 0 0 8px; line-height: 1;">⚠️</p>
      <h2 style="font-size: 18px; color: #991b1b; margin: 0 0 4px; font-weight: 800;">Account Suspended</h2>
      <p style="font-size: 14px; color: #7f1d1d; margin: 0;">
        Your Growlancer account has been temporarily suspended.
      </p>
    </div>
    ${reason ? `
    <div style="margin: 0 0 24px; padding: 18px 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #991b1b; margin: 0 0 8px; font-weight: 700;">📋 Reason</h3>
      <p style="font-size: 14px; color: #7f1d1d; margin: 0; line-height: 1.5;">${escapeHtml(reason)}</p>
    </div>` : ''}
    <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 20px;">
      During this time, you will not be able to access your dashboard, submit proposals, or communicate with clients.
    </p>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0;">
      If you believe this was done in error or would like more information, please <a href="mailto:support@growlancer.com" style="color: #059669; font-weight: 600;">contact our support team</a>.
    </p>`
  return baseEmailHtml('Account Suspended ⚠️', body)
}

// ─── Main Server ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 🔐 Auth: the caller MUST be a real authenticated user (gateway JWT
    // alone is not enough — we verify the identity server-side).
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized — valid session required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 🔐 Anti-spam: per-user rate limit before doing any work.
    if (rateLimited(user.id)) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded — max ${EMAIL_SENDS_PER_WINDOW} emails per ${EMAIL_WINDOW_MINUTES} minutes` }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { type, data } = body // type: 'withdrawal_completed' | 'withdrawal_failed' | ...

    if (!type || !data) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { recipient_email, recipient_name } = data
    if (!recipient_email || !recipient_name) {
      return new Response(
        JSON.stringify({ error: 'recipient_email and recipient_name are required in data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 🔐 Recipient authorization: the recipient must be legitimately
    // connected to the caller — one of:
    //   (a) the caller's own registered email,
    //   (b) a registered user who shares a contract with the caller
    //       (client <-> freelancer), verified server-side,
    //   (c) any registered user, when the caller is an admin
    //       (suspension, verification, dispute-resolution emails).
    // This blocks arbitrary-address spam relays even with a valid JWT.
    // email was moved to profiles_private (migration 20261221000000)
    const [{ data: callerProfile }, { data: callerPriv }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('profiles_private').select('email').eq('id', user.id).maybeSingle(),
    ]);
    const callerEmail = String(callerPriv?.email ?? '').trim().toLowerCase();
    const requestedEmail = String(recipient_email ?? '').trim().toLowerCase();
    const isAdmin = callerProfile?.role === 'admin';

    let recipientAuthorized = false;
    if (isAdmin) {
      // Admin may email any registered user (verified via profiles_private).
      const { data: anyUser } = await supabase
        .from('profiles_private')
        .select('id')
        .eq('email', requestedEmail)
        .maybeSingle();
      recipientAuthorized = !!anyUser;
    } else if (requestedEmail === callerEmail) {
      recipientAuthorized = true; // own email
    } else if (type === 'dispute_opened' || type === 'dispute_resolved') {
      // The caller must be a party to the dispute AND the recipient must
      // be one of the two parties (client or freelancer) of that dispute.
      const disputeId = data?.dispute_id;
      if (disputeId) {
        const { data: d } = await supabase
          .from('disputes')
          .select('client_id, freelancer_id, client:profiles!disputes_client_id_fkey(email), freelancer:profiles!disputes_freelancer_id_fkey(email)')
          .eq('id', disputeId)
          .maybeSingle();
        const callerIsParty = !!d &&
          (d.client_id === user.id || d.freelancer_id === user.id);
        const partyEmails = [
          String((d?.client as { email?: string } | null)?.email ?? '').toLowerCase(),
          String((d?.freelancer as { email?: string } | null)?.email ?? '').toLowerCase(),
        ].filter(Boolean);
        recipientAuthorized = callerIsParty && partyEmails.includes(requestedEmail);
      }
    } else {
      // The recipient must be a registered user who shares a contract
      // with the caller (escrow, milestone, or dispute counterparty).
      const { data: recipientProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', requestedEmail)
        .maybeSingle();
      if (recipientProfile) {
        const { data: sharedContract } = await supabase
          .from('contracts')
          .select('id')
          .or(`and(client_id.eq.${user.id},freelancer_id.eq.${recipientProfile.id}),and(freelancer_id.eq.${user.id},client_id.eq.${recipientProfile.id})`)
          .limit(1)
          .maybeSingle();
        recipientAuthorized = !!sharedContract;
      }
    }

    if (!recipientAuthorized) {
      console.warn(`[email-notifications] FORBIDDEN: user ${user.id} tried to email ${requestedEmail} (type=${type})`);
      return new Response(
        JSON.stringify({ error: 'Forbidden — recipient is not connected to your account' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let subject = ''
    let htmlContent = ''

    switch (type) {
      case 'withdrawal_completed': {
        subject = `Withdrawal of ${formatCurrency(data.amount)} Processed Successfully ✅`
        htmlContent = buildWithdrawalCompletedHtml(recipient_name, data.amount, data.net_amount || data.amount, data.method || 'PayPal')
        break
      }
      case 'withdrawal_failed': {
        subject = `Withdrawal of ${formatCurrency(data.amount)} Failed — Funds Returned 💔`
        htmlContent = buildWithdrawalFailedHtml(recipient_name, data.amount, data.reason || 'Unknown error')
        break
      }
      case 'dispute_opened': {
        subject = `A Dispute Has Been Opened on Your Contract ⚠️`
        htmlContent = buildDisputeOpenedHtml(recipient_name, data.dispute_id, data.reason, data.role || 'client')
        break
      }
      case 'dispute_resolved': {
        const outcome = data.outcome || 'resolved'
        subject = `Dispute #${data.dispute_id?.slice(0, 8)} Has Been Resolved ✅`
        htmlContent = buildDisputeResolvedHtml(recipient_name, data.dispute_id, data.resolution, outcome)
        break
      }
      case 'escrow_funded': {
        subject = `Escrow Funded — Start Working on "${data.project_title}" 🚀`
        htmlContent = buildEscrowFundedHtml(recipient_name, data.project_title, data.amount)
        break
      }
      case 'milestone_released': {
        subject = `Milestone Payment of ${formatCurrency(data.amount)} Released 💵`
        htmlContent = buildMilestoneReleasedHtml(recipient_name, data.project_title, data.amount)
        break
      }
      case 'verification_approved': {
        subject = 'Identity Verification Approved ✅'
        htmlContent = buildVerificationEmailHtml(recipient_name, 'approved')
        break
      }
      case 'verification_rejected': {
        subject = 'Identity Verification Update 📋'
        htmlContent = buildVerificationEmailHtml(recipient_name, 'rejected', data.rejection_reason)
        break
      }
      case 'account_suspended': {
        subject = 'Account Suspended ⚠️'
        htmlContent = buildAccountSuspendedHtml(recipient_name, data.reason)
        break
      }
      case 'support_ticket_created': {
        subject = `We received your support request${data.ticket_id ? ` #${String(data.ticket_id).slice(0, 8)}` : ''} ✅`
        htmlContent = buildSupportTicketHtml(recipient_name, data.ticket_id, data.subject)
        break
      }
      default: {
        return new Response(
          JSON.stringify({ error: `Unknown notification type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Send the email
    const emailSent = await sendNotificationEmail(recipient_email, recipient_name, subject, htmlContent)

    console.log(`Email notification ${type} — sent: ${emailSent}`)

    return new Response(
      JSON.stringify({
        success: true,
        email_sent: emailSent,
        type,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Email notifications error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
