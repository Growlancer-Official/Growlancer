// PayPal Webhook Edge Function
// Handles incoming PayPal webhook events (IPN replacement)
// Processes payment completion, dispute filings, subscription events

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// PayPal API configuration for verification
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') || '';
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET') || '';
const PAYPAL_API_URL =
  Deno.env.get('PAYPAL_SANDBOX') === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
const PAYPAL_WEBHOOK_ID = Deno.env.get('PAYPAL_WEBHOOK_ID') || '';

const ALLOWED_ORIGINS = [
  'https://growlancer-mrkhan154212s-projects.vercel.app',
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

// Verify webhook signature
async function verifyWebhookSignature(
  headers: Headers,
  body: string
): Promise<boolean> {
  if (!PAYPAL_WEBHOOK_ID) {
    // Fail closed: refuse to process webhooks if webhook ID is not configured
    throw new Error('PAYPAL_WEBHOOK_ID is not configured. Webhook processing is disabled.');
  }

  try {
    const authHeader = `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`;
    const accessTokenRes = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const { access_token } = await accessTokenRes.json();

    const verificationRes = await fetch(
      `${PAYPAL_API_URL}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({
          auth_algo: headers.get('PAYPAL-AUTH-ALGO') || '',
          cert_url: headers.get('PAYPAL-CERT-URL') || '',
          transmission_id: headers.get('PAYPAL-TRANSMISSION-ID') || '',
          transmission_sig: headers.get('PAYPAL-TRANSMISSION-SIG') || '',
          transmission_time: headers.get('PAYPAL-TRANSMISSION-TIME') || '',
          webhook_id: PAYPAL_WEBHOOK_ID,
          webhook_event: JSON.parse(body),
        }),
      }
    );

    const { verification_status } = await verificationRes.json();
    return verification_status === 'SUCCESS';
  } catch (err) {
    console.error('Webhook verification error:', err);
    return false;
  }
}

serve(async req => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const event = JSON.parse(body);

    // Verify webhook signature (throws if PAYPAL_WEBHOOK_ID is not configured — fail closed)
    const isValid = await verifyWebhookSignature(req.headers, body);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const eventType = event.event_type;
    const resource = event.resource;

    console.log(`Processing webhook event: ${eventType}`);

    switch (eventType) {
      // ─── PAYMENT CAPTURE EVENTS ───────────────────────────
      case 'PAYMENT.CAPTURE.COMPLETED': {
        const captureId = resource.id;
        const paypalOrderId = resource.supplementary_data?.related_ids?.order_id;

        if (paypalOrderId) {
          await supabaseClient
            .from('paypal_orders')
            .update({
              status: 'captured',
              captured_at: resource.create_time,
              paypal_payer_id: resource.payer?.payer_id,
              paypal_payer_email: resource.payer?.email_address,
            })
            .eq('paypal_order_id', paypalOrderId);

          // Store transaction
          await supabaseClient.from('paypal_transactions').insert({
            paypal_order_id: paypalOrderId,
            paypal_transaction_id: captureId,
            transaction_type: 'capture',
            amount: parseFloat(resource.amount?.value || '0'),
            currency: resource.amount?.currency_code || 'USD',
            status: resource.status,
            payer_email: resource.payer?.email_address,
            processor_response: resource,
          });

          // If linked to contract, fund escrow — but ONLY after verifying the
          // captured amount matches the order amount (server-side recompute).
          const { data: order } = await supabaseClient
            .from('paypal_orders')
            .select('contract_id, subscription_id, user_id, amount, order_type, metadata')
            .eq('paypal_order_id', paypalOrderId)
            .single();

          const capturedAmount = parseFloat(resource.amount?.value || '0');
          const orderAmount = Number(order?.amount) || 0;

          if (order && capturedAmount < orderAmount - 0.01) {
            console.error(`Capture amount mismatch for ${paypalOrderId}: captured ${capturedAmount}, expected ${orderAmount}`);
            break;
          }

          if (order?.contract_id) {
            await supabaseClient.rpc('fund_escrow', {
              p_contract_id: order.contract_id,
              p_client_id: order.user_id,
            });
          }

          if (order?.order_type === 'contest_prize' && order?.metadata?.contest_id) {
            await supabaseClient.rpc('admin_fund_contest_prize', {
              p_contest_id: order.metadata.contest_id,
            });
          }

          if (order?.subscription_id) {
            await supabaseClient
              .from('subscriptions')
              .update({
                status: 'active',
                subscription_start_date: new Date().toISOString(),
              })
              .eq('id', order.subscription_id);
          }
        }
        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        const refundCaptureId = resource.id;
        const relatedOrderId = resource.supplementary_data?.related_ids?.order_id;

        if (relatedOrderId) {
          const { data: order } = await supabaseClient
            .from('paypal_orders')
            .select('contract_id, user_id, amount, currency')
            .eq('paypal_order_id', relatedOrderId)
            .single();

          await supabaseClient
            .from('paypal_orders')
            .update({ status: 'refunded' })
            .eq('paypal_order_id', relatedOrderId);

          await supabaseClient.from('paypal_transactions').insert({
            paypal_order_id: relatedOrderId,
            paypal_transaction_id: `REFUND_${refundCaptureId}`,
            transaction_type: 'refund',
            amount: parseFloat(resource.amount?.value || '0'),
            currency: resource.amount?.currency_code || 'USD',
            status: 'completed',
            processor_response: resource,
          });

          // If contract escrow, reverse the escrow through the same safe RPC
          // used by the Razorpay path (escrow → refunded, contract → pending,
          // wallet-funded escrow credited back, card/PayPal-funded left to the
          // payment method — never double-credited).
          if (order?.contract_id) {
            await supabaseClient.rpc('admin_reverse_escrow', {
              p_contract_id: order.contract_id,
            });

            // Visibility record so the client's Payments page shows where the
            // money went (PayPal refunds return to the PayPal account / card).
            if (order.user_id) {
              const refundAmount = parseFloat(resource.amount?.value || '0') || 0;
              const { data: dupRefundRow } = await supabaseClient
                .from('transactions')
                .select('id')
                .eq('user_id', order.user_id)
                .eq('source', 'refund')
                .eq('status', 'completed')
                .eq('metadata->>paypal_refund_id', refundCaptureId)
                .maybeSingle();
              if (!dupRefundRow && refundAmount > 0) {
                await supabaseClient.from('transactions').insert({
                  user_id: order.user_id,
                  contract_id: order.contract_id,
                  amount: refundAmount,
                  type: 'credit',
                  source: 'refund',
                  status: 'completed',
                  description: `Refund of ${order.currency || 'USD'} ${refundAmount.toFixed(2)} returned to your original payment method (PayPal/card)`,
                  currency: order.currency || 'USD',
                  metadata: { paypal_refund_id: refundCaptureId, provider: 'paypal', returned_to_payment_method: true },
                });
              }
            }
          }
        }
        break;
      }

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.REVERSED': {
        const deniedCaptureId = resource.id;
        await supabaseClient
          .from('paypal_transactions')
          .update({ status: resource.status.toLowerCase() })
          .eq('paypal_transaction_id', deniedCaptureId);
        break;
      }

      // ─── DISPUTE / CHARGEBACK EVENTS ──────────────────────
      case 'CUSTOMER.DISPUTE.CREATED': {
        const disputeId = resource.dispute_id || resource.id;
        const transactionId = resource.disputed_transactions?.[0]?.seller_transaction_id;

        // Log the dispute for admin review
        await supabaseClient.from('paypal_disputes').insert({
          dispute_id: disputeId,
          transaction_id: transactionId,
          reason: resource.reason,
          status: resource.status || 'open',
          amount: parseFloat(resource.disputed_amount?.value || '0'),
          currency: resource.disputed_amount?.currency_code || 'USD',
          processor_response: resource,
        });
        break;
      }

      case 'CUSTOMER.DISPUTE.RESOLVED': {
        const resolvedDisputeId = resource.dispute_id || resource.id;
        await supabaseClient
          .from('paypal_disputes')
          .update({ status: resource.status || 'resolved' })
          .eq('dispute_id', resolvedDisputeId);
        break;
      }

      // ─── SUBSCRIPTION EVENTS ──────────────────────────────
      case 'BILLING.SUBSCRIPTION.CANCELLED': {
        const subId = resource.id;
        await supabaseClient
          .from('subscriptions')
          .update({ status: 'cancelled', cancel_at_period_end: true })
          .eq('payment_subscription_id', subId);
        break;
      }

      case 'BILLING.SUBSCRIPTION.SUSPENDED': {
        const suspendedSubId = resource.id;
        await supabaseClient
          .from('subscriptions')
          .update({ status: 'suspended' })
          .eq('payment_subscription_id', suspendedSubId);
        break;
      }

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        const failedSubId = resource.billing_agreement_id;
        await supabaseClient
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('payment_subscription_id', failedSubId);
        break;
      }

      // ─── PAYOUT EVENTS (PayPal Payouts async status updates) ──────────
      case 'PAYMENT.PAYOUTSBATCH.SUCCESS': {
        const batchId = resource.batch_header?.payout_batch_id;
        if (batchId) {
          const batchStatus = resource.batch_header?.batch_status || 'SUCCESS';
          await supabaseClient
            .from('withdrawals')
            .update({ status: 'completed', processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('paypal_payout_id', batchId);
          // Parameterized update of linked transactions (no raw SQL interpolation)
          const { data: wdRows } = await supabaseClient
            .from('withdrawals')
            .select('id')
            .eq('paypal_payout_id', batchId);
          for (const w of wdRows || []) {
            await supabaseClient
              .from('transactions')
              .update({ status: 'completed' })
              .eq('metadata->>withdrawal_id', w.id);
          }
        }
        break;
      }

      case 'PAYMENT.PAYOUTSBATCH.DENIED':
      case 'PAYMENT.PAYOUTSBATCH.CANCELED': {
        const deniedBatchId = resource.batch_header?.payout_batch_id;
        if (deniedBatchId) {
          const errorMsg = resource.batch_header?.errors?.message || `Payout batch ${resource.batch_header?.batch_status || 'denied'}`;
          const { data: wd } = await supabaseClient
            .from('withdrawals')
            .select('id, user_id, amount')
            .eq('paypal_payout_id', deniedBatchId)
            .single();
          if (wd) {
            await supabaseClient.rpc('release_wallet_funds', { p_user_id: wd.user_id, p_amount: wd.amount }).catch(() => {});
            await supabaseClient
              .from('withdrawals')
              .update({ status: 'failed', failure_reason: errorMsg, updated_at: new Date().toISOString() })
              .eq('id', wd.id);
            await supabaseClient
              .from('transactions')
              .update({ status: 'failed', description: `Withdrawal failed: ${errorMsg}` })
              .eq('metadata->>withdrawal_id', wd.id);
          }
        }
        break;
      }

      case 'PAYMENT.PAYOUTS.ITEM.SUCCESS': {
        const itemBatchId = resource.payout_batch_id;
        if (itemBatchId) {
          await supabaseClient
            .from('withdrawals')
            .update({ status: 'completed', processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('paypal_payout_id', itemBatchId);
        }
        break;
      }

      case 'PAYMENT.PAYOUTS.ITEM.DENIED':
      case 'PAYMENT.PAYOUTS.ITEM.FAILED': {
        const failedItemBatchId = resource.payout_batch_id;
        if (failedItemBatchId) {
          const itemError = resource.errors?.message || 'Payout item failed';
          const { data: wd } = await supabaseClient
            .from('withdrawals')
            .select('id, user_id, amount')
            .eq('paypal_payout_id', failedItemBatchId)
            .single();
          if (wd) {
            await supabaseClient.rpc('release_wallet_funds', { p_user_id: wd.user_id, p_amount: wd.amount }).catch(() => {});
            await supabaseClient
              .from('withdrawals')
              .update({ status: 'failed', failure_reason: itemError, updated_at: new Date().toISOString() })
              .eq('id', wd.id);
          }
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Webhook processing failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
