// Cashfree Edge Function (India — primary payment gateway)
// Handles creating, verifying, refunding and managing Cashfree orders.
// Flow: Create order (server-side amount) → Frontend opens Cashfree drop-in
// checkout (payment_session_id) → Webhook + server-side verify reconcile order.
//
// Environment:
//   CASHFREE_APP_ID / CASHFREE_SECRET_KEY   (PG credentials from Cashfree Dashboard)
//   CASHFREE_ENVIRONMENT                    ('TEST' | 'PROD')
//   CASHFREE_PAYOUT_CLIENT_ID / CASHFREE_PAYOUT_CLIENT_SECRET  (Payouts product — optional, falls back to PG creds)
//   CASHFREE_WEBHOOK_SECRET                 (webhook verification secret — used by cashfree-webhook)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CASHFREE_APP_ID = Deno.env.get('CASHFREE_APP_ID') || '';
const CASHFREE_SECRET_KEY = Deno.env.get('CASHFREE_SECRET_KEY') || '';
const CASHFREE_ENVIRONMENT = (Deno.env.get('CASHFREE_ENVIRONMENT') || 'TEST').toUpperCase();
const CASHFREE_API_URL = CASHFREE_ENVIRONMENT === 'PROD'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';
const CASHFREE_API_VERSION = '2023-08-01';
// Payouts product credentials (used by create_beneficiary). Falls back to the
// PG credentials so a single merchant account works out of the box.
const CASHFREE_PAYOUT_CLIENT_ID = Deno.env.get('CASHFREE_PAYOUT_CLIENT_ID') || CASHFREE_APP_ID;
const CASHFREE_PAYOUT_CLIENT_SECRET = Deno.env.get('CASHFREE_PAYOUT_CLIENT_SECRET') || CASHFREE_SECRET_KEY;
const CASHFREE_PAYOUT_API_URL = CASHFREE_ENVIRONMENT === 'PROD'
  ? 'https://api.cashfree.com/payout/v2'
  : 'https://sandbox.cashfree.com/payout/v2';
const APP_URL = Deno.env.get('APP_URL') || 'https://growlancer.vercel.app';
// Shared secret for cron-triggered internal actions (execute_refund).
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
  console.error('CASHFREE_APP_ID / CASHFREE_SECRET_KEY are not configured in environment variables');
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60000;
const ROUTE = 'cashfree';

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

function getPgHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-client-id': CASHFREE_APP_ID,
    'x-client-secret': CASHFREE_SECRET_KEY,
    'x-api-version': CASHFREE_API_VERSION,
    ...extra,
  };
}

function getPayoutHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-client-id': CASHFREE_PAYOUT_CLIENT_ID,
    'x-client-secret': CASHFREE_PAYOUT_CLIENT_SECRET,
    'x-api-version': '2024-01-01',
    ...extra,
  };
}

async function cashfreeFetch(path: string, options: any = {}) {
  const response = await fetch(`${CASHFREE_API_URL}${path}`, {
    ...options,
    headers: getPgHeaders(options.headers || {}),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cashfree API error (${response.status}): ${error}`);
  }

  return await response.json();
}

/** Best-effort notification insert (service role bypasses RLS). */
async function notify(
  supabaseAdmin: any,
  userId: string | null | undefined,
  type: string,
  title: string,
  message: string,
  actionUrl?: string,
  metadata: Record<string, unknown> = {}
) {
  if (!userId) return;
  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      action_url: actionUrl || null,
      metadata,
    });
  } catch (e) {
    console.error('notification insert failed:', e);
  }
}

/** Best-effort financial audit trail insert. */
async function insertAuditLog(supabaseAdmin: any, fields: Record<string, unknown>) {
  try {
    await supabaseAdmin.rpc('insert_payment_audit_log', {
      p_action: fields.action,
      p_entity_type: fields.entity_type || null,
      p_entity_id: fields.entity_id || null,
      p_provider: 'cashfree',
      p_amount: fields.amount ?? null,
      p_currency: fields.currency || 'INR',
      p_metadata: fields.metadata || {},
      p_ip_address: fields.ip_address || null,
      p_user_id: fields.user_id || null,
    });
  } catch (e) {
    console.error('audit log failed:', e);
  }
}

/** Cashfree requires a unique merchant order_id — generate one server-side. */
function generateOrderId(orderType: string, userId: string): string {
  return `gl_${orderType.replace(/_/g, '')}_${userId.slice(0, 8)}_${Date.now()}`;
}

function generateRefundId(refundRequestId: string): string {
  return `gl_ref_${refundRequestId.slice(0, 16)}_${Date.now()}`;
}

serve(async req => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Fail closed: refuse requests when payment credentials are not configured
  if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'Payment service is not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Internal service-role client for cross-user notifications + audit logs
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

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

    const { data: { user } } = await supabaseClient.auth.getUser();

    // Cron-triggered internal actions: authenticated by CRON_SECRET, not a user JWT.
    let isCron = false;
    if (action === 'execute_refund') {
      const authHeader = req.headers.get('Authorization') || '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!CRON_SECRET || bearer !== CRON_SECRET) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      isCron = true;
    } else if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isCron) {
      const identifier = user.id || req.headers.get('x-forwarded-for') || 'unknown';
      if (!(await checkRateLimit(supabaseClient, identifier))) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    let result: any;

    switch (action) {
      // ─── CREATE ORDER ──────────────────────────────
      case 'create_order': {
        const {
          order_type,
          currency = 'INR',
          description,
          contract_id,
          subscription_id,
          metadata,
        } = data;

        const validOrderType = typeof order_type === 'string' ? order_type.trim() : '';
        if (!['contract_escrow', 'subscription', 'service_purchase'].includes(validOrderType)) {
          throw new Error('Invalid order_type');
        }

        // ─── AUTHORITATIVE AMOUNT (server-side recompute) ───
        // NEVER trust a client-submitted amount — recompute from the DB record.
        let serverAmount = 0;

        if (validOrderType === 'contract_escrow') {
          if (!contract_id) throw new Error('contract_id is required for contract_escrow');
          const { data: contract } = await supabaseClient
            .from('contracts').select('client_id, amount, platform_fee, milestones').eq('id', contract_id).single();
          if (!contract || contract.client_id !== user.id) {
            throw new Error('Unauthorized: You do not own this contract');
          }
          let fundingAmount = Number(contract.amount) || 0;
          const milestoneIndices = Array.isArray(metadata?.milestone_indices)
            ? metadata.milestone_indices.map((i: unknown) => Number(i))
            : [];
          if (milestoneIndices.length > 0) {
            const milestones = Array.isArray(contract?.milestones) ? contract.milestones : [];
            const sum = milestoneIndices.reduce((acc: number, idx: number) => {
              const amt = Number(milestones[idx]?.amount) || 0;
              return acc + amt;
            }, 0);
            if (sum > 0) fundingAmount = sum;
          }
          const fee = milestoneIndices.length === 0 && Number(contract.platform_fee) > 0
            ? Number(contract.platform_fee)
            : Math.round(fundingAmount * 0.05 * 100) / 100;
          serverAmount = Math.round((fundingAmount + fee) * 100) / 100;
        } else if (validOrderType === 'subscription') {
          if (!subscription_id) throw new Error('subscription_id is required for subscription');
          const { data: subscription } = await supabaseClient
            .from('subscriptions').select('user_id, plan_id').eq('id', subscription_id).single();
          if (!subscription || subscription.user_id !== user.id) {
            throw new Error('Unauthorized: You do not own this subscription');
          }
          const { data: plan } = await supabaseClient
            .from('subscription_plans').select('price').eq('id', subscription.plan_id).single();
          serverAmount = Number(plan?.price) || 0;
        } else if (validOrderType === 'service_purchase') {
          const serviceId = metadata?.service_id || data.service_id;
          if (!serviceId) throw new Error('service_id is required for service_purchase');
          const { data: service } = await supabaseClient
            .from('services').select('price, active, freelancer_id').eq('id', serviceId).single();
          if (!service || service.active === false) {
            throw new Error('Service not found or inactive');
          }
          serverAmount = Number(service.price) || 0;
        }

        if (isNaN(serverAmount) || serverAmount <= 0 || serverAmount > 100000) {
          throw new Error('Invalid amount');
        }

        const orderId = generateOrderId(validOrderType, user.id);

        // Return URL — the SPA page the Cashfree hosted checkout returns to.
        // Supplied by the client via metadata so the drop-in returns to the
        // exact page (escrow, subscription, service) the user was on.
        const returnUrl = typeof metadata?.return_url === 'string' && metadata.return_url.startsWith('http')
          ? metadata.return_url
          : APP_URL;

        // Create order on Cashfree (amount in major units — INR rupees)
        const cashfreeOrder = await cashfreeFetch('/orders', {
          method: 'POST',
          body: JSON.stringify({
            order_id: orderId,
            order_amount: serverAmount,
            order_currency: currency,
            order_note: description || 'Growlancer Payment',
            customer_details: {
              customer_id: user.id,
              customer_name: user.user_metadata?.name || user.email || 'Growlancer User',
              customer_email: user.email || '',
              customer_phone: user.user_metadata?.phone || user.phone || '',
            },
            order_meta: {
              return_url: returnUrl,
            },
          }),
        });

        if (!cashfreeOrder.payment_session_id) {
          throw new Error('Cashfree did not return a payment session');
        }

        // Store order in database
        const { data: dbOrder, error: dbError } = await supabaseClient
          .from('cashfree_orders')
          .insert({
            user_id: user.id,
            cashfree_order_id: orderId,
            payment_session_id: cashfreeOrder.payment_session_id,
            cf_order_id: String(cashfreeOrder.cf_order_id ?? ''),
            contract_id,
            subscription_id,
            order_type: validOrderType,
            amount: serverAmount,
            currency,
            status: 'created',
            description: description || null,
            metadata,
          })
          .select()
          .single();

        if (dbError) throw new Error(`Failed to store order: ${dbError.message}`);

        await insertAuditLog(supabaseAdmin, {
          action: 'order_created',
          entity_type: 'cashfree_order',
          entity_id: dbOrder.id,
          user_id: user.id,
          amount: serverAmount,
          currency,
          metadata: { order_type: validOrderType, contract_id: contract_id || null, subscription_id: subscription_id || null },
          ip_address: req.headers.get('x-forwarded-for') || null,
        });

        result = {
          order: dbOrder,
          cashfree_order: cashfreeOrder,
          payment_session_id: cashfreeOrder.payment_session_id,
          amount: serverAmount,
          currency,
        };
        break;
      }

      // ─── VERIFY PAYMENT ──────────────────────────────
      // Cashfree does not use client-side signature verification — the order
      // status is fetched SERVER-SIDE from Cashfree (amount + status checked),
      // and the webhook is the authoritative reconciliation source.
      case 'verify_payment': {
        const { cashfree_order_id } = data;
        if (!cashfree_order_id) throw new Error('Missing cashfree_order_id');

        // The order must belong to the authenticated user
        const { data: dbOrder } = await supabaseClient
          .from('cashfree_orders')
          .select('*')
          .eq('cashfree_order_id', cashfree_order_id)
          .maybeSingle();
        if (!dbOrder || dbOrder.user_id !== user.id) {
          throw new Error('Unauthorized to verify this order');
        }

        // Idempotency guard — never process the same order twice
        if (dbOrder.status === 'captured') {
          result = { order: dbOrder, already_processed: true };
          break;
        }

        // Fetch authoritative order status + payment from Cashfree
        const orderStatus = await cashfreeFetch(`/orders/${cashfree_order_id}`);

        // Server-side amount check: the paid amount must match the order amount
        const paidAmount = Number(orderStatus.payment?.payment_amount ?? orderStatus.order_amount ?? 0);
        const orderAmount = Number(dbOrder.amount) || 0;
        if (paidAmount < orderAmount - 0.01) {
          throw new Error('Payment amount does not match order amount');
        }

        const isPaid = orderStatus.order_status === 'PAID'
          || orderStatus.payment?.payment_status === 'SUCCESS';

        if (!isPaid) {
          // Mark failed if Cashfree reports a terminal failure
          if (orderStatus.order_status === 'EXPIRED' || orderStatus.payment?.payment_status === 'FAILED') {
            await supabaseClient
              .from('cashfree_orders')
              .update({ status: 'failed' })
              .eq('id', dbOrder.id);
          }
          throw new Error(orderStatus.payment?.payment_message || 'Payment is not completed');
        }

        const payment = orderStatus.payment || {};
        const paymentId = String(payment.cf_payment_id || '');

        const { data: updatedOrder, error: updateError } = await supabaseClient
          .from('cashfree_orders')
          .update({
            status: 'captured',
            payment_id: paymentId,
            captured_at: new Date().toISOString(),
          })
          .eq('id', dbOrder.id)
          .select()
          .single();

        if (updateError) throw new Error(`Failed to update order: ${updateError.message}`);

        // Store transaction (idempotent — unique cashfree_payment_id + type)
        const { data: dupTxn } = await supabaseClient
          .from('cashfree_transactions')
          .select('id')
          .eq('cashfree_payment_id', paymentId)
          .eq('transaction_type', 'capture')
          .maybeSingle();

        if (!dupTxn) {
          await supabaseClient.from('cashfree_transactions').insert({
            cashfree_order_id: updatedOrder.id,
            cashfree_payment_id: paymentId,
            transaction_type: 'capture',
            amount: orderAmount,
            currency: orderStatus.order_currency || 'INR',
            status: 'captured',
            method: payment.payment_group || null,
            payer_email: orderStatus.customer_details?.customer_email || null,
            payer_contact: orderStatus.customer_details?.customer_phone || null,
            processor_response: orderStatus,
          });
        }

        // Fund escrow / activate subscription
        if (updatedOrder.contract_id) {
          const { error: fundErr } = await supabaseClient.rpc('fund_escrow', {
            p_contract_id: updatedOrder.contract_id,
            p_client_id: user.id,
          });
          if (fundErr) throw new Error(`Failed to fund escrow: ${fundErr.message}`);

          const { data: contract } = await supabaseAdmin
            .from('contracts')
            .select('client_id, freelancer_id')
            .eq('id', updatedOrder.contract_id)
            .maybeSingle();
          if (contract) {
            await notify(
              supabaseAdmin, contract.client_id, 'payment',
              'Escrow funded',
              `Your escrow payment of ₹${Number(updatedOrder.amount).toFixed(2)} was received and the contract is now active.`,
              '/dashboard/contracts',
              { contract_id: updatedOrder.contract_id }
            );
            await notify(
              supabaseAdmin, contract.freelancer_id, 'contract',
              'Contract funded — work can begin',
              'The client has funded the escrow. You can now start working on the contract.',
              '/dashboard/contracts',
              { contract_id: updatedOrder.contract_id }
            );
          }
        }

        if (updatedOrder.subscription_id) {
          await supabaseClient
            .from('subscriptions')
            .update({ status: 'active', subscription_start_date: new Date().toISOString() })
            .eq('id', updatedOrder.subscription_id);
        }

        await insertAuditLog(supabaseAdmin, {
          action: 'payment_captured',
          entity_type: 'cashfree_order',
          entity_id: updatedOrder.id,
          user_id: user.id,
          amount: Number(updatedOrder.amount),
          currency: updatedOrder.currency,
          metadata: { order_type: updatedOrder.order_type, contract_id: updatedOrder.contract_id, source: 'client_verify' },
          ip_address: req.headers.get('x-forwarded-for') || null,
        });

        result = { order: updatedOrder, payment: orderStatus.payment || {} };
        break;
      }

      // ─── GET ORDER ──────────────────────────────
      case 'get_order': {
        const { cashfree_order_id } = data;
        if (!cashfree_order_id) throw new Error('Missing cashfree_order_id');

        const { data: dbOrder } = await supabaseClient
          .from('cashfree_orders')
          .select('*')
          .eq('cashfree_order_id', cashfree_order_id)
          .maybeSingle();

        if (!dbOrder || dbOrder.user_id !== user.id) {
          throw new Error('Unauthorized to view this order');
        }

        const cashfreeOrder = await cashfreeFetch(`/orders/${cashfree_order_id}`);
        result = { cashfree_order: cashfreeOrder, database_order: dbOrder };
        break;
      }

      // ─── REFUND ──────────────────────────────
      case 'refund_payment': {
        const { cashfree_order_id, amount: refundAmount } = data;
        if (!cashfree_order_id) throw new Error('Missing cashfree_order_id');

        const { data: orderRec } = await supabaseClient
          .from('cashfree_orders')
          .select('user_id, status')
          .eq('cashfree_order_id', cashfree_order_id)
          .maybeSingle();

        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('role, is_admin')
          .eq('id', user.id)
          .maybeSingle();
        const isAdmin = profile?.role === 'admin' || profile?.is_admin === true;

        if (!orderRec || (orderRec.user_id !== user.id && !isAdmin)) {
          throw new Error('Unauthorized to refund this payment');
        }

        if (orderRec.status !== 'captured') {
          throw new Error('Only captured payments can be refunded');
        }

        const refundBody: any = {
          refund_amount: refundAmount ? Number(refundAmount) : undefined,
          refund_id: generateRefundId(cashfree_order_id),
          refund_note: 'Refund requested via Growlancer',
        };
        if (refundBody.refund_amount === undefined) {
          delete refundBody.refund_amount; // full refund
        }

        const refundResult = await cashfreeFetch(`/orders/${cashfree_order_id}/refunds`, {
          method: 'POST',
          body: JSON.stringify(refundBody),
        });

        const refund = refundResult.refund || refundResult;

        await supabaseClient.from('cashfree_transactions').insert({
          cashfree_order_id: orderRec.id,
          cashfree_payment_id: null,
          cashfree_refund_id: refund.cf_refund_id ? String(refund.cf_refund_id) : null,
          transaction_type: 'refund',
          amount: Number(refund.refund_amount) || 0,
          currency: refund.refund_currency || 'INR',
          status: String(refund.refund_status || 'pending').toLowerCase(),
          processor_response: refund,
        });

        await insertAuditLog(supabaseAdmin, {
          action: 'refund_issued',
          entity_type: 'cashfree_order',
          entity_id: orderRec.id,
          user_id: orderRec.user_id,
          amount: Number(refund.refund_amount) || 0,
          currency: refund.refund_currency || 'INR',
          metadata: { refund_id: refund.refund_id || null, actor: isAdmin ? 'admin' : 'client' },
          ip_address: req.headers.get('x-forwarded-for') || null,
        });
        await notify(
          supabaseAdmin, orderRec.user_id, 'payment',
          'Refund processed',
          `Your refund of ₹${Number(refund.refund_amount || 0).toFixed(2)} has been processed.`,
          '/client/payments',
          { refund_id: refund.refund_id || null }
        );

        result = { refund };
        break;
      }

      // ─── CREATE BENEFICIARY (Cashfree Payouts) ────────────
      // Creates (or reuses) a Cashfree Payouts beneficiary for a user's payout
      // method and stores the returned beneficiary_id on the row. The
      // withdrawal function then transfers to that beneficiary_id.
      case 'create_beneficiary': {
        const { payout_method_id } = data || {};
        if (!payout_method_id) throw new Error('Missing payout_method_id');

        const { data: method, error: methodErr } = await supabaseClient
          .from('payout_methods')
          .select('*')
          .eq('id', payout_method_id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (methodErr || !method) throw new Error('Payout method not found');

        // Already linked → return it (idempotent).
        if (method.cashfree_beneficiary_id) {
          result = { beneficiary_id: method.cashfree_beneficiary_id, payout_method_id, already_existed: true };
          break;
        }

        const isBank = method.type === 'bank' || method.type === 'bank_transfer';
        if (!isBank && !method.upi_id) {
          throw new Error('Payout method has no bank or UPI details');
        }

        const beneficiaryId = `bene_${user.id.slice(0, 16)}_${payout_method_id.slice(0, 8)}`;
        const payload: Record<string, unknown> = {
          beneficiary: {
            beneficiary_id: beneficiaryId,
            beneficiary_name: method.account_holder_name || user.user_metadata?.name || 'Growlancer User',
            beneficiary_instrument_details: isBank
              ? { bank_account: { account_number: method.account_number || '', ifsc: method.ifsc_code || '' } }
              : { vpa: method.upi_id },
            beneficiary_contact_details: {
              beneficiary_phone: method.phone || user.user_metadata?.phone || user.phone || '9999999999',
              beneficiary_email: method.email || user.email || '',
            },
          },
          beneficiary_otp_verification: false,
        };

        let beneficiaryRes: any;
        try {
          const response = await fetch(`${CASHFREE_PAYOUT_API_URL}/beneficiary`, {
            method: 'POST',
            headers: getPayoutHeaders(),
            body: JSON.stringify(payload),
          });
          const text = await response.text();
          if (!response.ok) {
            throw new Error(`Cashfree Payouts API error (${response.status}): ${text}`);
          }
          beneficiaryRes = JSON.parse(text);
        } catch (beneErr) {
          // Idempotency: if the beneficiary already exists, Cashfree returns 409
          // with the same beneficiary_id — treat that as success.
          if (beneErr instanceof Error && String(beneErr.message).includes('409')) {
            beneficiaryRes = { beneficiary: { beneficiary_id: beneficiaryId } };
          } else {
            throw beneErr;
          }
        }

        const savedBeneficiaryId = beneficiaryRes?.beneficiary?.beneficiary_id || beneficiaryId;

        await supabaseClient
          .from('payout_methods')
          .update({ cashfree_beneficiary_id: savedBeneficiaryId, updated_at: new Date().toISOString() })
          .eq('id', payout_method_id)
          .eq('user_id', user.id);

        await insertAuditLog(supabaseAdmin, {
          action: 'beneficiary_created',
          entity_type: 'payout_method',
          entity_id: payout_method_id,
          amount: null,
          metadata: { cashfree_beneficiary_id: savedBeneficiaryId, type: method.type },
          user_id: user.id,
        });

        result = { beneficiary_id: savedBeneficiaryId, payout_method_id, already_existed: false };
        break;
      }

      case 'create_payout': {
        return new Response(JSON.stringify({ error: 'Action disabled. Use the withdrawal function instead.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ─── EXECUTE REFUND (cron / internal) ───────────
      // Called by pg_cron → pg_net with CRON_SECRET. Processes a refund_request
      // that was auto-approved: creates the Cashfree refund, reverses escrow,
      // closes the contract, records refund + timeline + notifications + audit.
      case 'execute_refund': {
        const refundRequestId: string = data?.refund_request_id;
        if (!refundRequestId) throw new Error('Missing refund_request_id');

        const { data: refundRequest, error: reqErr } = await supabaseAdmin
          .from('refund_requests')
          .select('*')
          .eq('id', refundRequestId)
          .maybeSingle();
        if (reqErr || !refundRequest) throw new Error('Refund request not found');

        if (!['auto_approved', 'approved'].includes(refundRequest.status)) {
          result = { refund_request_id: refundRequestId, skipped: true, reason: refundRequest.status };
          break;
        }

        const { data: existingRefund } = await supabaseAdmin
          .from('refunds')
          .select('id, provider_refund_id, status')
          .eq('refund_request_id', refundRequestId)
          .neq('status', 'failed')
          .maybeSingle();
        if (existingRefund) {
          result = { refund_request_id: refundRequestId, skipped: true, reason: 'already_refunded' };
          break;
        }

        // Find the captured Cashfree order for this contract
        const { data: order } = await supabaseAdmin
          .from('cashfree_orders')
          .select('*')
          .eq('contract_id', refundRequest.contract_id)
          .eq('order_type', 'contract_escrow')
          .eq('status', 'captured')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!order) {
          await supabaseAdmin.rpc('admin_reverse_escrow', { p_contract_id: refundRequest.contract_id });
          await supabaseAdmin.from('refund_requests').update({ status: 'completed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', refundRequestId);
          await insertAuditLog(supabaseAdmin, { action: 'refund_escrow_only', entity_type: 'refund_request', entity_id: refundRequestId, user_id: refundRequest.requested_by, amount: refundRequest.refund_amount, currency: 'INR', metadata: { contract_id: refundRequest.contract_id, note: 'no captured cashfree payment' } });
          result = { refund_request_id: refundRequestId, refunded: true, escrow_reversed: true, note: 'no_captured_payment' };
          break;
        }

        const refundId = generateRefundId(refundRequestId);
        let refundRes: any;
        try {
          const response = await fetch(`${CASHFREE_API_URL}/orders/${order.cashfree_order_id}/refunds`, {
            method: 'POST',
            headers: getPgHeaders(),
            body: JSON.stringify({
              refund_amount: Number(refundRequest.refund_amount),
              refund_id: refundId,
              refund_note: `Refund request ${refundRequestId}`,
            }),
          });
          const text = await response.text();
          if (!response.ok) {
            throw new Error(`Cashfree refund API error (${response.status}): ${text}`);
          }
          refundRes = JSON.parse(text).refund || JSON.parse(text);
        } catch (refundErr) {
          const errMsg = refundErr instanceof Error ? refundErr.message : String(refundErr);
          const { data: failedRefund } = await supabaseAdmin
            .from('refunds')
            .select('id, retry_count')
            .eq('refund_request_id', refundRequestId)
            .eq('status', 'failed')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (failedRefund) {
            await supabaseAdmin.from('refunds').update({
              retry_count: (failedRefund.retry_count || 0) + 1,
              last_error: errMsg.slice(0, 500),
              status: 'failed',
              updated_at: new Date().toISOString(),
            }).eq('id', failedRefund.id);
          } else {
            await supabaseAdmin.from('refunds').insert({
              refund_request_id: refundRequestId,
              contract_id: refundRequest.contract_id,
              provider: 'cashfree',
              provider_payment_id: order.payment_id,
              amount: refundRequest.refund_amount,
              currency: 'INR',
              status: 'failed',
              retry_count: 1,
              last_error: errMsg.slice(0, 500),
              timeline: [{ event: 'failed', at: new Date().toISOString(), error: errMsg.slice(0, 200) }],
            });
          }

          await notify(
            supabaseAdmin, refundRequest.requested_by, 'refund',
            'Refund could not be completed — will retry automatically',
            'Your refund is pending. Our system retries automatically; you will be notified when it completes.',
            '/client/payments',
            { refund_request_id: refundRequestId, contract_id: refundRequest.contract_id }
          );
          await insertAuditLog(supabaseAdmin, {
            action: 'refund_failed',
            entity_type: 'refund_request',
            entity_id: refundRequestId,
            user_id: refundRequest.requested_by,
            amount: refundRequest.refund_amount,
            currency: 'INR',
            metadata: { contract_id: refundRequest.contract_id, error: errMsg.slice(0, 200) },
          });

          result = { refund_request_id: refundRequestId, status: 'failed', retry_scheduled: true };
          break;
        }

        const cashfreeRefundId: string = refundRes.refund_id || refundId;
        const refundStatus: string = String(refundRes.refund_status || 'PROCESSING');

        await supabaseAdmin.from('refunds').insert({
          refund_request_id: refundRequestId,
          contract_id: refundRequest.contract_id,
          provider: 'cashfree',
          provider_refund_id: cashfreeRefundId,
          provider_payment_id: order.payment_id,
          amount: refundRequest.refund_amount,
          currency: 'INR',
          status: refundStatus === 'SUCCESS' ? 'completed' : 'processing',
          timeline: [{ event: 'created', at: new Date().toISOString(), cashfree_refund_id: cashfreeRefundId }],
        });

        await supabaseAdmin.from('refund_requests').update({
          provider_refund_id: cashfreeRefundId,
          updated_at: new Date().toISOString(),
        }).eq('id', refundRequestId);

        await insertAuditLog(supabaseAdmin, {
          action: 'refund_initiated',
          entity_type: 'refund_request',
          entity_id: refundRequestId,
          p_amount: refundRequest.refund_amount,
          amount: refundRequest.refund_amount,
          currency: 'INR',
          metadata: { cashfree_refund_id: cashfreeRefundId, contract_id: refundRequest.contract_id },
          user_id: refundRequest.requested_by,
        });

        await notify(
          supabaseAdmin, refundRequest.requested_by, 'refund',
          'Refund in progress',
          `Your refund of ₹${Number(refundRequest.refund_amount).toFixed(2)} is being processed.`,
          '/client/payments',
          { refund_request_id: refundRequestId, contract_id: refundRequest.contract_id }
        );

        result = { refund_request_id: refundRequestId, cashfree_refund_id: cashfreeRefundId, status: 'processing' };
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
    console.error('Cashfree function error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
