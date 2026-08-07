// Cashfree Payout Webhook Edge Function
// Receives payout status updates from Cashfree Payouts via webhooks
// (PAYOUT_STATUS_WEBHOOK) and updates withdrawal records + wallet accordingly.
// Signature: Base64(HMAC-SHA256(x-webhook-timestamp + rawBody, CASHFREE_WEBHOOK_SECRET))

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CASHFREE_WEBHOOK_SECRET = Deno.env.get('CASHFREE_WEBHOOK_SECRET') || ''

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

async function verifySignature(rawBody: string, timestamp: string, signature: string): Promise<boolean> {
  if (!timestamp || !signature) return false
  try {
    const signedPayload = `${timestamp}${rawBody}`
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(CASHFREE_WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
    let binary = ''
    const bytes = new Uint8Array(sigBytes)
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return safeEqual(btoa(binary), signature)
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse(200, { ok: true })
  }

  // Fail closed: without the webhook secret, reject everything.
  if (!CASHFREE_WEBHOOK_SECRET) {
    console.error('CASHFREE_WEBHOOK_SECRET is not configured — rejecting payout webhooks (fail closed)')
    return jsonResponse(500, { error: 'Webhook not configured' })
  }

  const signature = req.headers.get('x-webhook-signature') || ''
  const timestamp = req.headers.get('x-webhook-timestamp') || ''
  const bodyText = await req.text()

  if (!signature || !timestamp) {
    return jsonResponse(400, { error: 'Missing x-webhook-signature / x-webhook-timestamp' })
  }

  if (!(await verifySignature(bodyText, timestamp, signature))) {
    console.error('Invalid payout webhook signature')
    return jsonResponse(403, { error: 'Invalid signature' })
  }

  try {
    const event = JSON.parse(bodyText)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const eventType = String(event.type || event.event || '')
    const data = event.data || {}
    const transfer = data.transfer || {}

    // Only payout status events carry a transfer
    if (!transfer.transfer_id) {
      console.log('No transfer entity in payout webhook payload')
      return jsonResponse(200, { received: true })
    }

    const cashfreePayoutId = String(transfer.transfer_id)
    const transferStatus = String(transfer.transfer_status || '').toUpperCase()
    const failureReason = transfer.transfer_reason || transfer.transfer_error || null

    console.log(`Processing payout webhook: ${eventType} for transfer ${cashfreePayoutId} (${transferStatus})`)

    // Map Cashfree transfer status to our withdrawal status
    let newStatus: string
    if (transferStatus === 'SUCCESS' || transferStatus === 'COMPLETED') {
      newStatus = 'completed'
    } else if (transferStatus === 'FAILED' || transferStatus === 'REVERSED' || transferStatus === 'CANCELLED') {
      newStatus = 'failed'
    } else {
      // PENDING / PROCESSING / QUEUED / VALIDATION_PENDING etc.
      newStatus = 'processing'
    }

    // Find the withdrawal by cashfree_payout_id
    const { data: withdrawal } = await supabaseClient
      .from('withdrawals')
      .select('id, user_id, amount, status')
      .eq('cashfree_payout_id', cashfreePayoutId)
      .single()

    if (!withdrawal) {
      console.log(`No withdrawal found for payout ID: ${cashfreePayoutId}`)
      return jsonResponse(200, { received: true })
    }

    if (newStatus === 'failed' && withdrawal.status !== 'failed') {
      // Rollback: release wallet funds back to balance
      await supabaseClient.rpc('release_wallet_funds', {
        p_user_id: withdrawal.user_id,
        p_amount: withdrawal.amount,
      }).catch((e: unknown) => console.error('Release funds error:', e))

      await supabaseClient.from('transactions').update({
        status: 'failed',
        description: `Withdrawal failed: ${failureReason || 'Payout failed at Cashfree'}`,
      }).eq('metadata->>withdrawal_id', withdrawal.id).catch(() => {})
    } else if (newStatus === 'completed') {
      // Deduct the held amount from pending_balance (finalizes the withdrawal)
      await supabaseClient.rpc('process_withdrawal_complete', {
        p_withdrawal_id: withdrawal.id,
      }).catch((e: unknown) => console.error('process_withdrawal_complete error:', e))

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

    return jsonResponse(200, { received: true, withdrawal_id: withdrawal.id, new_status: newStatus })
  } catch (error) {
    console.error('Cashfree payout webhook error:', error)
    return jsonResponse(500, { error: 'Webhook processing failed' })
  }
})
