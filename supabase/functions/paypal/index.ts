// PayPal Edge Function for processing payments
// This function handles creating, capturing, refunding PayPal orders

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// PayPal API configuration
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') || '';
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET') || '';
const PAYPAL_API_URL =
  Deno.env.get('PAYPAL_SANDBOX') === 'true'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

// CORS headers - restricted to allowed origins
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://growlancer.com',
  'https://www.growlancer.com',
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Rate limiting constants (DB-backed via rate_limits table)
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60000;
const ROUTE = 'paypal';

async function checkRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);

  try {
    await supabaseClient.rpc('cleanup_expired_rate_limits');
  } catch {
    // Non-critical
  }

  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());

  if (error) return true;
  if (count !== null && count >= RATE_LIMIT) return false;

  await supabaseClient.from('rate_limits').insert({
    identifier,
    route: ROUTE,
    count: 1,
    window_start: now.toISOString(),
  });

  return true;
}

function validateAmount(amount: any): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || num <= 0 || num > 100000) {
    throw new Error('Invalid amount. Must be between 0 and 100,000');
  }
  return num;
}

function validateString(value: any, fieldName: string, maxLength = 255): string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return value.trim();
}

async function getPayPalAccessToken(): Promise<string> {
  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en_US',
      Authorization: `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get PayPal access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createPayPalOrder(orderData: any, accessToken: string) {
  const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(orderData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create PayPal order: ${error}`);
  }

  return await response.json();
}

async function capturePayPalOrder(orderId: string, accessToken: string) {
  const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to capture PayPal order: ${error}`);
  }

  return await response.json();
}

async function refundPayPalCapture(captureId: string, accessToken: string, amount?: number) {
  const body: any = {};
  if (amount) {
    body.amount = {
      value: amount.toString(),
      currency_code: 'USD',
    };
  }

  const response = await fetch(
    `${PAYPAL_API_URL}/v2/payments/captures/${captureId}/refund`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refund PayPal capture: ${error}`);
  }

  return await response.json();
}

async function getPayPalOrderDetails(orderId: string, accessToken: string) {
  const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get PayPal order details: ${error}`);
  }

  return await response.json();
}

async function getPayPalCaptureDetails(captureId: string, accessToken: string) {
  const response = await fetch(`${PAYPAL_API_URL}/v2/payments/captures/${captureId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get PayPal capture details: ${error}`);
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
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const identifier = user.id || clientIP;
    const allowed = await checkRateLimit(supabaseClient, identifier);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, data } = body;
    if (!action || typeof action !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = await getPayPalAccessToken();
    let result: any;

    switch (action) {
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

        const validAmount = validateAmount(amount);
        const validOrderType = validateString(order_type, 'order_type', 50);
        if (!['contract_escrow', 'subscription', 'service_purchase'].includes(validOrderType)) {
          throw new Error('Invalid order_type');
        }

        if (contract_id) {
          const { data: contract } = await supabaseClient
            .from('contracts')
            .select('client_id')
            .eq('id', contract_id)
            .single();
          if (!contract || contract.client_id !== user.id) {
            throw new Error('Unauthorized: You do not own this contract');
          }
        }

        if (subscription_id) {
          const { data: subscription } = await supabaseClient
            .from('subscriptions')
            .select('user_id')
            .eq('id', subscription_id)
            .single();
          if (!subscription || subscription.user_id !== user.id) {
            throw new Error('Unauthorized: You do not own this subscription');
          }
        }

        const paypalOrder = await createPayPalOrder(
          {
            intent: 'CAPTURE',
            purchase_units: [{
              amount: {
                currency_code: validateString(currency, 'currency', 3),
                value: validAmount.toString(),
              },
              description: description
                ? validateString(description, 'description', 200)
                : 'Growlancer Payment',
              custom_id: contract_id || subscription_id || '',
            }],
            application_context: {
              brand_name: 'Growlancer',
              landing_page: 'LOGIN',
              user_action: 'PAY_NOW',
              return_url: `${Deno.env.get('APP_URL') || 'http://localhost:5173'}/payment/success`,
              cancel_url: `${Deno.env.get('APP_URL') || 'http://localhost:5173'}/payment/cancel`,
            },
          },
          accessToken
        );

        const { data: dbOrder, error: dbError } = await supabaseClient
          .from('paypal_orders')
          .insert({
            user_id: user.id,
            paypal_order_id: paypalOrder.id,
            contract_id,
            subscription_id,
            order_type: validOrderType,
            amount: validAmount,
            currency: validateString(currency, 'currency', 3),
            status: 'created',
            description: description ? validateString(description, 'description', 200) : null,
            metadata,
          })
          .select()
          .single();

        if (dbError) {
          throw new Error(`Failed to store order: ${dbError.message}`);
        }

        result = {
          order: dbOrder,
          paypal_order: paypalOrder,
          approve_url: paypalOrder.links?.find((link: any) => link.rel === 'approve')?.href,
        };
        break;
      }

      case 'capture_order': {
        const { paypal_order_id } = data;
        if (!paypal_order_id) {
          return new Response(JSON.stringify({ error: 'Missing paypal_order_id' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: orderToCapture } = await supabaseClient
          .from('paypal_orders')
          .select('user_id, contract_id, subscription_id')
          .eq('paypal_order_id', paypal_order_id)
          .single();

        if (!orderToCapture || orderToCapture.user_id !== user.id) {
          return new Response(JSON.stringify({ error: 'Unauthorized to capture this order' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const orderDetails = await getPayPalOrderDetails(paypal_order_id, accessToken);

        if (orderDetails.status === 'COMPLETED') {
          const { data: existingOrder } = await supabaseClient
            .from('paypal_orders')
            .select('*')
            .eq('paypal_order_id', paypal_order_id)
            .single();
          result = { order: existingOrder, already_captured: true };
        } else if (orderDetails.status === 'APPROVED') {
          const captureResult = await capturePayPalOrder(paypal_order_id, accessToken);

          const { data: updatedOrder, error: updateError } = await supabaseClient
            .from('paypal_orders')
            .update({
              status: 'captured',
              captured_at: new Date().toISOString(),
              paypal_payer_id: captureResult.payer?.payer_id,
              paypal_payer_email: captureResult.payer?.email_address,
            })
            .eq('paypal_order_id', paypal_order_id)
            .select()
            .single();

          if (updateError) {
            throw new Error(`Failed to update order: ${updateError.message}`);
          }

          for (const purchaseUnit of captureResult.purchase_units || []) {
            for (const capture of purchaseUnit.payments?.captures || []) {
              await supabaseClient.from('paypal_transactions').insert({
                paypal_order_id: updatedOrder.id,
                paypal_transaction_id: capture.id,
                transaction_type: 'capture',
                amount: parseFloat(capture.amount.value),
                currency: capture.amount.currency_code,
                status: capture.status,
                payer_email: captureResult.payer?.email_address,
                payer_name: captureResult.payer?.name,
                processor_response: capture,
              });
            }
          }

          if (updatedOrder.contract_id) {
            await supabaseClient.rpc('fund_escrow', {
              p_contract_id: updatedOrder.contract_id,
              p_client_id: user.id,
            });
          }

          if (updatedOrder.subscription_id) {
            await supabaseClient
              .from('subscriptions')
              .update({
                status: 'active',
                subscription_start_date: new Date().toISOString(),
              })
              .eq('id', updatedOrder.subscription_id);
          }

          result = { order: updatedOrder, capture: captureResult };
        } else {
          throw new Error(`Order status is ${orderDetails.status}, cannot capture`);
        }
        break;
      }

      case 'refund_order': {
        const { paypal_order_id, amount: refundAmount } = data;

        if (!paypal_order_id) {
          return new Response(JSON.stringify({ error: 'Missing paypal_order_id' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Verify user owns the order
        const { data: orderToRefund } = await supabaseClient
          .from('paypal_orders')
          .select('user_id, paypal_order_id')
          .eq('paypal_order_id', paypal_order_id)
          .single();

        if (!orderToRefund || orderToRefund.user_id !== user.id) {
          return new Response(JSON.stringify({ error: 'Unauthorized to refund this order' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get order details to find capture ID
        const orderDetails = await getPayPalOrderDetails(paypal_order_id, accessToken);
        const captureId = orderDetails.purchase_units?.[0]?.payments?.captures?.[0]?.id;

        if (!captureId) {
          throw new Error('No capture found for this order');
        }

        // Process refund
        const refundResult = await refundPayPalCapture(captureId, accessToken, refundAmount);

        // Store refund transaction
        const refundAmountValue = refundAmount
          ? validateAmount(refundAmount)
          : parseFloat(orderDetails.purchase_units[0].payments.captures[0].amount.value);

        await supabaseClient.from('paypal_transactions').insert({
          paypal_order_id: orderToRefund.paypal_order_id,
          paypal_transaction_id: refundResult.id,
          transaction_type: 'refund',
          amount: refundAmountValue,
          currency: 'USD',
          status: refundResult.status,
          processor_response: refundResult,
        });

        // Update order status
        await supabaseClient
          .from('paypal_orders')
          .update({ status: 'refunded' })
          .eq('paypal_order_id', paypal_order_id);

        result = { refund: refundResult };
        break;
      }

      case 'get_order': {
        const { paypal_order_id } = data;
        if (!paypal_order_id) {
          return new Response(JSON.stringify({ error: 'Missing paypal_order_id' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: orderToGet } = await supabaseClient
          .from('paypal_orders')
          .select('user_id')
          .eq('paypal_order_id', paypal_order_id)
          .single();

        if (!orderToGet || orderToGet.user_id !== user.id) {
          return new Response(JSON.stringify({ error: 'Unauthorized to view this order' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const paypalOrder = await getPayPalOrderDetails(paypal_order_id, accessToken);
        const { data: dbOrder } = await supabaseClient
          .from('paypal_orders')
          .select('*')
          .eq('paypal_order_id', paypal_order_id)
          .single();

        result = { paypal_order: paypalOrder, database_order: dbOrder };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('PayPal function error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
