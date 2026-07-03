// Withdrawal Edge Function
// Handles withdrawal requests and processes actual payout API calls:
//   - RazorpayX Payouts (India, INR) via POST /v1/payouts
//   - PayPal Payouts (international, USD) via POST /v1/payments/payouts
// With full rollback on failure and provider payout ID tracking.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
  'http://localhost:5173',
];

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || '';
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || '';
const RAZORPAY_ACCOUNT_NUMBER = Deno.env.get('RAZORPAY_ACCOUNT_NUMBER') || '';
const RAZORPAY_API_URL = 'https://api.razorpay.com/v1';

const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') || '';
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET') || '';
const PAYPAL_API_URL = Deno.env.get('PAYPAL_SANDBOX') === 'true'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  }
}

// ─── Payout API Helpers ───────────────────────────────────────────────────────

function getRazorpayBasicAuth(): string {
  return `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`;
}

async function razorpayFetch(path: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${RAZORPAY_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: getRazorpayBasicAuth(),
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    let errorMsg = `Razorpay API error (${response.status})`;
    try { const err = JSON.parse(body); errorMsg = err.error?.description || err.error?.reason || errorMsg; } catch { /* ignore */ }
    throw new Error(errorMsg);
  }
  return JSON.parse(body);
}

async function getPayPalAccessToken(): Promise<string> {
  const authHeader = `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`;
  const res = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal OAuth error: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function paypalFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getPayPalAccessToken();
  const response = await fetch(`${PAYPAL_API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await response.text();
  if (!response.ok) {
    let errorMsg = `PayPal API error (${response.status})`;
    try { const err = JSON.parse(body); errorMsg = err.message || err.error_description || err.name || errorMsg; } catch { /* ignore */ }
    throw new Error(errorMsg);
  }
  return JSON.parse(body);
}

async function rollbackWithdrawal(supabaseClient: any, withdrawalId: string, userId: string, amount: number, errorReason: string): Promise<void> {
  console.error(`[ROLLBACK] Withdrawal ${withdrawalId} failed: ${errorReason}`);
  try { await supabaseClient.rpc('release_wallet_funds', { p_user_id: userId, p_amount: amount }); } catch (e) { console.error('[ROLLBACK] Release failed:', e); }
  try { await supabaseClient.from('withdrawals').update({ status: 'failed', failure_reason: errorReason, updated_at: new Date().toISOString() }).eq('id', withdrawalId); } catch (e) { console.error('[ROLLBACK] Update failed:', e); }
  try { await supabaseClient.from('transactions').update({ status: 'failed', description: `Withdrawal failed: ${errorReason}` }).eq('metadata->>withdrawal_id', withdrawalId); } catch { /* non-critical */ }
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 3600000;
const ROUTE = 'withdrawal';

async function checkRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  try { await supabaseClient.rpc('cleanup_expired_rate_limits'); } catch { /* ignore */ }
  const { count, error } = await supabaseClient.from('rate_limits').select('*', { count: 'exact', head: true }).eq('identifier', identifier).eq('route', ROUTE).gte('window_start', windowStart.toISOString());
  if (error) return true;
  if (count !== null && count >= RATE_LIMIT) return false;
  await supabaseClient.from('rate_limits').insert({ identifier, route: ROUTE, count: 1, window_start: now.toISOString() });
  return true;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    )

    // Get user from auth
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // Check rate limit (DB-backed, using user ID as identifier)
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const identifier = user.id || clientIP;
    const allowed = await checkRateLimit(supabaseClient, identifier);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many withdrawal requests. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { method } = req

    if (method === 'POST') {
      const body = await req.json()
      const { amount, withdrawal_method, paypal_email, fund_account_id, payout_mode } = body

      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: 'Invalid amount' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const wdMethod = withdrawal_method || 'paypal'

      if (wdMethod === 'paypal' && !paypal_email) {
        return new Response(JSON.stringify({ error: 'PayPal email is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (wdMethod === 'razorpay_payout' && !fund_account_id) {
        return new Response(JSON.stringify({ error: 'Fund account ID is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data: walletData, error: walletError } = await supabaseClient.rpc('get_wallet_balance', { p_user_id: user.id })
      if (walletError) throw walletError
      const balance = walletData?.balance ?? 0
      const pendingBalance = walletData?.pending_balance ?? 0
      const availableBalance = balance - pendingBalance

      if (availableBalance < amount) {
        return new Response(JSON.stringify({ error: 'Insufficient balance', available_balance: availableBalance, requested_amount: amount }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const feeRate = wdMethod === 'razorpay_payout' ? 0.02 : 0.029
      const fee = Math.round(amount * feeRate)
      const netAmount = Math.round(amount * (1 - feeRate))

      // Create withdrawal record
      const insertData: Record<string, any> = { user_id: user.id, amount, method: wdMethod, status: 'pending', fee, net_amount: netAmount, payout_mode: payout_mode || null }
      if (wdMethod === 'paypal') insertData.paypal_email = paypal_email
      if (wdMethod === 'razorpay_payout') insertData.razorpay_fund_account_id = fund_account_id

      const { data: withdrawal, error: withdrawalError } = await supabaseClient.from('withdrawals').insert(insertData).select().single()
      if (withdrawalError) throw withdrawalError

      // Hold wallet funds
      const { data: holdResult, error: holdError } = await supabaseClient.rpc('hold_wallet_funds', { p_user_id: user.id, p_amount: amount })
      if (holdError || !holdResult?.success) {
        await supabaseClient.from('withdrawals').delete().eq('id', withdrawal.id)
        throw new Error(holdResult?.error || 'Failed to hold funds')
      }

      // Create transaction record
      const txDesc = wdMethod === 'paypal' ? `Withdrawal to PayPal (${paypal_email})` : 'Withdrawal via Razorpay Payout'
      await supabaseClient.from('transactions').insert({
        user_id: user.id, amount, type: 'debit', source: 'withdrawal', status: 'pending', description: txDesc,
        metadata: { withdrawal_id: withdrawal.id, method: wdMethod },
      })

      // ────────────────────────────────────────────────────────────────────
      // ACTUAL PAYOUT API CALL
      // ────────────────────────────────────────────────────────────────────
      let providerPayoutId: string | null = null
      let payoutStatus = 'processing'

      try {
        if (wdMethod === 'razorpay_payout') {
          // ── RazorpayX Payouts API: POST /v1/payouts ──
          const mode = payout_mode || 'UPI'
          const payoutResult = await razorpayFetch('/payouts', {
            method: 'POST',
            body: JSON.stringify({
              account_number: RAZORPAY_ACCOUNT_NUMBER,
              fund_account_id,
              amount: Math.round(amount * 100), // Convert to paise
              currency: 'INR',
              mode,
              purpose: 'payout',
              queue_if_low_balance: true,
              reference_id: `wd_${withdrawal.id.slice(0, 12)}`,
              narration: `Growlancer Withdrawal - ${user.email || user.id.slice(0, 8)}`,
            }),
          })

          providerPayoutId = payoutResult.id
          const rpStatus = payoutResult.status
          if (rpStatus === 'processed' || rpStatus === 'completed') payoutStatus = 'completed'
          else if (rpStatus === 'failed' || rpStatus === 'cancelled') payoutStatus = 'failed'
          else payoutStatus = 'processing'

          await supabaseClient.from('withdrawals').update({
            razorpay_payout_id: providerPayoutId, status: payoutStatus,
            processed_at: payoutStatus === 'completed' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }).eq('id', withdrawal.id)

          await supabaseClient.from('transactions').update({
            status: payoutStatus === 'completed' ? 'completed' : 'pending',
            description: `Withdrawal via Razorpay Payout (${payoutResult.id})`,
          }).eq('metadata->>withdrawal_id', withdrawal.id)

        } else if (wdMethod === 'paypal') {
          // ── PayPal Payouts API: POST /v1/payments/payouts ──
          const senderBatchId = `wd_${withdrawal.id}_${Date.now()}`
          const payoutResult = await paypalFetch('/v1/payments/payouts', {
            method: 'POST',
            body: JSON.stringify({
              sender_batch_header: {
                sender_batch_id: senderBatchId,
                email_subject: 'You have received a payment from Growlancer!',
                email_message: `You have received $${netAmount} USD from Growlancer. It may take up to 1-3 business days to appear.`,
              },
              items: [{
                recipient_type: 'EMAIL',
                amount: { value: netAmount.toFixed(2), currency: 'USD' },
                receiver: paypal_email,
                note: 'Payment from Growlancer',
                sender_item_id: `wd_${withdrawal.id.slice(0, 8)}`,
              }],
            }),
          })

          const batchHeader = payoutResult.batch_header
          providerPayoutId = batchHeader?.payout_batch_id
          const ppStatus = batchHeader?.batch_status || 'PENDING'
          if (ppStatus === 'SUCCESS') payoutStatus = 'completed'
          else if (['DENIED', 'CANCELED'].includes(ppStatus)) payoutStatus = 'failed'
          else payoutStatus = 'processing'

          await supabaseClient.from('withdrawals').update({
            paypal_payout_id: providerPayoutId, status: payoutStatus,
            processed_at: payoutStatus === 'completed' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }).eq('id', withdrawal.id)

          await supabaseClient.from('transactions').update({
            status: payoutStatus === 'completed' ? 'completed' : 'pending',
            description: `Withdrawal via PayPal (${paypal_email})`,
          }).eq('metadata->>withdrawal_id', withdrawal.id)
        }

      } catch (payoutError: any) {
        // ── FAILURE → Rollback ──
        const errorMsg = payoutError?.message || 'Payout API call failed'
        await rollbackWithdrawal(supabaseClient, withdrawal.id, user.id, amount, errorMsg)
        return new Response(JSON.stringify({ success: false, error: errorMsg, withdrawal_id: withdrawal.id, rollback: true }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({
        success: true, payout_completed: payoutStatus === 'completed',
        withdrawal: { id: withdrawal.id, amount: withdrawal.amount, fee: withdrawal.fee, net_amount: withdrawal.net_amount, status: payoutStatus, method: withdrawal.method, payout_id: providerPayoutId },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (method === 'GET') {
      // Get withdrawal history
      const { data: withdrawals, error } = await supabaseClient
        .from('withdrawals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      return new Response(
        JSON.stringify({ withdrawals }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Withdrawal error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})