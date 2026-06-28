// Newsletter Subscribe Edge Function
// Handles newsletter subscriptions with:
//   1) DB insert of subscriber
//   2) Welcome email via Brevo
//   3) Brevo contact sync for future campaigns

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? ''
const BREVO_FROM_EMAIL = Deno.env.get('BREVO_FROM_EMAIL') ?? 'growlancer.own@gmail.com'
const BREVO_FROM_NAME = 'Growlancer Team'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Brevo API helper ──────────────────────────────────────────────────────
async function sendBrevoEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string,
): Promise<boolean> {
  try {
    const key = Deno.env.get('BREVO_API_KEY') ?? ''
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': key,
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

    if (!res.ok) {
      const text = await res.text()
      console.error('Brevo email error:', res.status, text)
      return false
    }
    return true
  } catch (err) {
    console.error('Brevo send error:', err)
    return false
  }
}

// ─── Add contact to Brevo list ─────────────────────────────────────────────
async function addToBrevoList(email: string, name: string): Promise<string | null> {
  try {
    const key = Deno.env.get('BREVO_API_KEY') ?? ''
    // Create/update contact in Brevo
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes: {
          NOM: name || email.split('@')[0],
          SOURCE: 'Growlancer Newsletter',
        },
        listIds: [],  // Add to specific list IDs if needed
        updateEnabled: true,
      }),
    })

    const data = await res.json()
    if (res.ok && data.id) {
      return String(data.id)
    }
    console.warn('Brevo contact creation warning:', res.status, JSON.stringify(data))
    return null
  } catch (err) {
    console.error('Brevo contact error:', err)
    return null
  }
}

// ─── Welcome Email Template ────────────────────────────────────────────────
function welcomeEmailHtml(name: string, email: string): string {
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
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${name || 'there'},</p>
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
serve(async (req) => {
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
      const { email, name } = body

      if (!email || !email.includes('@')) {
        return new Response(
          JSON.stringify({ error: 'Valid email is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
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

      // Sync to Brevo contacts
      const brevoId = await addToBrevoList(email.toLowerCase(), name || email.split('@')[0])
      if (brevoId) {
        await supabaseClient
          .from('newsletter_subscribers')
          .update({ brevo_contact_id: brevoId })
          .eq('email', email.toLowerCase())
      }

      // Send welcome email
      const welcomeSent = await sendBrevoEmail(
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
