// Razorpay Payout Webhook Edge Function
// Receives payout status updates from RazorpayX via webhooks
// Updates withdrawal records and transactions accordingly

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify webhook secret if configured
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
    if (webhookSecret) {
      const signature = req.headers.get('x-razorpay-signature') || ''
      const body = await req.text()
      // Basic HMAC-SHA256 verification
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey('raw', encoder.encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
      const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
      const expectedSig = Array.from(new Uint8Array(signatureBytes)).map(b => b.toString(16).padStart(2, '0')).join('')
      if (signature !== expectedSig) {
        console.error('Invalid webhook signature')
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    const event = await req.json()
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const eventType = event.event
    const payload = event.payload
    const payout = payload?.payout?.entity

    if (!payout) {
      console.log('No payout entity in webhook payload')
      return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const razorpayPayoutId = payout.id
    const payoutStatus = payout.status
    const failureReason = payout.failure_reason || null

    console.log(`Processing payout webhook: ${eventType} for payout ${razorpayPayoutId}`)

    // Map RazorpayX payout status to our status
    let newStatus: string
    if (payoutStatus === 'processed' || payoutStatus === 'completed') {
      newStatus = 'completed'
    } else if (payoutStatus === 'failed' || payoutStatus === 'cancelled' || payoutStatus === 'reversed') {
      newStatus = 'failed'
    } else if (payoutStatus === 'queued' || payoutStatus === 'processing') {
      newStatus = 'processing'
    } else {
      console.log(`Unhandled payout status: ${payoutStatus}`)
      newStatus = 'processing'
    }

    // Find the withdrawal by razorpay_payout_id
    const { data: withdrawal } = await supabaseClient
      .from('withdrawals')
      .select('id, user_id, amount, status')
      .eq('razorpay_payout_id', razorpayPayoutId)
      .single()

    if (!withdrawal) {
      console.log(`No withdrawal found for payout ID: ${razorpayPayoutId}`)
      return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (newStatus === 'failed' && withdrawal.status !== 'failed') {
      // Rollback: release wallet funds back to balance
      await supabaseClient.rpc('release_wallet_funds', {
        p_user_id: withdrawal.user_id,
        p_amount: withdrawal.amount,
      }).catch(e => console.error('Release funds error:', e))

      await supabaseClient.from('transactions').update({
        status: 'failed',
        description: `Withdrawal failed: ${failureReason || 'Payout failed at RazorpayX'}`,
      }).eq('metadata->>withdrawal_id', withdrawal.id).catch(() => {})
    } else if (newStatus === 'completed') {
      await supabaseClient.from('transactions').update({
        status: 'completed',
      }).eq('metadata->>withdrawal_id', withdrawal.id).catch(() => {})
    }

    // Update withdrawal status
    await supabaseClient
      .from('withdrawals')
      .update({
        status: newStatus,
        failure_reason: failureReason,
        processed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', withdrawal.id)

    return new Response(JSON.stringify({ received: true, withdrawal_id: withdrawal.id, new_status: newStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Razorpay payout webhook error:', error)
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
