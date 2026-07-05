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

// ─── Email Notification Helper ────────────────────────────────────────────────

const BREVO_FROM_EMAIL = Deno.env.get('BREVO_FROM_EMAIL') ?? 'growlancer.own@gmail.com';
const BREVO_FROM_NAME = 'Growlancer Team';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);
}

/** Send a transactional email via Brevo API */
async function sendNotificationEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string
): Promise<void> {
  try {
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
    await fetch('https://api.brevo.com/v3/smtp/email', {
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
    });
  } catch (err) {
    console.error('[Email notification failed]', err);
  }
}

function buildWithdrawalEmail(name: string, amount: number, netAmount: number, method: string, status: 'completed' | 'failed', reason?: string): string {
  const isSuccess = status === 'completed';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 40px 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, ${isSuccess ? '#059669 0%, #047857' : '#dc2626 0%, #b91c1c'} 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; font-size: 22px; font-weight: 700; margin: 0;">${isSuccess ? 'Withdrawal Processed ✅' : 'Withdrawal Failed 💔'}</h1>
    </div>
    <div style="padding: 32px;">
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')},</p>
      ${isSuccess
        ? `<p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Your withdrawal of <strong style="color: #059669;">${formatCurrency(amount)}</strong> has been processed successfully!</p>
           <div style="margin: 28px 0; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
             <p style="font-size: 14px; color: #166534; margin: 0;"><strong>Amount:</strong> ${formatCurrency(amount)}<br/><strong>Net Received:</strong> ${formatCurrency(netAmount)}<br/><strong>Method:</strong> ${method}</p>
           </div>
           <p style="font-size: 14px; color: #64748b; line-height: 1.7;">Funds should appear in 1-3 business days.</p>`
        : `<p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Your withdrawal of <strong style="color: #dc2626;">${formatCurrency(amount)}</strong> could not be processed.</p>
           <div style="margin: 28px 0; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;">
             <p style="font-size: 14px; color: #991b1b; margin: 0;">${reason ? reason.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'An unexpected error occurred.'}</p>
           </div>
           <p style="font-size: 14px; color: #64748b; line-height: 1.7;">The full amount has been returned to your wallet.</p>`
      }
      <div style="margin: 24px 0; text-align: center;">
        <a href="${APP_URL}/dashboard/wallet" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">View Wallet →</a>
      </div>
      <p style="font-size: 14px; color: #64748b; line-height: 1.7;">— The Growlancer Team</p>
    </div>
    <div style="padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">Growlancer — AI-Powered Freelancing Marketplace</p>
    </div>
  </div>
</body>
</html>`;
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
        
        // Send failure notification email (fire-and-forget)
        sendNotificationEmail(
          user.email || '',
          user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          `Withdrawal of ${formatCurrency(amount)} Failed — Funds Returned 💔`,
          buildWithdrawalEmail(
            user.user_metadata?.name || user.email?.split('@')[0] || 'User',
            amount, amount, wdMethod, 'failed', errorMsg
          ),
        );

        return new Response(JSON.stringify({ success: false, error: errorMsg, withdrawal_id: withdrawal.id, rollback: true }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Send success notification email (fire-and-forget)
      sendNotificationEmail(
        user.email || '',
        user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        `Withdrawal of ${formatCurrency(amount)} Processed Successfully ✅`,
        buildWithdrawalEmail(
          user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          amount, netAmount, wdMethod, 'completed'
        ),
      );

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