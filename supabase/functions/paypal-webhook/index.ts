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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Verify webhook signature
async function verifyWebhookSignature(
  headers: Headers,
  body: string
): Promise<boolean> {
  if (!PAYPAL_WEBHOOK_ID) {
    console.warn('PAYPAL_WEBHOOK_ID not set, skipping signature verification');
    return true; // Allow in dev mode without verification
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const event = JSON.parse(body);

    // Verify webhook signature
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

          // If linked to contract, fund escrow
          const { data: order } = await supabaseClient
            .from('paypal_orders')
            .select('contract_id, subscription_id, user_id')
            .eq('paypal_order_id', paypalOrderId)
            .single();

          if (order?.contract_id) {
            await supabaseClient.rpc('fund_escrow', {
              p_contract_id: order.contract_id,
              p_client_id: order.user_id,
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

          // If contract escrow, reverse the escrow
          const { data: order } = await supabaseClient
            .from('paypal_orders')
            .select('contract_id')
            .eq('paypal_order_id', relatedOrderId)
            .single();

          if (order?.contract_id) {
            // Release escrow back to client
            await supabaseClient
              .from('escrow')
              .update({ status: 'refunded' })
              .eq('contract_id', order.contract_id);
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
