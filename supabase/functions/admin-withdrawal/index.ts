// Admin Commission Withdrawal Edge Function
// Lets Growlancer admins withdraw the platform's 5% commission to their own
// bank account in real time via RazorpayX Payouts.
//
//   POST  → book a withdrawal (validated server-side against the commission
//           ledger), create the RazorpayX fund account (bank/UPI), fire the
//           actual /v1/payouts call and track the provider payout ID.
//   GET   → withdrawal history for the admin panel.
//
// Security: admin role verified server-side (profiles.role = 'admin'),
// per-user rate limiting, amounts validated against bank limits
// (min ₹100 · max ₹5,00,000 — SBM Small Finance Bank).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts';

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || '';
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || '';
const RAZORPAY_ACCOUNT_NUMBER = Deno.env.get('RAZORPAY_ACCOUNT_NUMBER') || '';
const RAZORPAY_API_URL = 'https://api.razorpay.com/v1';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 3600000;
const ROUTE = 'admin-withdrawal';

async function checkRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  try { await supabaseClient.rpc('cleanup_expired_rate_limits'); } catch { /* ignore */ }
  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());
  if (error) return true;
  if (count !== null && count >= RATE_LIMIT) return false;
  await supabaseClient.from('rate_limits').insert({ identifier, route: ROUTE, count: 1, window_start: now.toISOString() });
  return true;
}

// ─── RazorpayX API helpers ──────────────────────────────────────────────────
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

/** Create (or reuse) the RazorpayX contact for this admin. */
async function ensureContact(supabaseClient: any, userId: string, name: string, email?: string): Promise<any> {
  // Look up existing contact by reference id first
  try {
    const list = await razorpayFetch('/contacts?count=100');
    const existing = (list?.items || []).find((c: any) => c.reference_id === `admin_${userId.slice(0, 20)}`);
    if (existing) return existing;
  } catch { /* ignore lookup failure */ }

  const contactPayload: Record<string, unknown> = {
    name: name || 'Growlancer Admin',
    type: 'customer',
    reference_id: `admin_${userId.slice(0, 20)}`,
  };
  if (email) contactPayload.email = email;
  return await razorpayFetch('/contacts', { method: 'POST', body: JSON.stringify(contactPayload) });
}

/** Create a RazorpayX fund account for the admin's bank or UPI details. */
async function createFundAccount(contact: any, method: string, details: any): Promise<string> {
  if (method === 'bank') {
    const fundPayload = {
      contact_id: contact.id,
      account_type: 'bank_account',
      bank_account: {
        name: details.account_holder_name || contact.name || 'Growlancer Admin',
        ifsc: details.ifsc_code || '',
        account_number: details.account_number || '',
      },
    };
    const fundRes = await razorpayFetch('/fund_accounts', { method: 'POST', body: JSON.stringify(fundPayload) });
    return fundRes.id;
  }
  // UPI (vpa)
  const fundPayload = {
    contact_id: contact.id,
    account_type: 'vpa',
    vpa: { address: details.upi_id || '' },
  };
  const fundRes = await razorpayFetch('/fund_accounts', { method: 'POST', body: JSON.stringify(fundPayload) });
  return fundRes.id;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ── Admin role check (server-side, never trust the client) ────────────
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role, is_admin, name')
      .eq('id', user.id)
      .maybeSingle()
    const isAdmin = profile?.role === 'admin' || profile?.is_admin === true
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const allowed = await checkRateLimit(supabaseClient, user.id)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many withdrawal requests. Please try again later.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const { amount, method, account_holder_name, account_number, ifsc_code, bank_name, upi_id } = body
      const wdMethod = method === 'upi' ? 'upi' : 'bank'

      // ── Bank limits: min ₹100 · max ₹5,00,000 (SBM Small Finance Bank) ──
      const numAmount = Number(amount)
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        return new Response(JSON.stringify({ error: 'Invalid amount' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (numAmount < 100) {
        return new Response(JSON.stringify({ error: 'Minimum withdrawal amount is ₹100' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (numAmount > 500000) {
        return new Response(JSON.stringify({ error: 'Maximum withdrawal amount is ₹5,00,000' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (wdMethod === 'bank' && (!account_number || !ifsc_code || !account_holder_name)) {
        return new Response(JSON.stringify({ error: 'Bank account number, IFSC and account holder name are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (wdMethod === 'upi' && (!upi_id || !String(upi_id).includes('@'))) {
        return new Response(JSON.stringify({ error: 'A valid UPI ID is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // ── Server-authoritative booking (validates commission balance) ──────
      const { data: booked, error: bookErr } = await supabaseClient.rpc('create_admin_withdrawal', {
        p_amount: numAmount,
        p_method: wdMethod,
        p_account_holder_name: account_holder_name || null,
        p_account_number: account_number || null,
        p_ifsc_code: ifsc_code || null,
        p_bank_name: bank_name || null,
        p_upi_id: upi_id || null,
      })
      if (bookErr) {
        const msg = bookErr.message || 'Failed to book withdrawal'
        return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const withdrawal = Array.isArray(booked) ? booked[0] : booked

      // ── RazorpayX fund account + payout ────────────────────────────────
      let providerPayoutId: string | null = null
      let payoutStatus = 'processing'

      try {
        const contact = await ensureContact(supabaseClient, user.id, profile?.name || user.email?.split('@')[0] || 'Growlancer Admin', user.email || undefined)
        const fundAccountId = await createFundAccount(contact, wdMethod, { account_holder_name, ifsc_code, account_number, upi_id })

        // Persist the fund account id on the withdrawal row
        await supabaseClient.from('admin_withdrawals').update({ razorpay_fund_account_id: fundAccountId }).eq('id', withdrawal.id)

        const payoutResult = await razorpayFetch('/payouts', {
          method: 'POST',
          body: JSON.stringify({
            account_number: RAZORPAY_ACCOUNT_NUMBER,
            fund_account_id: fundAccountId,
            amount: Math.round(numAmount * 100), // paise
            currency: 'INR',
            mode: wdMethod === 'upi' ? 'UPI' : 'NEFT',
            purpose: 'payout',
            queue_if_low_balance: true,
            reference_id: `adwd_${withdrawal.id.slice(0, 12)}`,
            narration: `Growlancer Commission Withdrawal - ${user.email || user.id.slice(0, 8)}`,
          }),
        })

        providerPayoutId = payoutResult.id
        const rpStatus = payoutResult.status
        if (rpStatus === 'processed' || rpStatus === 'completed') payoutStatus = 'completed'
        else if (rpStatus === 'failed' || rpStatus === 'cancelled') payoutStatus = 'failed'
        else payoutStatus = 'processing'

        await supabaseAdmin.rpc('finalize_admin_withdrawal', {
          p_withdrawal_id: withdrawal.id,
          p_status: payoutStatus,
          p_razorpay_payout_id: providerPayoutId,
          p_failure_reason: payoutStatus === 'failed' ? `RazorpayX payout ${payoutResult.id} failed` : null,
        })

        // Audit trail
        await supabaseAdmin.from('transactions').insert({
          user_id: user.id,
          amount: numAmount,
          type: 'debit',
          source: 'admin_withdrawal',
          status: payoutStatus === 'completed' ? 'completed' : 'pending',
          description: `Admin commission withdrawal (${wdMethod})${providerPayoutId ? ` · ${providerPayoutId}` : ''}`,
          currency: 'INR',
          metadata: { admin_withdrawal_id: withdrawal.id, method: wdMethod },
        })
      } catch (payoutError: any) {
        const errorMsg = payoutError?.message || 'Payout API call failed'

        // ── Config / not-ready errors → QUEUE, don't hard-fail ────────────
        // RazorpayX may not be enabled on the account yet. Keep the row
        // 'pending' — the admin can retry later (or the payout is processed
        // once the service is configured). No money is held back from the
        // commission ledger until the payout actually lands.
        const configLike = /url was not found|not found on the server|invalid account|account.*not.*exist|payouts.*not.*enabled|not configured|invalid.*credential|missing.*credential|unauthorized|payment processing is not enabled/i.test(errorMsg)
        if (configLike) {
          await supabaseAdmin.rpc('finalize_admin_withdrawal', {
            p_withdrawal_id: withdrawal.id,
            p_status: 'pending',
            p_failure_reason: `Queued — payout service not configured yet. ${errorMsg}`,
          })
          return new Response(JSON.stringify({
            success: true,
            queued: true,
            withdrawal: { id: withdrawal.id, amount: withdrawal.amount, status: 'pending', method: wdMethod },
            message: 'Withdrawal queued. It will be processed once the payout service is configured.',
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // ── REAL FAILURE → mark failed (amount frees back to balance) ────
        await supabaseAdmin.rpc('finalize_admin_withdrawal', {
          p_withdrawal_id: withdrawal.id,
          p_status: 'failed',
          p_failure_reason: errorMsg,
        })
        await supabaseAdmin.from('transactions').insert({
          user_id: user.id,
          amount: numAmount,
          type: 'debit',
          source: 'admin_withdrawal',
          status: 'failed',
          description: `Admin commission withdrawal failed: ${errorMsg}`,
          currency: 'INR',
          metadata: { admin_withdrawal_id: withdrawal.id, method: wdMethod },
        })
        return new Response(JSON.stringify({ success: false, error: errorMsg, withdrawal_id: withdrawal.id }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({
        success: true,
        payout_completed: payoutStatus === 'completed',
        withdrawal: {
          id: withdrawal.id,
          amount: withdrawal.amount,
          fee: withdrawal.fee,
          net_amount: withdrawal.net_amount,
          status: payoutStatus,
          method: wdMethod,
          razorpay_payout_id: providerPayoutId,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (req.method === 'GET') {
      // Commission balance + withdrawal history
      const { data: balance } = await supabaseClient.rpc('get_admin_commission_balance')
      const { data: withdrawals, error } = await supabaseClient
        .from('admin_withdrawals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return new Response(JSON.stringify({ balance, withdrawals }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Admin withdrawal error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
