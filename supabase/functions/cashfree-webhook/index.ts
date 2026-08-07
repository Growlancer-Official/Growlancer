// Cashfree Payment Webhook
// Server-to-server callback from Cashfree. Verifies the webhook signature
// (Base64(HMAC-SHA256(x-webhook-timestamp + rawBody, CASHFREE_WEBHOOK_SECRET))),
// records every event for idempotency, reconciles orders the client never
// verified (failure recovery), funds escrow once, processes refund status,
// notifies both parties, and writes an audit trail.
//
// Configure: CASHFREE_WEBHOOK_SECRET (Cashfree Dashboard → Settings → Webhooks)
// Fail-closed: without the secret, all events are rejected.
//
// Event types handled: PAYMENT_SUCCESS_WEBHOOK, PAYMENT_FAILED_WEBHOOK,
// PAYMENT_USER_DROPPED_WEBHOOK, REFUND_STATUS_WEBHOOK.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const CASHFREE_WEBHOOK_SECRET = Deno.env.get('CASHFREE_WEBHOOK_SECRET') || '';

if (!CASHFREE_WEBHOOK_SECRET) {
  console.error('CASHFREE_WEBHOOK_SECRET is not configured — rejecting all webhooks (fail closed)');
}

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

/** Constant-time comparison for the decoded signature. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify the Cashfree webhook signature.
 * signedPayload = `${x-webhook-timestamp}${rawBody}`
 * expected     = Base64(HMAC-SHA256(signedPayload, CASHFREE_WEBHOOK_SECRET))
 */
async function verifySignature(rawBody: string, timestamp: string, signature: string): Promise<boolean> {
  if (!timestamp || !signature) return false;
  try {
    const signedPayload = `${timestamp}${rawBody}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(CASHFREE_WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    // Base64 encode the HMAC digest
    let binary = '';
    const bytes = new Uint8Array(sigBytes);
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const expected = btoa(binary);
    return safeEqual(expected, signature);
  } catch {
    return false;
  }
}

/** Build a deterministic idempotency key from a Cashfree event. */
function buildEventKey(eventType: string, data: any): string {
  const orderId = data?.order?.order_id || data?.order_id || '';
  const paymentId = data?.payment?.cf_payment_id || data?.payment?.payment_id || data?.cf_payment_id || '';
  const refundId = data?.refund?.refund_id || data?.refund_id || '';
  return `${eventType}|${orderId}|${paymentId}|${refundId}`;
}

/** Best-effort notification insert (service role bypasses RLS). */
async function notify(
  supabaseAdmin: any,
  userId: string,
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
    console.error('[cashfree-webhook] notification insert failed:', e);
  }
}

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
    console.error('[cashfree-webhook] audit log failed:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse(200, { ok: true });
  }

  if (!CASHFREE_WEBHOOK_SECRET) {
    return jsonResponse(500, { error: 'Webhook is not configured' });
  }

  // 1. Raw body is REQUIRED for signature verification (never re-encode parsed JSON)
  const rawBody = await req.text();
  const signature = req.headers.get('x-webhook-signature') || '';
  const timestamp = req.headers.get('x-webhook-timestamp') || '';

  if (!signature || !timestamp) {
    return jsonResponse(400, { error: 'Missing x-webhook-signature / x-webhook-timestamp' });
  }

  if (!(await verifySignature(rawBody, timestamp, signature))) {
    console.error('[cashfree-webhook] INVALID signature rejected');
    return jsonResponse(401, { error: 'Invalid signature' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const eventType = String(event?.type || event?.event || '');
  const data = event?.data || {};
  const eventKey = buildEventKey(eventType, data);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // 2. Idempotency — record the event first; duplicates are silently ignored.
  const { data: existing } = await supabaseAdmin
    .from('cashfree_webhooks')
    .select('id, status')
    .eq('event_id', eventKey)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('cashfree_webhooks')
      .update({ status: 'replayed' })
      .eq('id', existing.id);
    return jsonResponse(200, { ignored: true, reason: 'duplicate_event' });
  }

  const { error: logErr } = await supabaseAdmin
    .from('cashfree_webhooks')
    .insert({
      event_id: eventKey,
      event_type: eventType,
      payload: event,
      status: 'processed',
    });

  if (logErr) {
    console.error('[cashfree-webhook] failed to log event:', logErr.message);
    return jsonResponse(500, { error: 'Failed to log event' });
  }

  const orderEntity = data?.order || {};
  const paymentEntity = data?.payment || {};
  const orderId = orderEntity.order_id || data?.order_id || '';
  const paymentId = String(paymentEntity.cf_payment_id || paymentEntity.payment_id || data?.cf_payment_id || '');

  try {
    // ─── SUCCESS EVENT: PAYMENT_SUCCESS_WEBHOOK ──────────────────────────
    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK') {
      if (!orderId) {
        await supabaseAdmin.from('cashfree_webhooks').update({ status: 'ignored' }).eq('event_id', eventKey);
        return jsonResponse(200, { ignored: true, reason: 'no_order_id' });
      }

      const { data: dbOrder } = await supabaseAdmin
        .from('cashfree_orders')
        .select('*')
        .eq('cashfree_order_id', orderId)
        .maybeSingle();

      if (!dbOrder) {
        await insertAuditLog(supabaseAdmin, {
          action: 'webhook_received',
          entity_type: 'cashfree_order',
          entity_id: orderId,
          amount: Number(paymentEntity.payment_amount) || null,
          currency: paymentEntity.payment_currency || 'INR',
          metadata: { event: eventType, note: 'unknown order' },
        });
        return jsonResponse(200, { ok: true, note: 'unknown_order' });
      }

      // Idempotency — already captured via the client verify flow or an earlier webhook
      if (dbOrder.status === 'captured') {
        // Failure recovery: retry escrow funding (safe no-op if already funded)
        if (dbOrder.contract_id) {
          const { error: retryFundErr } = await supabaseAdmin.rpc('admin_fund_escrow', {
            p_contract_id: dbOrder.contract_id,
          });
          if (retryFundErr) {
            console.error('[cashfree-webhook] retry admin_fund_escrow failed:', retryFundErr.message);
          } else {
            await notify(
              supabaseAdmin, dbOrder.user_id, 'payment',
              'Escrow funded',
              `Your escrow payment of ₹${Number(dbOrder.amount).toFixed(2)} was received and the contract is now active.`,
              '/dashboard/contracts',
              { contract_id: dbOrder.contract_id }
            );
          }
        }
        await insertAuditLog(supabaseAdmin, {
          action: 'payment_captured',
          entity_type: 'cashfree_order',
          entity_id: dbOrder.id,
          user_id: dbOrder.user_id,
          amount: dbOrder.amount,
          currency: dbOrder.currency,
          metadata: { event: eventType, already_processed: true },
        });
        return jsonResponse(200, { ok: true, already_processed: true });
      }

      // Reconcile: mark captured + record transaction
      await supabaseAdmin
        .from('cashfree_orders')
        .update({
          status: 'captured',
          payment_id: paymentId,
          captured_at: new Date().toISOString(),
        })
        .eq('id', dbOrder.id);

      const { data: dupTxn } = await supabaseAdmin
        .from('cashfree_transactions')
        .select('id')
        .eq('cashfree_payment_id', paymentId)
        .eq('transaction_type', 'capture')
        .maybeSingle();

      if (!dupTxn) {
        await supabaseAdmin.from('cashfree_transactions').insert({
          cashfree_order_id: dbOrder.id,
          cashfree_payment_id: paymentId,
          transaction_type: 'capture',
          amount: dbOrder.amount,
          currency: dbOrder.currency || 'INR',
          status: 'captured',
          method: paymentEntity.payment_group || null,
          payer_email: data?.customer_details?.customer_email || null,
          payer_contact: data?.customer_details?.customer_phone || null,
          processor_response: event,
        });
      }

      // Fund escrow (idempotent, service-role-only RPC) — failure recovery for
      // clients whose browser died before verify_payment completed
      if (dbOrder.contract_id) {
        const { error: fundErr } = await supabaseAdmin.rpc('admin_fund_escrow', {
          p_contract_id: dbOrder.contract_id,
        });
        if (fundErr) {
          console.error('[cashfree-webhook] admin_fund_escrow failed:', fundErr.message);
        } else {
          const { data: contract } = await supabaseAdmin
            .from('contracts')
            .select('client_id, freelancer_id')
            .eq('id', dbOrder.contract_id)
            .maybeSingle();

          if (contract) {
            await notify(
              supabaseAdmin, contract.client_id, 'payment',
              'Escrow funded',
              `Your escrow payment of ₹${Number(dbOrder.amount).toFixed(2)} was received and the contract is now active.`,
              '/dashboard/contracts',
              { contract_id: dbOrder.contract_id }
            );
            await notify(
              supabaseAdmin, contract.freelancer_id, 'contract',
              'Contract funded — work can begin',
              'The client has funded the escrow. You can now start working on the contract.',
              '/dashboard/contracts',
              { contract_id: dbOrder.contract_id }
            );
          }
        }
      }

      // Subscriptions: activate
      if (dbOrder.subscription_id) {
        await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'active', subscription_start_date: new Date().toISOString() })
          .eq('id', dbOrder.subscription_id);
      }

      await insertAuditLog(supabaseAdmin, {
        action: 'payment_captured',
        entity_type: 'cashfree_order',
        entity_id: dbOrder.id,
        user_id: dbOrder.user_id,
        amount: dbOrder.amount,
        currency: dbOrder.currency,
        metadata: { event: eventType, source: 'webhook' },
      });

      return jsonResponse(200, { ok: true });
    }

    // ─── FAILURE EVENT: PAYMENT_FAILED_WEBHOOK / PAYMENT_USER_DROPPED_WEBHOOK ──
    if (eventType === 'PAYMENT_FAILED_WEBHOOK' || eventType === 'PAYMENT_USER_DROPPED_WEBHOOK') {
      const { data: dbOrder } = orderId
        ? await supabaseAdmin.from('cashfree_orders').select('*').eq('cashfree_order_id', orderId).maybeSingle()
        : await supabaseAdmin
            .from('cashfree_orders')
            .select('*')
            .eq('payment_id', paymentId)
            .maybeSingle();

      if (dbOrder && dbOrder.status !== 'captured') {
        await supabaseAdmin
          .from('cashfree_orders')
          .update({ status: 'failed' })
          .eq('id', dbOrder.id);

        await notify(
          supabaseAdmin, dbOrder.user_id, 'payment',
          'Payment failed',
          `Your Cashfree payment of ₹${Number(dbOrder.amount).toFixed(2)} could not be completed. No charge was made.`,
          '/dashboard',
          { contract_id: dbOrder.contract_id || null }
        );

        await insertAuditLog(supabaseAdmin, {
          action: 'payment_failed',
          entity_type: 'cashfree_order',
          entity_id: dbOrder.id,
          user_id: dbOrder.user_id,
          amount: dbOrder.amount,
          currency: dbOrder.currency,
          metadata: { event: eventType },
        });
      }

      return jsonResponse(200, { ok: true });
    }

    // ─── REFUND EVENT: REFUND_STATUS_WEBHOOK ─────────────────────────────
    if (eventType === 'REFUND_STATUS_WEBHOOK') {
      const refundEntity = data?.refund || {};
      const refundId = String(refundEntity.refund_id || data?.refund_id || '');
      const refundStatus = String(refundEntity.refund_status || '').toUpperCase();

      if (!refundId) {
        return jsonResponse(200, { ok: true, ignored: true, reason: 'no_refund_id' });
      }

      // Find the tracked refund by provider refund id
      const { data: trackedRefund } = await supabaseAdmin
        .from('refunds')
        .select('id, refund_request_id, contract_id')
        .eq('provider_refund_id', refundId)
        .maybeSingle();

      if (!trackedRefund) {
        await insertAuditLog(supabaseAdmin, {
          action: 'webhook_received',
          entity_type: 'refund',
          entity_id: refundId,
          metadata: { event: eventType, note: 'unknown refund id' },
        });
        return jsonResponse(200, { ok: true, ignored: true, reason: 'unknown_refund' });
      }

      if (refundStatus === 'SUCCESS') {
        const timeline = (trackedRefund as any)?.timeline || [];
        await supabaseAdmin.from('refunds').update({
          status: 'completed',
          timeline: [...timeline, { event: 'processed', at: new Date().toISOString(), cashfree_refund_id: refundId }],
          updated_at: new Date().toISOString(),
        }).eq('id', trackedRefund.id);

        if (trackedRefund.refund_request_id) {
          await supabaseAdmin.from('refund_requests').update({
            status: 'completed',
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', trackedRefund.refund_request_id);

          await supabaseAdmin.rpc('_refund_history_event', {
            p_refund_request_id: trackedRefund.refund_request_id,
            p_event: 'completed',
            p_actor_id: null,
            p_actor_role: 'system',
            p_note: 'Cashfree refund processed',
            p_metadata: { cashfree_refund_id: refundId },
          }).catch(() => undefined);
        }

        // Reconcile escrow: return a funded escrow to 'refunded'
        if (trackedRefund.contract_id) {
          const { error: reverseErr } = await supabaseAdmin.rpc('admin_reverse_escrow', {
            p_contract_id: trackedRefund.contract_id,
          });
          if (reverseErr) {
            console.error('[cashfree-webhook] admin_reverse_escrow failed:', reverseErr.message);
          }
        }

        // Find the order for the notification
        const { data: dbOrder } = await supabaseAdmin
          .from('cashfree_orders')
          .select('*')
          .eq('contract_id', trackedRefund.contract_id)
          .eq('order_type', 'contract_escrow')
          .eq('status', 'captured')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dbOrder) {
          await supabaseAdmin.from('cashfree_orders').update({ status: 'refunded' }).eq('id', dbOrder.id);
          await notify(
            supabaseAdmin, dbOrder.user_id, 'payment',
            'Refund processed',
            `Your refund of ₹${Number(dbOrder.amount).toFixed(2)} has been processed and will be returned to your payment method.`,
            '/client/payments',
            { contract_id: dbOrder.contract_id || null }
          );

          await insertAuditLog(supabaseAdmin, {
            action: 'refund_issued',
            entity_type: 'cashfree_order',
            entity_id: dbOrder.id,
            user_id: dbOrder.user_id,
            amount: dbOrder.amount,
            currency: dbOrder.currency,
            metadata: { event: eventType, cashfree_refund_id: refundId },
          });
        }
      } else if (refundStatus === 'FAILED') {
        await supabaseAdmin.from('refunds').update({
          status: 'failed',
          last_error: String(refundEntity.refund_message || refundEntity.failure_reason || 'Cashfree refund failed').slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq('id', trackedRefund.id);

        const { data: dbOrder } = await supabaseAdmin
          .from('cashfree_orders')
          .select('*')
          .eq('contract_id', trackedRefund.contract_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dbOrder) {
          await notify(
            supabaseAdmin, dbOrder.user_id, 'payment',
            'Refund failed',
            `Your refund of ₹${Number(dbOrder.amount).toFixed(2)} could not be processed. Our team will contact you, or you can retry from your payments page.`,
            '/client/payments',
            { contract_id: dbOrder.contract_id || null }
          );

          await insertAuditLog(supabaseAdmin, {
            action: 'refund_failed',
            entity_type: 'cashfree_order',
            entity_id: dbOrder.id,
            user_id: dbOrder.user_id,
            amount: dbOrder.amount,
            currency: dbOrder.currency,
            metadata: { event: eventType },
          });
        }
      }

      return jsonResponse(200, { ok: true });
    }

    // Unknown event type — acknowledge to stop retries, log for the audit trail
    await insertAuditLog(supabaseAdmin, {
      action: 'webhook_received',
      entity_type: 'event',
      entity_id: eventType,
      metadata: { event: eventType },
    });
    return jsonResponse(200, { ok: true, ignored: true, reason: 'unhandled_event' });
  } catch (error) {
    console.error('[cashfree-webhook] processing error:', error);
    await supabaseAdmin
      .from('cashfree_webhooks')
      .update({ status: 'failed' })
      .eq('event_id', eventKey);
    return jsonResponse(500, { error: 'Webhook processing failed' });
  }
});
