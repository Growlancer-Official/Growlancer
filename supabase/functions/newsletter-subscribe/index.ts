// Newsletter Subscribe Edge Function
// Handles newsletter subscriptions with:
//   1) DB insert of subscriber
//   2) Welcome email
//   3) Newsletter contact record

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail } from '../_shared/resend.ts'

// Transactional email via Resend (shared helper).
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

// ─── Email helper (Resend) ────────────────────────────────────────────────
async function sendNotificationEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string,
): Promise<boolean> {
  void toName;
  return sendEmail({ to, subject, html: htmlContent })
}

// ─── Add contact to newsletter list ─────────────────────────────────────────
async function syncNewsletterContact(email: string, name: string): Promise<string | null> {
  // Contact sync disabled — the newsletter list lives in the DB only.
  console.log('[newsletter] Newsletter contact sync skipped (DB-only list):', email)
  return null
}

// ─── Welcome Email Template ────────────────────────────────────────────────
function welcomeEmailHtml(name: string, email: string): string {
  const escapedName = escapeHtml(name || 'there');
  const unsubLink = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 40px 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; font-size: 22px; font-weight: 700; margin: 0;">Welcome to Growlancer! 🎉</h1>
    </div>
    <div style="padding: 32px;">
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${escapedName},</p>
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
        Thanks for subscribing to the Growlancer newsletter! You'll now receive:
      </p>
      <div style="margin: 24px 0; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
        <ul style="font-size: 14px; color: #166534; line-height: 2; padding-left: 20px; margin: 0;">
          <li>🚀 Product updates & new features</li>
          <li>💡 Freelancing tips & best practices</li>
          <li>🎯 Exclusive early access opportunities</li>
          <li>📈 Industry insights & market trends</li>
        </ul>
      </div>
      <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
        We're building the future of AI-powered freelancing, and we're excited to have you along for the journey!
      </p>
      <div style="margin-top: 28px; text-align: center;">
        <a href="${APP_URL}" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
          Explore Growlancer →
        </a>
      </div>
    </div>
    <div style="padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0 0 4px;">Growlancer — AI-Powered Freelancing Marketplace</p>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        <a href="${unsubLink}" style="color: #94a3b8;">Unsubscribe</a> at any time.
      </p>
    </div>
  </div>
</body>
</html>`
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

    const { method } = req

    // ─── POST: Subscribe ──────────────────────────────────────────────
    if (method === 'POST') {
      const body = await req.json()
      const { email, name, country } = body

      if (!email || !email.includes('@')) {
        return new Response(
          JSON.stringify({ error: 'Valid email is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (country && typeof country !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Invalid country' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Also record the waitlist interest (name + email + country) so the admin
      // section can show which country is interested.
      try {
        await supabaseClient.rpc('join_waitlist', {
          p_email: email.toLowerCase(),
          p_country: country || null,
          p_signup_source: 'homepage',
          p_name: name || null,
        })
      } catch (waitlistErr) {
        console.error('Waitlist insert error (non-fatal):', waitlistErr)
      }

      // Check if already subscribed
      const { data: existing } = await supabaseClient
        .from('newsletter_subscribers')
        .select('id, unsubscribed_at')
        .eq('email', email.toLowerCase())
        .maybeSingle()

      if (existing) {
        if (!existing.unsubscribed_at) {
          return new Response(
            JSON.stringify({ success: true, message: 'Already subscribed!' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Re-subscribe
        await supabaseClient
          .from('newsletter_subscribers')
          .update({ unsubscribed_at: null, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        // Create new subscriber in DB
        const { error: insertError } = await supabaseClient
          .from('newsletter_subscribers')
          .insert({
            email: email.toLowerCase(),
            name: name || null,
            source: 'website',
          })

        if (insertError) {
          console.error('Insert error:', insertError)
          return new Response(
            JSON.stringify({ error: 'Failed to subscribe. Please try again.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // Sync to newsletter contact list
      const contactId = await syncNewsletterContact(email.toLowerCase(), name || email.split('@')[0])
      if (contactId) {
        await supabaseClient
          .from('newsletter_subscribers')
          .update({ brevo_contact_id: contactId })
          .eq('email', email.toLowerCase())
      }

      // Send welcome email
      const welcomeSent = await sendNotificationEmail(
        email.toLowerCase(),
        name || email.split('@')[0],
        'Welcome to Growlancer Newsletter! 🎉',
        welcomeEmailHtml(name || email.split('@')[0], email.toLowerCase()),
      )

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Successfully subscribed!',
          welcome_email_sent: welcomeSent,
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── PATCH: Unsubscribe ───────────────────────────────────────────
    if (method === 'PATCH') {
      const body = await req.json()
      const { email, reason } = body

      if (!email) {
        return new Response(
          JSON.stringify({ error: 'Email is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      await supabaseClient
        .from('newsletter_subscribers')
        .update({
          unsubscribed_at: new Date().toISOString(),
          unsubscribed_reason: reason || null,
        })
        .eq('email', email.toLowerCase())

      return new Response(
        JSON.stringify({ success: true, message: 'Unsubscribed successfully.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Newsletter error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
