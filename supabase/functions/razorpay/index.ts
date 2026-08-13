// Razorpay Edge Function
// Handles creating, verifying, and managing Razorpay orders
// Razorpay Process: Create order → Frontend opens checkout modal → Verify payment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || '';
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || '';
const RAZORPAY_API_URL = 'https://api.razorpay.com/v1';
// Shared secret for cron-triggered internal actions (execute_refund).
// pg_cron calls this function via pg_net with `Authorization: Bearer <CRON_SECRET>`.
// The DB cron_settings.cron_secret row is accepted as a fallback so a secret
// rotation that updates only one side can never silently break refunds again
// (both sides are checked; either match authorizes the call).
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

async function isValidCronSecret(bearer: string, admin: ReturnType<typeof createClient>): Promise<boolean> {
  if (CRON_SECRET && bearer === CRON_SECRET) return true;
  try {
    const { data } = await admin
      .from('cron_settings')
      .select('value')
      .eq('key', 'cron_secret')
      .maybeSingle();
    const dbSecret = data?.value as string | undefined;
    return !!dbSecret && bearer === dbSecret;
  } catch {
    return false;
  }
}

// Fail loudly if payment credentials are missing — never silently continue
if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured in environment variables');
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
      p_provider: 'razorpay',
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

serve(async req => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Fail closed: refuse requests when payment credentials are not configured
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
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
    // These are never callable from the browser (the secret is server-side only).
    let isCron = false;
    if (action === 'test_auth') {
      // Diagnostics only: reports whether the configured Razorpay credentials
      // authenticate. Response is stripped to a minimal status — the raw
      // Razorpay payload is NEVER echoed (prevents leaking order metadata to
      // callers). Rate-limited like every other user action.
      const identifier = user?.id || req.headers.get('x-forwarded-for') || 'unknown';
      if (!(await checkRateLimit(supabaseClient, identifier))) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const testResult = await (async () => {
        try {
          await razorpayFetch('/orders?count=1');
          return {
            ok: true,
            key_id_prefix: (RAZORPAY_KEY_ID || '').slice(0, 8),
            key_id_mode: (RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'live' : (RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'test' : 'unknown',
          };
        } catch (e) {
          return {
            ok: false,
            key_id_prefix: (RAZORPAY_KEY_ID || '').slice(0, 8),
            key_id_mode: (RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'live' : (RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'test' : 'unknown',
            error: e instanceof Error ? e.message : 'Unknown error',
          };
        }
      })();
      return new Response(JSON.stringify({ success: true, data: testResult }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (action === 'execute_refund') {
      const authHeader = req.headers.get('Authorization') || '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!bearer || !(await isValidCronSecret(bearer, supabaseAdmin))) {
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

    // Rate limit user actions only (cron calls are low-volume + secret-guarded)
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
          // India-first: Razorpay is an INR gateway, so an omitted currency must
          // never silently create a USD order priced with INR math.
          currency = 'INR',
          description,
          contract_id,
          subscription_id,
          metadata,
        } = data;

        const validOrderType = typeof order_type === 'string' ? order_type.trim() : '';
        if (!['contract_escrow', 'subscription', 'service_purchase', 'card_verification', 'wallet_topup', 'revision_payment'].includes(validOrderType)) {
          throw new Error('Invalid order_type');
        }

        // ─── AUTHORITATIVE AMOUNT (server-side recompute) ───
        // NEVER trust a client-submitted amount: the amount is recomputed
        // from the DB record so an attacker cannot modify the contract/service
        // price in the request body.
        let serverAmount = 0;

        if (validOrderType === 'contract_escrow') {
          if (!contract_id) throw new Error('contract_id is required for contract_escrow');
          const { data: contract } = await supabaseClient
            .from('contracts').select('client_id, amount, platform_fee, milestones').eq('id', contract_id).single();
          if (!contract || contract.client_id !== user.id) {
            throw new Error('Unauthorized: You do not own this contract');
          }
          // AUTHORITATIVE AMOUNT = funding amount + 5% platform fee (parity with
          // the PayPal path). The client may only pick WHICH milestones to fund;
          // their amounts are read from the DB, never from the request body.
          let fundingAmount = Number(contract.amount) || 0;
          const milestoneIndices = Array.isArray(metadata?.milestone_indices)
            ? metadata.milestone_indices.map((i: unknown) => Number(i))
            : [];
          if (milestoneIndices.length > 0) {
            // ⚠️ FIX (2026-08-03): milestones live on contracts.milestones (JSONB),
            // NOT escrow — escrow has no `milestones` column, so the old query
            // returned nothing → sum was 0 → the client was silently charged the
            // FULL contract amount when funding selected milestones. Amounts are
            // still read server-side (never from the request body).
            const milestones = Array.isArray(contract?.milestones) ? contract.milestones : [];
            const sum = milestoneIndices.reduce((acc: number, idx: number) => {
              const amt = Number(milestones[idx]?.amount) || 0;
              return acc + amt;
            }, 0);
            if (sum > 0) fundingAmount = sum;
          }
          // Server-side fee: use the stored contract fee for full funding, else
          // compute 5% (matches PLATFORM_CONFIG.fees.platform_percentage).
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
          // Look up the plan's price from the server (never trust client amount)
          const { data: plan } = await supabaseClient
            .from('subscription_plans').select('price').eq('id', subscription.plan_id).single();
          serverAmount = Number(plan?.price) || 0;
        } else if (validOrderType === 'service_purchase') {
          const serviceId = metadata?.service_id || data.service_id;
          if (!serviceId) throw new Error('service_id is required for service_purchase');
          const { data: service } = await supabaseClient
            .from('services').select('price, active, freelancer_id, accepts_tips, negotiable').eq('id', serviceId).single();
          if (!service || service.active === false) {
            throw new Error('Service not found or inactive');
          }
          const basePrice = Number(service.price) || 0;
          let effectivePrice = basePrice;

          // 💬 Negotiated price: ONLY an ACCEPTED offer owned by this client
          // may change the amount. The offer id comes from the request but the
          // amount is read from the DB — a client can never pay an amount the
          // freelancer didn't agree to.
          const offerId = metadata?.offer_id || data.offer_id;
          if (offerId) {
            const { data: offer } = await supabaseClient
              .from('service_offers')
              .select('id, status, amount, client_id, service_id')
              .eq('id', offerId)
              .maybeSingle();
            if (!offer || offer.status !== 'accepted' || offer.service_id !== serviceId || offer.client_id !== user.id) {
              throw new Error('Offer is not valid for this purchase');
            }
            const offered = Number(offer.amount) || 0;
            // Bounds: the agreed price must stay within a professional range
            // of the listed price (never wildly off, never below ₹50).
            if (offered < 50 || offered > Math.max(basePrice * 2, 5000)) {
              throw new Error('Offer amount is out of the allowed range');
            }
            effectivePrice = offered;
          }

          // 💜 Tip: only honoured when the freelancer enabled accepts_tips,
          // never more than the (effective) service price.
          let tipAmount = 0;
          if (service.accepts_tips === true) {
            const requestedTip = Number(metadata?.tip_amount || 0);
            if (Number.isFinite(requestedTip) && requestedTip > 0) {
              if (requestedTip > effectivePrice) {
                throw new Error('Tip cannot exceed the service price');
              }
              tipAmount = Math.round(requestedTip * 100) / 100;
            }
          }

          serverAmount = Math.round((effectivePrice + tipAmount) * 100) / 100;
        } else if (validOrderType === 'card_verification') {
          // ₹1 authorization used purely to tokenize a card for one-click future
          // payments (Settings → Billing → Add Card). The amount is fixed
          // server-side and the charge is auto-refunded right after the token is
          // stored. No contract/subscription/service involvement.
          serverAmount = 1;
        } else if (validOrderType === 'wallet_topup') {
          // Client adds funds to their Growlancer wallet (used to fund escrow
          // or pay for Pro). The amount is client-chosen but validated strictly
          // server-side: positive number, bounded to a sane range so nobody
          // can mint wallet credit for free or create absurd orders.
          const requested = Number(data.amount ?? data.amount_inr ?? 0);
          if (!Number.isFinite(requested) || requested < 50 || requested > 100000) {
            throw new Error('Amount must be between ₹50 and ₹1,00,000');
          }
          serverAmount = Math.round(requested * 100) / 100;
        } else if (validOrderType === 'revision_payment') {
          // Client pays for EXTRA REVISIONS beyond the free included ones.
          // The amount is the revision_requests.total_amount (set when the
          // freelancer accepted) — never trusted from the request body.
          const revisionRequestId = data.revision_request_id || metadata?.revision_request_id;
          if (!revisionRequestId) throw new Error('revision_request_id is required for revision_payment');
          const { data: revReq } = await supabaseClient
            .from('revision_requests')
            .select('client_id, status, total_amount, contract_id')
            .eq('id', revisionRequestId)
            .single();
          if (!revReq || revReq.client_id !== user.id) {
            throw new Error('Unauthorized: revision request not found');
          }
          if (revReq.status !== 'accepted') {
            throw new Error('Revision request is not awaiting payment');
          }
          serverAmount = Number(revReq.total_amount) || 0;
        }

        const validAmount = serverAmount;
        if (isNaN(validAmount) || validAmount <= 0 || validAmount > 100000) {
          throw new Error('Invalid amount');
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

        // Financial audit trail
        await insertAuditLog(supabaseAdmin, {
          action: 'order_created',
          entity_type: 'razorpay_order',
          entity_id: dbOrder.id,
          user_id: user.id,
          amount: validAmount,
          currency,
          metadata: { order_type: validOrderType, contract_id: contract_id || null, subscription_id: subscription_id || null },
          ip_address: req.headers.get('x-forwarded-for') || null,
        });

        result = {
          order: dbOrder,
          razorpay_order: razorpayOrder,
          razorpay_key_id: RAZORPAY_KEY_ID,
          amount: validAmount,
          currency,
        };
        break;
      }

      // ─── WALLET SUBSCRIPTION PAY ──────────────────────
      // Pay for a Pro subscription using the Growlancer wallet. Every amount is
      // recomputed server-side from the plan (never trusted from the client).
      // The whole financial operation runs inside ONE SECURITY DEFINER
      // transaction (pay_subscription_with_wallet): ownership check → plan
      // price → locked balance check → atomic deduction → ledger entry →
      // subscription activation → is_pro sync. No multi-step race conditions.
      case 'wallet_subscription_pay': {
        const { subscription_id } = data;
        if (!subscription_id) throw new Error('subscription_id is required for wallet_subscription_pay');

        const { data: pay, error: payErr } = await supabaseClient
          .rpc('pay_subscription_with_wallet', { p_subscription_id: subscription_id })
          .single();

        if (payErr) throw new Error(`Wallet payment failed: ${payErr.message}`);
        if (!pay?.success) {
          throw new Error(pay?.error || 'Wallet payment failed');
        }

        // Load the refreshed subscription to return to the client
        const { data: updatedSub, error: subErr } = await supabaseClient
          .from('subscriptions')
          .select('*, subscription_plans(*)')
          .eq('id', subscription_id)
          .single();
        if (subErr || !updatedSub) throw new Error('Failed to load subscription after payment');

        // Financial audit trail
        await insertAuditLog(supabaseAdmin, {
          action: 'subscription_wallet_paid',
          entity_type: 'subscription',
          entity_id: subscription_id,
          user_id: user.id,
          amount: Number(pay.amount) || 0,
          currency: 'INR',
          metadata: { plan_id: updatedSub.plan_id, method: 'wallet', balance: pay.balance },
          ip_address: req.headers.get('x-forwarded-for') || null,
        });

        result = { success: true, subscription: updatedSub, balance: pay.balance };
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

        // Verify the order belongs to the authenticated user before proceeding
        const { data: orderOwner } = await supabaseClient
          .from('razorpay_orders')
          .select('id, user_id, amount, status')
          .eq('razorpay_order_id', razorpay_order_id)
          .single();
        if (!orderOwner || orderOwner.user_id !== user.id) {
          throw new Error('Unauthorized to verify this order');
        }

        // Idempotency guard — never process the same payment twice (prevents
        // duplicate transactions / double escrow funding on retries)
        if (orderOwner.status === 'captured') {
          const { data: alreadyCaptured } = await supabaseClient
            .from('razorpay_orders')
            .select('*')
            .eq('razorpay_order_id', razorpay_order_id)
            .single();
          result = { order: alreadyCaptured, already_processed: true, payment: {} };
          break;
        }

        // Get payment details from Razorpay
        const paymentDetails = await razorpayFetch(`/payments/${razorpay_payment_id}`);

        // Server-side amount check: the paid amount must match the order amount
        const paidAmount = (Number(paymentDetails.amount) || 0) / 100;
        const orderAmount = Number(orderOwner.amount) || 0;
        if (paidAmount < orderAmount - 0.01) {
          throw new Error('Payment amount does not match order amount');
        }

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

        // Store transaction (service role — RLS public-insert policy dropped)
        await supabaseAdmin.from('razorpay_transactions').insert({
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
          const { error: fundErr } = await supabaseClient.rpc('fund_escrow', {
            p_contract_id: updatedOrder.contract_id,
            p_client_id: user.id,
          });
          if (fundErr) throw new Error(`Failed to fund escrow: ${fundErr.message}`);

          // Notify both parties
          const { data: contract } = await supabaseAdmin
            .from('contracts')
            .select('client_id, freelancer_id')
            .eq('id', updatedOrder.contract_id)
            .maybeSingle();
          if (contract) {
            await notify(
              supabaseAdmin, contract.client_id, 'payment',
              'Escrow funded',
              `Your escrow payment of ${updatedOrder.currency} ${Number(updatedOrder.amount).toFixed(2)} was received and the contract is now active.`,
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

        // Service purchase: bump the service's live order count so the
        // freelancer's dashboard reflects real demand. Idempotent — this branch
        // only runs on the FIRST capture (guarded by the status='captured'
        // check above), so a retried verify can never double-count an order.
        if (updatedOrder.order_type === 'service_purchase') {
          const serviceId = updatedOrder.metadata?.service_id || data?.service_id;
          if (serviceId) {
            const { error: ordErr } = await supabaseAdmin.rpc('increment_service_orders', {
              p_service_id: serviceId,
            });
            if (ordErr) {
              console.error('[razorpay] increment_service_orders failed:', ordErr.message);
            } else {
              await notify(
                supabaseAdmin, updatedOrder.user_id, 'payment',
                'Order placed',
                `Your payment for the service was successful. The freelancer has been notified.`,
                '/services',
                { service_id: serviceId }
              );
            }
          }
        }

        // Extra revision payment: add the paid amount to the contract escrow
        // (escrow-protected until the client approves the revised work).
        // Idempotent — only runs on the FIRST capture (status='captured'
        // guard above), so a retried verify can never double-credit escrow.
        if (updatedOrder.order_type === 'revision_payment') {
          const revisionRequestId = updatedOrder.metadata?.revision_request_id || data?.revision_request_id;
          if (revisionRequestId) {
            const { error: revErr } = await supabaseAdmin.rpc('mark_revision_paid', {
              p_request_id: revisionRequestId,
              p_razorpay_order_id: razorpay_order_id,
            });
            if (revErr) throw new Error(`Failed to credit revision escrow: ${revErr.message}`);
          }
        }

        // Wallet top-up: credit the user's wallet with the paid amount. This
        // is idempotent — the order can only reach this branch once (guarded
        // by the status='captured' check above), so a retried verify can never
        // double-credit the wallet.
        if (updatedOrder.order_type === 'wallet_topup') {
          const { data: credit, error: creditErr } = await supabaseAdmin.rpc('update_wallet_balance', {
            p_user_id: user.id,
            p_amount: Number(updatedOrder.amount) || 0,
          });
          if (creditErr) throw new Error(`Failed to credit wallet: ${creditErr.message}`);

          await supabaseAdmin.from('transactions').insert({
            user_id: user.id,
            amount: Number(updatedOrder.amount) || 0,
            type: 'credit',
            source: 'deposit',
            status: 'completed',
            description: 'Wallet top-up via Razorpay',
            currency: updatedOrder.currency || 'INR',
            metadata: { razorpay_order_id: updatedOrder.razorpay_order_id, razorpay_payment_id },
          });

          await notify(
            supabaseAdmin, user.id, 'payment',
            'Wallet topped up',
            `₹${Number(updatedOrder.amount).toLocaleString('en-IN')} added to your wallet.`,
            '/dashboard/wallet',
            { razorpay_order_id: updatedOrder.razorpay_order_id }
          );
        }

        // Financial audit trail
        await insertAuditLog(supabaseAdmin, {
          action: 'payment_captured',
          entity_type: 'razorpay_order',
          entity_id: updatedOrder.id,
          user_id: user.id,
          amount: Number(updatedOrder.amount),
          currency: updatedOrder.currency,
          metadata: { order_type: updatedOrder.order_type, contract_id: updatedOrder.contract_id, source: 'client_verify' },
          ip_address: req.headers.get('x-forwarded-for') || null,
        });

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

        // Ownership check: only the order owner or an admin may refund
        const { data: orderRec } = await supabaseClient
          .from('razorpay_orders')
          .select('user_id, contract_id')
          .eq('razorpay_payment_id', razorpay_payment_id)
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

        const refundBody: any = { payment_id: razorpay_payment_id };
        if (refundAmount) {
          refundBody.amount = Math.round(parseFloat(refundAmount) * 100);
        }

        const refundResult = await razorpayFetch('/refunds', {
          method: 'POST',
          body: JSON.stringify(refundBody),
        });

        await supabaseAdmin.from('razorpay_transactions').insert({
          razorpay_payment_id,
          razorpay_transaction_id: refundResult.id,
          transaction_type: 'refund',
          amount: parseFloat(refundResult.amount) / 100,
          currency: refundResult.currency || 'INR',
          status: refundResult.status,
          processor_response: refundResult,
        });

        // Track the refund so the webhook (refund.processed) completes the ledger
        // row and reconciles escrow idempotently. Manual refunds used to skip this
        // — no provider_refund_id meant the refund never appeared in the refunds
        // ledger/timeline and the refund_request was never closed.
        await supabaseAdmin.from('refunds').insert({
          contract_id: orderRec.contract_id || null,
          provider: 'razorpay',
          provider_refund_id: refundResult.id,
          provider_payment_id: razorpay_payment_id,
          amount: parseFloat(refundResult.amount) / 100,
          currency: refundResult.currency || 'INR',
          status: 'processing',
          timeline: [{ event: 'created', at: new Date().toISOString(), razorpay_refund_id: refundResult.id }],
        });

        // Financial audit trail + notify the client
        await insertAuditLog(supabaseAdmin, {
          action: 'refund_issued',
          entity_type: 'razorpay_order',
          entity_id: orderRec.id,
          user_id: orderRec.user_id,
          amount: parseFloat(refundResult.amount) / 100,
          currency: refundResult.currency || 'INR',
          metadata: { payment_id: razorpay_payment_id, refund_id: refundResult.id, actor: isAdmin ? 'admin' : 'client' },
          ip_address: req.headers.get('x-forwarded-for') || null,
        });
        await notify(
          supabaseAdmin, orderRec.user_id, 'payment',
          'Refund processed',
          `Your refund of ${refundResult.currency || 'INR'} ${(parseFloat(refundResult.amount) / 100).toFixed(2)} has been processed.`,
          '/client/payments',
          { refund_id: refundResult.id }
        );

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
      // REMOVED (security): this action let any authenticated user trigger a
      // payout to an arbitrary fund account — a direct fund-drain vector.
      // All withdrawals must go through the `withdrawal` edge function, which
      // verifies wallet balance, holds funds, and enforces rate limits.
      // ─── CREATE FUND ACCOUNT (RazorpayX) ────────────
      // RazorpayX /v1/payouts requires a fund_account_id created server-side via
      // POST /v1/fund_accounts. Raw account numbers / UPI IDs are not accepted.
      // Creates (or reuses) the RazorpayX contact + fund account for a user's
      // payout method and stores the returned fund_account_id on the row.
      case 'create_fund_account': {
        const { payout_method_id, name, email, phone } = data || {};
        if (!payout_method_id) throw new Error('Missing payout_method_id');

        const { data: method, error: methodErr } = await supabaseClient
          .from('payout_methods')
          .select('*')
          .eq('id', payout_method_id)
          .eq('user_id', user.id)
          .maybeSingle();
        if (methodErr || !method) throw new Error('Payout method not found');

        // Already linked to a RazorpayX fund account → return it (idempotent).
        if (method.razorpay_fund_account_id) {
          result = { fund_account_id: method.razorpay_fund_account_id, payout_method_id, already_existed: true };
          break;
        }

        // Create (or reuse) the RazorpayX contact for this user.
        const contactPayload: Record<string, unknown> = {
          name: name || method.account_holder_name || 'Growlancer User',
          type: 'customer',
          reference_id: `user_${user.id.slice(0, 20)}`,
        };
        if (email || method.email) contactPayload.email = email || method.email;
        if (phone || method.phone) contactPayload.contact = phone || method.phone;

        let contactRes;
        try {
          contactRes = await razorpayFetch('/contacts', { method: 'POST', body: JSON.stringify(contactPayload) });
        } catch {
          // If the contact already exists, look it up by the reference id.
          const list = await razorpayFetch('/contacts?count=100');
          contactRes = (list?.items || []).find((c: any) => c.reference_id === `user_${user.id.slice(0, 20)}`);
          if (!contactRes) throw new Error('Failed to create RazorpayX contact');
        }

        // Build the fund account payload by method type.
        const isBank = method.type === 'bank' || method.type === 'bank_transfer';
        let fundPayload: Record<string, unknown>;
        if (isBank) {
          fundPayload = {
            contact_id: contactRes.id,
            account_type: 'bank_account',
            bank_account: {
              name: method.account_holder_name || contactRes.name || 'Growlancer User',
              ifsc: method.ifsc_code || '',
              account_number: method.account_number || '',
            },
          };
        } else {
          // UPI (vpa)
          fundPayload = {
            contact_id: contactRes.id,
            account_type: 'vpa',
            vpa: { address: method.upi_id || '' },
          };
        }

        const fundRes = await razorpayFetch('/fund_accounts', { method: 'POST', body: JSON.stringify(fundPayload) });

        await supabaseClient
          .from('payout_methods')
          .update({ razorpay_fund_account_id: fundRes.id, updated_at: new Date().toISOString() })
          .eq('id', payout_method_id)
          .eq('user_id', user.id);

        await insertAuditLog(supabaseAdmin, {
          action: 'fund_account_created',
          entity_type: 'payout_method',
          entity_id: payout_method_id,
          amount: null,
          metadata: { razorpay_fund_account_id: fundRes.id, type: method.type },
          user_id: user.id,
        });

        result = { fund_account_id: fundRes.id, payout_method_id, already_existed: false };
        break;
      }

      case 'create_payout': {
        return new Response(JSON.stringify({ error: 'Action disabled. Use the withdrawal function instead.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ─── EXECUTE REFUND (cron / internal) ───────────
      // Called by pg_cron → pg_net with CRON_SECRET. Processes a refund_request
      // that was auto-approved (Case 1 / Case 2 / Case 3 accepted): creates the
      // Razorpay refund, reverses escrow, closes the contract, and records the
      // refund + timeline + notifications + audit. Fully idempotent.
      case 'execute_refund': {
        const refundRequestId: string = data?.refund_request_id;
        if (!refundRequestId) throw new Error('Missing refund_request_id');

        const { data: refundRequest, error: reqErr } = await supabaseAdmin
          .from('refund_requests')
          .select('*')
          .eq('id', refundRequestId)
          .maybeSingle();
        if (reqErr || !refundRequest) throw new Error('Refund request not found');

        // Idempotency: only auto_approved/approved may be executed; already
        // executed (completed / provider_refund_id set) is a no-op.
        if (!['auto_approved', 'approved'].includes(refundRequest.status)) {
          result = { refund_request_id: refundRequestId, skipped: true, reason: refundRequest.status };
          break;
        }

        // Prevent duplicate provider refunds
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

        // Find the captured Razorpay order for this contract
        const { data: order } = await supabaseAdmin
          .from('razorpay_orders')
          .select('*')
          .eq('contract_id', refundRequest.contract_id)
          .eq('order_type', 'contract_escrow')
          .eq('status', 'captured')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!order || !order.razorpay_payment_id) {
          // No captured payment on file → nothing to refund via Razorpay; just
          // reverse the escrow and close (idempotent).
          await supabaseAdmin.rpc('admin_reverse_escrow', { p_contract_id: refundRequest.contract_id });
          await supabaseAdmin.from('refund_requests').update({ status: 'completed', closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', refundRequestId);
          await insertAuditLog(supabaseAdmin, { action: 'refund_escrow_only', entity_type: 'refund_request', entity_id: refundRequestId, user_id: refundRequest.requested_by, amount: refundRequest.refund_amount, currency: 'INR', metadata: { contract_id: refundRequest.contract_id, note: 'no captured razorpay payment' } });
          result = { refund_request_id: refundRequestId, refunded: true, escrow_reversed: true, note: 'no_captured_payment' };
          break;
        }

        // Create the Razorpay refund (server-side, never trust client amounts).
        // Correct endpoint: POST /refunds with { payment_id, amount }.
        const refundAmountPaisa = Math.round(Number(refundRequest.refund_amount) * 100);
        let refundRes: any;
        try {
          refundRes = await razorpayFetch('/refunds', {
            method: 'POST',
            body: JSON.stringify({
              payment_id: order.razorpay_payment_id,
              amount: refundAmountPaisa,
              notes: { refund_request_id: refundRequestId, contract_id: refundRequest.contract_id },
            }),
          });
        } catch (refundErr) {
          // Failure recovery: record a failed refund with retry metadata so the
          // pg_cron job (process_pending_refunds) retries it later. Escrow is
          // NOT reversed until the refund actually completes (webhook confirms).
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
              provider: 'razorpay',
              provider_payment_id: order.razorpay_payment_id,
              amount: refundRequest.refund_amount,
              currency: 'INR',
              status: 'failed',
              retry_count: 1,
              last_error: errMsg.slice(0, 500),
              timeline: [{ event: 'failed', at: new Date().toISOString(), error: errMsg.slice(0, 200) }],
            });
          }

          // Keep the request in auto_approved so the cron retries it
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

        const razorpayRefundId: string = refundRes.id || '';

        // Record the refund (idempotent: unique-ish guard via existing check above)
        await supabaseAdmin.from('refunds').insert({
          refund_request_id: refundRequestId,
          contract_id: refundRequest.contract_id,
          provider: 'razorpay',
          provider_refund_id: razorpayRefundId,
          provider_payment_id: order.razorpay_payment_id,
          amount: refundRequest.refund_amount,
          currency: refundRes.currency || 'INR',
          status: 'processing',
          timeline: [{ event: 'created', at: new Date().toISOString(), razorpay_refund_id: razorpayRefundId }],
        });

        // Mark the request as executing; completion is confirmed by the webhook
        // (refund.processed) which flips it to completed and reverses escrow.
        await supabaseAdmin.from('refund_requests').update({
          provider_refund_id: razorpayRefundId,
          updated_at: new Date().toISOString(),
        }).eq('id', refundRequestId);

        await supabaseAdmin.rpc('insert_payment_audit_log', {
          p_action: 'refund_initiated',
          p_entity_type: 'refund_request',
          p_entity_id: refundRequestId,
          p_provider: 'razorpay',
          p_amount: refundRequest.refund_amount,
          p_currency: refundRes.currency || 'INR',
          p_metadata: { razorpay_refund_id: razorpayRefundId, contract_id: refundRequest.contract_id },
          p_user_id: refundRequest.requested_by,
        });

        await notify(
          supabaseAdmin, refundRequest.requested_by, 'refund',
          'Refund in progress',
          `Your refund of ${refundRes.currency || 'INR'} ${Number(refundRequest.refund_amount).toFixed(2)} is being processed.`,
          '/client/payments',
          { refund_request_id: refundRequestId, contract_id: refundRequest.contract_id }
        );

        result = { refund_request_id: refundRequestId, razorpay_refund_id: razorpayRefundId, status: 'processing' };
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
