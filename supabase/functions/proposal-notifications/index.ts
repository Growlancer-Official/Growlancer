// Proposal Notifications Edge Function
// Sends real email notifications to freelancers via Brevo when:
//   1) Proposal is ACCEPTED → "Congratulations, you're hired!" email
//   2) Proposal is REJECTED → "Application update" email
// Also creates in-app notifications for the freelancer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? ''
const BREVO_FROM_EMAIL = Deno.env.get('BREVO_FROM_EMAIL') ?? 'growlancer.own@gmail.com'
const BREVO_FROM_NAME = 'Growlancer Team'
const ADMIN_EMAIL = 'growlancer.own@gmail.com'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app'

// ─── HTML Escape Helper ─────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
    console.error('Brevo API response:', res.status, text)
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

/** Proposal Accepted — freelancer hired! */
function buildAcceptedEmailHtml(freelancerName: string, projectTitle: string, clientName: string): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(freelancerName)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      🎉 <strong>Congratulations!</strong> Your proposal for <strong>"${escapeHtml(projectTitle)}"</strong> has been accepted by <strong>${escapeHtml(clientName)}</strong>!
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #166534; margin: 0 0 8px;">✅ What's Next?</h3>
      <table style="font-size: 14px; color: #166534;">
        <tr><td style="padding: 4px 12px 4px 0;">1.</td><td>A contract has been created and is awaiting your review</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;">2.</td><td>The client will fund escrow to activate the contract</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;">3.</td><td>Start working and submit milestones for payment</td></tr>
      </table>
    </div>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/contracts" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View Contract Dashboard →
      </a>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      If you have any questions, reach out to <a href="mailto:${ADMIN_EMAIL}" style="color: #059669;">${ADMIN_EMAIL}</a>.
    </p>`
  return baseEmailHtml('You\'re Hired! 🎉', body)
}

/** Proposal Rejected */
function buildRejectedEmailHtml(freelancerName: string, projectTitle: string): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapeHtml(freelancerName)},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Thank you for submitting a proposal for <strong>"${escapeHtml(projectTitle)}"</strong>. After careful review, the client has decided to move forward with another freelancer for this project.
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #991b1b; margin: 0 0 8px;">💡 Don't Lose Heart</h3>
      <p style="font-size: 14px; color: #991b1b; margin: 0;">
        There are many more projects waiting for you on Growlancer. Keep applying — the right match is out there!
      </p>
    </div>
    <div style="margin: 24px 0; text-align: center;">
      <a href="${APP_URL}/dashboard/projects" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        Browse More Projects →
      </a>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      Keep building your profile and skills. The next opportunity is just around the corner!<br/>
      — The Growlancer Team
    </p>`
  return baseEmailHtml('Proposal Update 💙', body)
}

// ─── Main Server ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Only accept POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { proposal_id, action } = body // action: 'accept' | 'reject'

    if (!proposal_id || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: proposal_id, action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['accept', 'reject'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Must be "accept" or "reject".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch proposal with freelancer + project details
    const { data: proposal, error: propError } = await supabaseClient
      .from('proposals')
      .select('id, project_id, freelancer_id, status, profiles!proposals_freelancer_id_fkey(id, email, name), projects!proposals_project_id_fkey(id, title), projects!inner(client_id), profiles!projects_client_id_fkey!inner(name)')
      .eq('id', proposal_id)
      .single()

    if (propError || !proposal) {
      return new Response(
        JSON.stringify({ error: 'Proposal not found', details: propError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract data from the nested selects
    const freelancer = proposal.profiles as { id: string; email: string; name: string } | null
    const project = proposal.projects as { id: string; title: string } | null

    // Get the project's client name for the email
    let clientName = 'the client'
    const { data: projectFull } = await supabaseClient
      .from('projects')
      .select('client_id')
      .eq('id', proposal.project_id)
      .single()

    if (projectFull?.client_id) {
      const { data: cp } = await supabaseClient
        .from('profiles')
        .select('name')
        .eq('id', projectFull.client_id)
        .maybeSingle()
      if (cp?.name) clientName = cp.name
    }

    if (!freelancer || !project) {
      return new Response(
        JSON.stringify({ error: 'Could not load freelancer or project details' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send email
    let emailSent = false
    if (action === 'accept') {
      emailSent = await sendBrevoEmail(
        freelancer.email,
        freelancer.name,
        `You're Hired! — Proposal Accepted for "${project.title}"`,
        buildAcceptedEmailHtml(freelancer.name, project.title, clientName),
      )
    } else {
      emailSent = await sendBrevoEmail(
        freelancer.email,
        freelancer.name,
        `Proposal Update — "${project.title}"`,
        buildRejectedEmailHtml(freelancer.name, project.title),
      )
    }

    // Create in-app notification for the freelancer
    const notifType = action === 'accept' ? 'proposal_accepted' : 'proposal_rejected'
    const notifTitle = action === 'accept' ? 'Proposal Accepted! 🎉' : 'Proposal Update 💙'
    const notifMessage = action === 'accept'
      ? `Your proposal for "${project.title}" was accepted! Contract has been created.`
      : `Your proposal for "${project.title}" was not selected. Keep applying!`

    await supabaseClient.from('notifications').insert({
      user_id: freelancer.id,
      type: notifType,
      title: notifTitle,
      message: notifMessage,
      metadata: { proposal_id, project_id: project.id, action },
      action_url: action === 'accept' ? '/dashboard/contracts' : '/dashboard/projects',
    })

    console.log(`Proposal ${action} — email sent: ${emailSent} to ${freelancer.email}`)

    return new Response(
      JSON.stringify({
        success: true,
        email_sent: emailSent,
        notif_type: notifType,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Proposal notifications error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
