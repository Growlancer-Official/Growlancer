// Email Notifications Edge Function
// Sends real transactional email notifications via Brevo for:
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

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? ''
const BREVO_FROM_EMAIL = Deno.env.get('BREVO_FROM_EMAIL') ?? 'growlancer.own@gmail.com'
const BREVO_FROM_NAME = 'Growlancer Team'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app'

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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}

const ALLOWED_ORIGINS = [
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

// ─── Brevo Email Sender ─────────────────────────────────────────────────────
async function sendBrevoEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
        to: [{ email: to, name: toName }],
        subject,
        htmlContent,
      }),
    })
    const text = await res.text()
    console.log('Brevo email response:', res.status, text)
    return res.ok
  } catch (err) {
    console.error('Brevo send error:', err)
    return false
  }
}

function baseEmailHtml(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 40px 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; font-size: 22px; font-weight: 700; margin: 0;">${title}</h1>
    </div>
    <div style="padding: 32px;">
      ${bodyHtml}
    </div>
    <div style="padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0 0 4px;">Growlancer — AI-Powered Freelancing Marketplace</p>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        <a href="${APP_URL}" style="color: #059669; text-decoration: none;">${APP_URL}</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

// ─── Email Builders ────────────────────────────────────────────────────────

/** 1. Withdrawal Completed */
function buildWithdrawalCompletedHtml(name: string, amount: number, netAmount: number, method: string): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      🎉 Your withdrawal of <strong style="color: #059669;">${formatCurrency(amount)}</strong> has been <strong style="color: #059669;">successfully processed</strong>!
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <table style="width: 100%; font-size: 14px; color: #166534;">
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Amount:</td><td>${formatCurrency(amount)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Net Received:</td><td>${formatCurrency(netAmount)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Method:</td><td>${escapeHtml(method)}</td></tr>
      </table>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      The funds should appear in your account within 1-3 business days depending on your payment provider.
    </p>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/wallet" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View Wallet →
      </a>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">— The Growlancer Team</p>`
  return baseEmailHtml('Withdrawal Processed ✅', body)
}

/** 2. Withdrawal Failed */
function buildWithdrawalFailedHtml(name: string, amount: number, reason: string): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Your withdrawal of <strong style="color: #dc2626;">${formatCurrency(amount)}</strong> could not be processed.
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #991b1b; margin: 0 0 8px;">❌ Reason for Failure</h3>
      <p style="font-size: 14px; color: #991b1b; margin: 0;">${escapeHtml(reason || 'An unexpected error occurred. Please try again.')}</p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      The full amount of <strong>${formatCurrency(amount)}</strong> has been returned to your Growlancer wallet.
    </p>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/wallet" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        Check Wallet →
      </a>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      If the issue persists, please <a href="mailto:support@growlancer.com" style="color: #059669;">contact support</a>.
    </p>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">— The Growlancer Team</p>`
  return baseEmailHtml('Withdrawal Failed 💔', body)
}

/** 3. Dispute Opened */
function buildDisputeOpenedHtml(name: string, disputeId: string, reason: string, role: 'client' | 'freelancer'): string {
  const roleLabel = role === 'client' ? 'the client' : 'the freelancer';
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      ⚠️ A dispute has been opened on one of your contracts by ${roleLabel}.
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #92400e; margin: 0 0 8px;">📋 Dispute Details</h3>
      <p style="font-size: 13px; color: #92400e; margin: 0 0 4px;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>
      <p style="font-size: 13px; color: #92400e; margin: 0;"><strong>Case ID:</strong> #${escapeHtml(disputeId.slice(0, 8))}</p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      Our team will review the case and reach a resolution. You may be asked to provide additional information or evidence.
    </p>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/disputes" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View Dispute Details →
      </a>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">— The Growlancer Team</p>`
  return baseEmailHtml('Dispute Opened ⚠️', body)
}

/** 4. Dispute Resolved */
function buildDisputeResolvedHtml(name: string, disputeId: string, resolution: string, outcome: string): string {
  const isFavorable = outcome === 'resolved';
  const emoji = isFavorable ? '✅' : '🔄';
  const color = isFavorable ? '#059669' : '#d97706';
  const bgColor = isFavorable ? '#f0fdf4' : '#fffbeb';
  const borderColor = isFavorable ? '#bbf7d0' : '#fde68a';
  const titleColor = isFavorable ? '#166534' : '#92400e';

  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      ${emoji} The dispute <strong>#${escapeHtml(disputeId.slice(0, 8))}</strong> has been resolved.
    </p>
    <div style="margin: 28px 0; padding: 20px; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 12px;">
      <h3 style="font-size: 14px; color: ${titleColor}; margin: 0 0 8px;">📋 Resolution</h3>
      <p style="font-size: 14px; color: ${titleColor}; margin: 0;">${escapeHtml(resolution)}</p>
    </div>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/disputes" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View Details →
      </a>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      If you have any questions about this resolution, please <a href="mailto:support@growlancer.com" style="color: #059669;">contact our support team</a>.
    </p>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">— The Growlancer Team</p>`
  return baseEmailHtml(isFavorable ? 'Dispute Resolved ✅' : 'Dispute Resolved 💙', body)
}

/** 5. Escrow Funded */
function buildEscrowFundedHtml(name: string, projectTitle: string, amount: number): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      🎉 Great news! The client has funded the escrow for <strong>${escapeHtml(projectTitle)}</strong>.
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #166534; margin: 0 0 8px;">💰 Escrow Funded</h3>
      <p style="font-size: 14px; color: #166534; margin: 0;">
        <strong>Amount:</strong> ${formatCurrency(amount)}<br/>
        <strong>Status:</strong> ✅ Ready to start working
      </p>
    </div>
    <div style="margin: 28px 0; padding: 20px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #1e40af; margin: 0 0 8px;">🚀 Your Next Steps</h3>
      <ol style="font-size: 14px; color: #1e40af; margin: 0; padding-left: 20px;">
        <li style="padding: 4px 0;">Review the project requirements</li>
        <li style="padding: 4px 0;">Use the workspace to collaborate</li>
        <li style="padding: 4px 0;">Submit milestones as you complete them</li>
      </ol>
    </div>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/contracts" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        Go to Workspace →
      </a>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">— The Growlancer Team</p>`
  return baseEmailHtml('Escrow Funded — Start Working! 🚀', body)
}

/** 6. Milestone Released */
function buildMilestoneReleasedHtml(name: string, projectTitle: string, amount: number): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      💵 A milestone payment of <strong style="color: #059669;">${formatCurrency(amount)}</strong> has been released for <strong>${escapeHtml(projectTitle)}</strong>!
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #166534; margin: 0 0 8px;">✅ Payment Released</h3>
      <p style="font-size: 14px; color: #166534; margin: 0;">
        <strong>Amount:</strong> ${formatCurrency(amount)}<br/>
        <strong>Status:</strong> Funds added to your wallet balance
      </p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      The funds are now available in your Growlancer wallet. You can withdraw them at any time.
    </p>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/wallet" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View Wallet →
      </a>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">— The Growlancer Team</p>`
  return baseEmailHtml('Milestone Payment Released 💵', body)
}

/** 7. Identity Verification Approved/Rejected */
function buildVerificationEmailHtml(name: string, status: 'approved' | 'rejected', rejectionReason?: string): string {
  const isApproved = status === 'approved';
  const body = isApproved ? `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      ✅ Your identity verification has been <strong style="color: #059669;">approved</strong>!
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #166534; margin: 0 0 8px;">🎉 Verified!</h3>
      <p style="font-size: 14px; color: #166534; margin: 0;">
        Your account now has the verified badge. This increases trust with clients and unlocks additional platform features.
      </p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      You can see your verified status on your profile and in your account settings.
    </p>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/settings" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View Profile →
      </a>
    </div>` : `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Your identity verification could not be approved at this time.
    </p>
    ${rejectionReason ? `
    <div style="margin: 28px 0; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #991b1b; margin: 0 0 8px;">📋 Reason</h3>
      <p style="font-size: 14px; color: #991b1b; margin: 0;">${escapeHtml(rejectionReason)}</p>
    </div>` : ''}
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      You can resubmit your verification with corrected documents at any time.
    </p>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/settings" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        Resubmit Verification →
      </a>
    </div>`;
  return baseEmailHtml(isApproved ? 'Identity Verified ✅' : 'Verification Update 📋', body)
}

/** 8. Account Suspended */
function buildAccountSuspendedHtml(name: string, reason?: string): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(name)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Your Growlancer account has been temporarily <strong style="color: #dc2626;">suspended</strong>.
    </p>
    ${reason ? `
    <div style="margin: 28px 0; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #991b1b; margin: 0 0 8px;">📋 Reason</h3>
      <p style="font-size: 14px; color: #991b1b; margin: 0;">${escapeHtml(reason)}</p>
    </div>` : ''}
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      During this time, you will not be able to access your dashboard, submit proposals, or communicate with clients.
    </p>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      If you believe this was done in error or would like more information, please <a href="mailto:support@growlancer.com" style="color: #059669;">contact our support team</a>.
    </p>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">— The Growlancer Team</p>`
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
      default: {
        return new Response(
          JSON.stringify({ error: `Unknown notification type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Send the email
    const emailSent = await sendBrevoEmail(recipient_email, recipient_name, subject, htmlContent)

    console.log(`Email notification ${type} — sent: ${emailSent} to ${recipient_email}`)

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
