// Withdrawal Edge Function
// Handles withdrawal requests from freelancers to their PayPal accounts
// Supports real-time balance updates and transaction tracking
// PayPal-only withdrawal method

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting constants (DB-backed via rate_limits table)
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 3600000; // 1 hour
const ROUTE = 'withdrawal';

// DB-backed rate limit check (persists across cold starts)
async function checkRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);

  // Clean up expired records first (best-effort)
  try {
    await supabaseClient.rpc('cleanup_expired_rate_limits');
  } catch {
    // Non-critical; continue
  }

  // Count requests in the current window
  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());

  if (error) {
    // Fallback: allow if table doesn't exist yet
    return true;
  }

  if (count !== null && count >= RATE_LIMIT) {
    return false;
  }

  // Record this request (use upsert to avoid duplicate key issues)
  await supabaseClient
    .from('rate_limits')
    .insert({
      identifier,
      route: ROUTE,
      count: 1,
      window_start: now.toISOString(),
    });

  return true;
}

serve(async (req) => {
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
      // Create withdrawal request
      const { amount, paypal_email } = await req.json()

      // Validate input
      if (!amount || amount <= 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid amount' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!paypal_email) {
        return new Response(
          JSON.stringify({ error: 'PayPal email is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Use wallet RPC to get available balance instead of raw transactions table
      const { data: walletData, error: walletError } = await supabaseClient
        .rpc('get_wallet_balance', { p_user_id: user.id })

      if (walletError) {
        throw walletError
      }

      const balance = walletData?.balance ?? 0
      const pendingBalance = walletData?.pending_balance ?? 0
      const availableBalance = balance - pendingBalance

      // Check if user has sufficient balance
      if (availableBalance < amount) {
        return new Response(
          JSON.stringify({
            error: 'Insufficient balance',
            available_balance: availableBalance,
            requested_amount: amount
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Create withdrawal record
      const { data: withdrawal, error: withdrawalError } = await supabaseClient
        .from('withdrawals')
        .insert({
          user_id: user.id,
          amount,
          method: 'paypal',
          paypal_email,
          status: 'pending',
          fee: Math.round(amount * 0.029), // 2.9% PayPal fee
          net_amount: Math.round(amount * 0.971), // Amount after fee
        })
        .select()
        .single()

      if (withdrawalError) {
        throw withdrawalError
      }

      // Hold wallet funds using RPC (moves from balance to pending_balance)
      const { data: holdResult, error: holdError } = await supabaseClient
        .rpc('hold_wallet_funds', { p_user_id: user.id, p_amount: amount })

      if (holdError || !holdResult?.success) {
        // Rollback: delete the withdrawal record
        await supabaseClient.from('withdrawals').delete().eq('id', withdrawal.id)
        throw new Error(holdResult?.error || 'Failed to hold funds')
      }

      // Create transaction record for the withdrawal
      const { error: transactionError } = await supabaseClient
        .from('transactions')
        .insert({
          user_id: user.id,
          amount,
          type: 'debit',
          source: 'withdrawal',
          status: 'pending',
          description: `Withdrawal to PayPal (${paypal_email})`,
          metadata: {
            withdrawal_id: withdrawal.id,
            method: 'paypal',
          },
        })

      if (transactionError) {
        throw transactionError
      }

      // In production, this would trigger the actual PayPal payout
      // For now, we'll mark it as processing
      await supabaseClient
        .from('withdrawals')
        .update({ status: 'processing' })
        .eq('id', withdrawal.id)

      return new Response(
        JSON.stringify({
          success: true,
          withdrawal: {
            id: withdrawal.id,
            amount: withdrawal.amount,
            fee: withdrawal.fee,
            net_amount: withdrawal.net_amount,
            status: withdrawal.status,
            method: withdrawal.method,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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