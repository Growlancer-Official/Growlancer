// Razorpay Edge Function
// Handles creating, verifying, and managing Razorpay orders
// Razorpay Process: Create order → Frontend opens checkout modal → Verify payment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || '';
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || '';
const RAZORPAY_API_URL = 'https://api.razorpay.com/v1';

const ALLOWED_ORIGINS = [
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60000;
const ROUTE = 'razorpay';

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

function getBasicAuth(): string {
  return `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`;
}

async function razorpayFetch(path: string, options: any = {}) {
  const response = await fetch(`${RAZORPAY_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: getBasicAuth(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Razorpay API error: ${error}`);
  }

  return await response.json();
}

serve(async req => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const identifier = user.id || req.headers.get('x-forwarded-for') || 'unknown';
    if (!(await checkRateLimit(supabaseClient, identifier))) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try { body = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, data } = body;
    if (!action || typeof action !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: any;

    switch (action) {
      // ─── CREATE ORDER ──────────────────────────────
      case 'create_order': {
        const {
          order_type,
          amount,
          currency = 'USD',
          description,
          contract_id,
          subscription_id,
          metadata,
        } = data;

        const validAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(validAmount) || validAmount <= 0 || validAmount > 100000) {
          throw new Error('Invalid amount');
        }

        const validOrderType = typeof order_type === 'string' ? order_type.trim() : '';
        if (!['contract_escrow', 'subscription', 'service_purchase'].includes(validOrderType)) {
          throw new Error('Invalid order_type');
        }

        // Verify ownership if contract_id provided
        if (contract_id) {
          const { data: contract } = await supabaseClient
            .from('contracts').select('client_id').eq('id', contract_id).single();
          if (!contract || contract.client_id !== user.id) {
            throw new Error('Unauthorized: You do not own this contract');
          }
        }

        if (subscription_id) {
          const { data: subscription } = await supabaseClient
            .from('subscriptions').select('user_id').eq('id', subscription_id).single();
          if (!subscription || subscription.user_id !== user.id) {
            throw new Error('Unauthorized: You do not own this subscription');
          }
        }

        // Razorpay expects amount in paise (currency subunits)
        // For INR: 1 INR = 100 paise. For USD: 1 USD = 100 cents
        const amountInSubunits = Math.round(validAmount * 100);

        // Create order on Razorpay
        const razorpayOrder = await razorpayFetch('/orders', {
          method: 'POST',
          body: JSON.stringify({
            amount: amountInSubunits,
            currency: currency,
            receipt: `${validOrderType}_${user.id.slice(0, 8)}_${Date.now()}`,
            notes: {
              user_id: user.id,
              order_type: validOrderType,
              contract_id: contract_id || '',
              subscription_id: subscription_id || '',
              description: description || 'Growlancer Payment',
            },
          }),
        });

        // Store order in database
        const { data: dbOrder, error: dbError } = await supabaseClient
          .from('razorpay_orders')
          .insert({
            user_id: user.id,
            razorpay_order_id: razorpayOrder.id,
            contract_id,
            subscription_id,
            order_type: validOrderType,
            amount: validAmount,
            currency,
            status: 'created',
            description: description || null,
            metadata,
          })
          .select()
          .single();

        if (dbError) throw new Error(`Failed to store order: ${dbError.message}`);

        result = {
          order: dbOrder,
          razorpay_order: razorpayOrder,
          razorpay_key_id: RAZORPAY_KEY_ID,
          amount: validAmount,
          currency,
        };
        break;
      }

      // ─── VERIFY PAYMENT ──────────────────────────────
      case 'verify_payment': {
        const {
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
        } = data;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
          throw new Error('Missing payment verification parameters');
        }

        // Verify signature using Web Crypto API (native in Deno)
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(RAZORPAY_KEY_SECRET),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const sigBytes = await crypto.subtle.sign(
          'HMAC',
          key,
          encoder.encode(`${razorpay_order_id}|${razorpay_payment_id}`)
        );
        const expectedSignature = Array.from(new Uint8Array(sigBytes))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        if (expectedSignature !== razorpay_signature) {
          throw new Error('Invalid payment signature');
        }

        // Get payment details from Razorpay
        const paymentDetails = await razorpayFetch(`/payments/${razorpay_payment_id}`);

        // Update order in database
        const { data: updatedOrder, error: updateError } = await supabaseClient
          .from('razorpay_orders')
          .update({
            status: 'captured',
            razorpay_payment_id,
            captured_at: new Date().toISOString(),
            razorpay_signature,
          })
          .eq('razorpay_order_id', razorpay_order_id)
          .select()
          .single();

        if (updateError) throw new Error(`Failed to update order: ${updateError.message}`);

        // Store transaction
        await supabaseClient.from('razorpay_transactions').insert({
          razorpay_order_id: updatedOrder.id,
          razorpay_payment_id,
          transaction_type: 'capture',
          amount: parseFloat(paymentDetails.amount) / 100,
          currency: paymentDetails.currency || 'INR',
          status: 'captured',
          payer_email: paymentDetails.email,
          payer_contact: paymentDetails.contact,
          method: paymentDetails.method,
          processor_response: paymentDetails,
        });

        // Update contract/subscription
        if (updatedOrder.contract_id) {
          await supabaseClient.rpc('fund_escrow', {
            p_contract_id: updatedOrder.contract_id,
            p_client_id: user.id,
          });
        }

        if (updatedOrder.subscription_id) {
          await supabaseClient
            .from('subscriptions')
            .update({ status: 'active', subscription_start_date: new Date().toISOString() })
            .eq('id', updatedOrder.subscription_id);
        }

        result = { order: updatedOrder, payment: paymentDetails };
        break;
      }

      // ─── GET ORDER ──────────────────────────────
      case 'get_order': {
        const { razorpay_order_id } = data;
        if (!razorpay_order_id) throw new Error('Missing razorpay_order_id');

        const { data: dbOrder } = await supabaseClient
          .from('razorpay_orders')
          .select('*')
          .eq('razorpay_order_id', razorpay_order_id)
          .single();

        if (!dbOrder || dbOrder.user_id !== user.id) {
          throw new Error('Unauthorized to view this order');
        }

        const razorpayOrder = await razorpayFetch(`/orders/${razorpay_order_id}`);
        result = { razorpay_order: razorpayOrder, database_order: dbOrder };
        break;
      }

      // ─── REFUND ──────────────────────────────
      case 'refund_payment': {
        const { razorpay_payment_id, amount: refundAmount } = data;
        if (!razorpay_payment_id) throw new Error('Missing razorpay_payment_id');

        const refundBody: any = { payment_id: razorpay_payment_id };
        if (refundAmount) {
          refundBody.amount = Math.round(parseFloat(refundAmount) * 100);
        }

        const refundResult = await razorpayFetch('/refunds', {
          method: 'POST',
          body: JSON.stringify(refundBody),
        });

        await supabaseClient.from('razorpay_transactions').insert({
          razorpay_payment_id,
          razorpay_transaction_id: refundResult.id,
          transaction_type: 'refund',
          amount: parseFloat(refundResult.amount) / 100,
          currency: refundResult.currency || 'INR',
          status: refundResult.status,
          processor_response: refundResult,
        });

        result = { refund: refundResult };
        break;
      }

      // ─── SAVE CARD TOKEN ──────────────────────────────
      case 'save_card': {
        const {
          razorpay_payment_id,
          card_id,
          card_type,
          card_network,
          card_last_four,
          card_expiry_month,
          card_expiry_year,
          card_holder_name,
        } = data;

        if (!razorpay_payment_id || !card_id || !card_last_four) {
          throw new Error('Missing required card fields');
        }

        // Upsert saved card (avoid duplicates per card_id)
        const { data: existing } = await supabaseClient
          .from('saved_payment_cards')
          .select('id, used_count')
          .eq('user_id', user.id)
          .eq('card_id', card_id)
          .maybeSingle();

        if (existing) {
          // Card already saved — update usage count
          await supabaseClient
            .from('saved_payment_cards')
            .update({
              used_count: (existing as any).used_count + 1,
              last_used_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          result = { saved: existing, already_existed: true };
        } else {
          const { data: savedCard, error: insertErr } = await supabaseClient
            .from('saved_payment_cards')
            .insert({
              user_id: user.id,
              card_id,
              card_type: card_type || null,
              card_network: card_network || null,
              card_last_four,
              card_expiry_month: card_expiry_month || null,
              card_expiry_year: card_expiry_year || null,
              card_holder_name: card_holder_name || null,
              used_count: 1,
              last_used_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (insertErr) throw new Error(`Failed to save card: ${insertErr.message}`);
          result = { saved: savedCard, already_existed: false };
        }
        break;
      }

      // ─── GET SAVED CARDS ──────────────────────────────
      case 'get_saved_cards': {
        const { data: cards, error: cardsErr } = await supabaseClient
          .from('saved_payment_cards')
          .select('*')
          .eq('user_id', user.id)
          .order('last_used_at', { ascending: false, nullsLast: true });

        if (cardsErr) throw new Error(`Failed to fetch saved cards: ${cardsErr.message}`);
        result = { cards: cards || [] };
        break;
      }

      // ─── DELETE SAVED CARD ──────────────────────────────
      case 'delete_saved_card': {
        const { card_id } = data;
        if (!card_id) throw new Error('Missing card_id');

        const { error: delErr } = await supabaseClient
          .from('saved_payment_cards')
          .delete()
          .eq('user_id', user.id)
          .eq('card_id', card_id);

        if (delErr) throw new Error(`Failed to delete card: ${delErr.message}`);
        result = { deleted: true };
        break;
      }

      // ─── CREATE PAYOUT (for withdrawals) ──────────────
      case 'create_payout': {
        const { amount, fund_account_id, purpose = 'payout', description } = data;
        if (!amount || !fund_account_id) throw new Error('Missing payout parameters');

        const payoutResult = await razorpayFetch('/payouts', {
          method: 'POST',
          body: JSON.stringify({
            account_number: Deno.env.get('RAZORPAY_ACCOUNT_NUMBER') || '',
            fund_account_id,
            amount: Math.round(parseFloat(amount) * 100),
            currency: 'INR',
            mode: 'NEFT',
            purpose: purpose,
            queue_if_low_balance: true,
            description: description || 'Growlancer Withdrawal',
          }),
        });

        result = { payout: payoutResult };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Razorpay function error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
