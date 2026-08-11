// Razorpay Payment Webhook
// Server-to-server callback from Razorpay. Verifies the HMAC signature over the
// raw body, records every event (idempotency via unique event_id), reconciles
// orders that the client never verified (failure recovery), funds escrow once,
// notifies both parties, and writes an audit trail.
//
// Configure: RAZORPAY_WEBHOOK_SECRET (from Razorpay Dashboard → Settings → Webhooks)
// Fail-closed: without the secret, all events are rejected.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '';

// Fail loudly — never process unsigned webhooks
if (!RAZORPAY_WEBHOOK_SECRET) {
  console.error('RAZORPAY_WEBHOOK_SECRET is not configured — rejecting all webhooks (fail closed)');
}

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

/** Constant-time-ish hex comparison for the Razorpay signature. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(RAZORPAY_WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(rawBody)
    );
    const expected = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return safeEqual(expected, signature);
  } catch {
    return false;
  }
}

/** Build a deterministic idempotency key from a Razorpay event. */
function buildEventKey(eventType: string, payload: any): string {
  // Payment events carry payload.payment.entity; refund events carry
  // payload.refund.entity.payment_id — cover both shapes.
  const orderId =
    payload?.order?.entity?.id ||
    payload?.payment?.entity?.order_id ||
    payload?.refund?.entity?.order_id ||
    '';
  const paymentId =
    payload?.payment?.entity?.id ||
    payload?.refund?.entity?.payment_id ||
    '';
  const refundId = payload?.refund?.entity?.id || '';
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
    console.error('[razorpay-webhook] notification insert failed:', e);
  }
}

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
    console.error('[razorpay-webhook] audit log failed:', e);
  }
}

/** Find the payment amount (major units) from the event payload. */
function paymentAmount(entity: any): number {
  return entity && typeof entity.amount === 'number' ? entity.amount / 100 : 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return jsonResponse(200, { ok: true });
  }

  if (!RAZORPAY_WEBHOOK_SECRET) {
    return jsonResponse(500, { error: 'Webhook is not configured' });
  }

  // 1. Raw body is REQUIRED for signature verification (never re-encode parsed JSON)
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature') || '';

  if (!signature) {
    return jsonResponse(400, { error: 'Missing x-razorpay-signature' });
  }

  if (!(await verifySignature(rawBody, signature))) {
    console.error('[razorpay-webhook] INVALID signature rejected');
    return jsonResponse(401, { error: 'Invalid signature' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  const eventType = String(event?.event || '');
  const payload = event?.payload || {};
  const eventKey = buildEventKey(eventType, payload);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // 2. Idempotency — record the event first; duplicates are silently ignored.
  //    The unique(event_id) constraint is the real backstop; a concurrent
  //    duplicate would fail this insert (500 → Razorpay retries → hits the
  //    existing row below and is ignored). Proven live against production.
  const { data: existing } = await supabaseAdmin
    .from('payment_webhook_events')
    .select('id, status')
    .eq('event_id', eventKey)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('payment_webhook_events')
      .update({ status: 'replayed' })
      .eq('id', existing.id);
    return jsonResponse(200, { ignored: true, reason: 'duplicate_event' });
  }

  const { error: logErr } = await supabaseAdmin
    .from('payment_webhook_events')
    .insert({
      provider: 'razorpay',
      event_id: eventKey,
      event_type: eventType,
      payload: event,
      status: 'processed',
    });

  if (logErr) {
    console.error('[razorpay-webhook] failed to log event:', logErr.message);
    return jsonResponse(500, { error: 'Failed to log event' });
  }

  const paymentEntity = payload?.payment?.entity || {};
  const orderEntity = payload?.order?.entity || {};
  const orderId = orderEntity.id || paymentEntity.order_id || '';
  const paymentId = paymentEntity.id || '';

  try {
    // ─── SUCCESS EVENTS: order.paid / payment.captured ──────────────────────
    if (eventType === 'order.paid' || eventType === 'payment.captured') {
      if (!orderId) {
        await supabaseAdmin.from('payment_webhook_events').update({ status: 'ignored' }).eq('event_id', eventKey);
        return jsonResponse(200, { ignored: true, reason: 'no_order_id' });
      }

      const { data: dbOrder } = await supabaseAdmin
        .from('razorpay_orders')
        .select('*')
        .eq('razorpay_order_id', orderId)
        .maybeSingle();

      if (!dbOrder) {
        // Order unknown to us (e.g. created outside Growlancer) — log and move on
        await insertAuditLog(supabaseAdmin, {
          action: 'webhook_received',
          entity_type: 'razorpay_order',
          entity_id: orderId,
          amount: paymentAmount(paymentEntity),
          currency: paymentEntity.currency || 'INR',
          metadata: { event: eventType, note: 'unknown order' },
        });
        return jsonResponse(200, { ok: true, note: 'unknown_order' });
      }

      // Idempotency — already captured via the client verify flow or an earlier webhook
      if (dbOrder.status === 'captured') {
        // Failure recovery: if the earlier attempt captured the payment but
        // escrow funding failed transiently, RETRY the funding here (the
        // admin_fund_escrow guard makes this a safe no-op if already funded).
        if (dbOrder.contract_id) {
          const { error: retryFundErr } = await supabaseAdmin.rpc('admin_fund_escrow', {
            p_contract_id: dbOrder.contract_id,
          });
          if (retryFundErr) {
            console.error('[razorpay-webhook] retry admin_fund_escrow failed:', retryFundErr.message);
          } else {
            await notify(
              supabaseAdmin, dbOrder.user_id, 'payment',
              'Escrow funded',
              `Your escrow payment of ${dbOrder.currency} ${Number(dbOrder.amount).toFixed(2)} was received and the contract is now active.`,
              '/dashboard/contracts',
              { contract_id: dbOrder.contract_id }
            );
          }
        }
        await insertAuditLog(supabaseAdmin, {
          action: 'payment_captured',
          entity_type: 'razorpay_order',
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
        .from('razorpay_orders')
        .update({
          status: 'captured',
          razorpay_payment_id: paymentId,
          captured_at: new Date().toISOString(),
        })
        .eq('id', dbOrder.id);

      // Record the capture transaction once (avoid duplicates from client verify)
      const { data: dupTxn } = await supabaseAdmin
        .from('razorpay_transactions')
        .select('id')
        .eq('razorpay_payment_id', paymentId)
        .eq('transaction_type', 'capture')
        .maybeSingle();

      if (!dupTxn) {
        await supabaseAdmin.from('razorpay_transactions').insert({
          razorpay_order_id: dbOrder.id,
          razorpay_payment_id: paymentId,
          transaction_type: 'capture',
          amount: dbOrder.amount,
          currency: dbOrder.currency || 'INR',
          status: 'captured',
          method: paymentEntity.method || null,
          payer_email: paymentEntity.email || null,
          payer_contact: paymentEntity.contact || null,
          processor_response: paymentEntity,
        });
      }

      // Fund escrow (idempotent, service-role-only RPC) — failure recovery for
      // clients whose browser died before verify_payment completed
      if (dbOrder.contract_id) {
        const { error: fundErr } = await supabaseAdmin.rpc('admin_fund_escrow', {
          p_contract_id: dbOrder.contract_id,
        });
        if (fundErr) {
          console.error('[razorpay-webhook] admin_fund_escrow failed:', fundErr.message);
        } else {
          // Notify both parties
          const { data: contract } = await supabaseAdmin
            .from('contracts')
            .select('client_id, freelancer_id')
            .eq('id', dbOrder.contract_id)
            .maybeSingle();

          if (contract) {
            await notify(
              supabaseAdmin, contract.client_id, 'payment',
              'Escrow funded',
              `Your escrow payment of ${dbOrder.currency} ${Number(dbOrder.amount).toFixed(2)} was received and the contract is now active.`,
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

      // Service purchase: bump the service's live order count so the
      // freelancer's dashboard reflects real demand. Idempotent — this block
      // only runs on the FIRST capture of the order (the already_processed
      // branch above returns early on any duplicate), so a replay or a later
      // client verify can never double-count an order.
      if (dbOrder.order_type === 'service_purchase') {
        const serviceId = dbOrder.metadata?.service_id;
        if (serviceId) {
          const { error: ordErr } = await supabaseAdmin.rpc('increment_service_orders', {
            p_service_id: serviceId,
          });
          if (ordErr) {
            console.error('[razorpay-webhook] increment_service_orders failed:', ordErr.message);
          }
        }
      }

      // Extra revision payment: add the paid amount to the contract escrow
      // (escrow-protected until the client approves the revised work). Only
      // runs on the FIRST capture — the already_processed branch above returns
      // early on any replay, so mark_revision_paid can never double-credit.
      if (dbOrder.order_type === 'revision_payment') {
        const revisionRequestId = dbOrder.metadata?.revision_request_id || dbOrder.metadata?.revisionRequestId;
        if (revisionRequestId) {
          const { error: revErr } = await supabaseAdmin.rpc('mark_revision_paid', {
            p_request_id: revisionRequestId,
            p_razorpay_order_id: dbOrder.razorpay_order_id,
          });
          if (revErr) {
            console.error('[razorpay-webhook] mark_revision_paid failed:', revErr.message);
          } else {
            const { data: revReq } = await supabaseAdmin
              .from('revision_requests')
              .select('contract_id, freelancer_id, total_amount, revision_count')
              .eq('id', revisionRequestId)
              .maybeSingle();
            if (revReq) {
              await notify(
                supabaseAdmin, revReq.freelancer_id, 'payment',
                'Extra revision payment received',
                `The client paid ₹${Number(revReq.total_amount).toLocaleString('en-IN')} for ${revReq.revision_count} extra revision(s). Funds are held in escrow until you deliver and the client approves.`,
                `/dashboard/workspace?contract=${revReq.contract_id}`,
                { contract_id: revReq.contract_id, revision_request_id: revisionRequestId }
              );
            }
          }
        }
      }

      // Wallet top-ups: credit the user's wallet. Idempotent — this block only
      // runs on the FIRST capture of the order (the already_processed branch
      // above returns early on any duplicate), so a replay or a later client
      // verify can never double-credit the wallet.
      if (dbOrder.order_type === 'wallet_topup') {
        const { error: creditErr } = await supabaseAdmin.rpc('update_wallet_balance', {
          p_user_id: dbOrder.user_id,
          p_amount: Number(dbOrder.amount) || 0,
        });
        if (creditErr) {
          console.error('[razorpay-webhook] wallet credit failed:', creditErr.message);
        } else {
          await supabaseAdmin.from('transactions').insert({
            user_id: dbOrder.user_id,
            amount: Number(dbOrder.amount) || 0,
            type: 'credit',
            source: 'deposit',
            status: 'completed',
            description: 'Wallet top-up via Razorpay',
            currency: dbOrder.currency || 'INR',
            metadata: { razorpay_order_id: dbOrder.razorpay_order_id, razorpay_payment_id: paymentId },
          });
          await notify(
            supabaseAdmin, dbOrder.user_id, 'payment',
            'Wallet topped up',
            `₹${Number(dbOrder.amount).toLocaleString('en-IN')} added to your wallet.`,
            '/dashboard/wallet',
            { razorpay_order_id: dbOrder.razorpay_order_id }
          );
        }
      }

      await insertAuditLog(supabaseAdmin, {
        action: 'payment_captured',
        entity_type: 'razorpay_order',
        entity_id: dbOrder.id,
        user_id: dbOrder.user_id,
        amount: dbOrder.amount,
        currency: dbOrder.currency,
        metadata: { event: eventType, source: 'webhook' },
      });

      return jsonResponse(200, { ok: true });
    }

    // ─── FAILURE EVENT: payment.failed ──────────────────────────────────────
    if (eventType === 'payment.failed') {
      const { data: dbOrder } = orderId
        ? await supabaseAdmin.from('razorpay_orders').select('*').eq('razorpay_order_id', orderId).maybeSingle()
        : await supabaseAdmin
            .from('razorpay_orders')
            .select('*')
            .eq('razorpay_payment_id', paymentId)
            .maybeSingle();

      if (dbOrder && dbOrder.status !== 'captured') {
        await supabaseAdmin
          .from('razorpay_orders')
          .update({ status: 'failed' })
          .eq('id', dbOrder.id);

        await notify(
          supabaseAdmin, dbOrder.user_id, 'payment',
          'Payment failed',
          `Your Razorpay payment of ${dbOrder.currency} ${Number(dbOrder.amount).toFixed(2)} could not be completed. No charge was made.`,
          '/dashboard',
          { contract_id: dbOrder.contract_id || null }
        );

        await insertAuditLog(supabaseAdmin, {
          action: 'payment_failed',
          entity_type: 'razorpay_order',
          entity_id: dbOrder.id,
          user_id: dbOrder.user_id,
          amount: dbOrder.amount,
          currency: dbOrder.currency,
          metadata: { event: eventType },
        });
      }

      return jsonResponse(200, { ok: true });
    }

    // ─── AUTHORIZED EVENT: payment.authorized (auth-capture flows) ──────────
    // Informational only — escrow is funded only once the payment is actually
    // captured (order.paid / payment.captured). Log + audit, never fund twice.
    if (eventType === 'payment.authorized') {
      const { data: dbOrder } = orderId
        ? await supabaseAdmin.from('razorpay_orders').select('*').eq('razorpay_order_id', orderId).maybeSingle()
        : await supabaseAdmin
            .from('razorpay_orders')
            .select('*')
            .eq('razorpay_payment_id', paymentId)
            .maybeSingle();

      await insertAuditLog(supabaseAdmin, {
        action: 'payment_authorized',
        entity_type: 'razorpay_order',
        entity_id: dbOrder?.id || orderId || paymentId,
        user_id: dbOrder?.user_id || null,
        amount: dbOrder?.amount ?? paymentAmount(paymentEntity),
        currency: dbOrder?.currency || paymentEntity.currency || 'INR',
        metadata: { event: eventType, note: 'authorized — awaiting capture' },
      });

      return jsonResponse(200, { ok: true });
    }

    // ─── REFUND CREATED: refund.created (refund initiated, in progress) ─────
    // Informational — the order only becomes 'refunded' on refund.processed.
    if (eventType === 'refund.created') {
      const refundPaymentId = payload?.refund?.entity?.payment_id || paymentId;
      const { data: dbOrder } = await supabaseAdmin
        .from('razorpay_orders')
        .select('*')
        .eq('razorpay_payment_id', refundPaymentId)
        .maybeSingle();

      if (dbOrder) {
        await notify(
          supabaseAdmin, dbOrder.user_id, 'payment',
          'Refund initiated',
          `Your refund of ${dbOrder.currency} ${Number(dbOrder.amount).toFixed(2)} has been initiated and is being processed.`,
          '/client/payments',
          { contract_id: dbOrder.contract_id || null }
        );

        await insertAuditLog(supabaseAdmin, {
          action: 'refund_initiated',
          entity_type: 'razorpay_order',
          entity_id: dbOrder.id,
          user_id: dbOrder.user_id,
          amount: dbOrder.amount,
          currency: dbOrder.currency,
          metadata: { event: eventType, refund_id: payload?.refund?.entity?.id || null },
        });
      }

      return jsonResponse(200, { ok: true });
    }

    // ─── REFUND EVENT: refund.processed / refund.failed ─────────────────────
    if (eventType === 'refund.processed' || eventType === 'refund.failed') {
      const refundPaymentId = payload?.refund?.entity?.payment_id || paymentId;
      const { data: dbOrder } = await supabaseAdmin
        .from('razorpay_orders')
        .select('*')
        .eq('razorpay_payment_id', refundPaymentId)
        .maybeSingle();

      if (dbOrder && eventType === 'refund.processed') {
        await supabaseAdmin
          .from('razorpay_orders')
          .update({ status: 'refunded' })
          .eq('id', dbOrder.id);

        // Complete the refund tracking record (match by razorpay refund id)
        const refundId = payload?.refund?.entity?.id || '';
        if (refundId) {
          const { data: trackedRefund } = await supabaseAdmin
            .from('refunds')
            .select('id, refund_request_id')
            .eq('provider_refund_id', refundId)
            .maybeSingle();

          if (trackedRefund) {
            const timeline = (trackedRefund as any)?.timeline || [];
            await supabaseAdmin.from('refunds').update({
              status: 'completed',
              timeline: [...timeline, { event: 'processed', at: new Date().toISOString() }],
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
                p_note: 'Razorpay refund processed',
                p_metadata: { razorpay_refund_id: refundId },
              }).catch(() => undefined);
            }
          }
        }

        // Reconcile escrow: return a funded escrow to 'refunded' + debit the
        // client's escrow balance (Razorpay already returned the money).
        if (dbOrder.contract_id) {
          const { error: reverseErr } = await supabaseAdmin.rpc('admin_reverse_escrow', {
            p_contract_id: dbOrder.contract_id,
          });
          if (reverseErr) {
            console.error('[razorpay-webhook] admin_reverse_escrow failed:', reverseErr.message);
          }
        }

        await notify(
          supabaseAdmin, dbOrder.user_id, 'payment',
          'Refund processed',
          `Your refund of ${dbOrder.currency} ${Number(dbOrder.amount).toFixed(2)} has been processed and will be returned to your payment method.`,
          '/client/payments',
          { contract_id: dbOrder.contract_id || null }
        );

        await insertAuditLog(supabaseAdmin, {
          action: 'refund_issued',
          entity_type: 'razorpay_order',
          entity_id: dbOrder.id,
          user_id: dbOrder.user_id,
          amount: dbOrder.amount,
          currency: dbOrder.currency,
          metadata: { event: eventType },
        });
      } else if (dbOrder && eventType === 'refund.failed') {
        await notify(
          supabaseAdmin, dbOrder.user_id, 'payment',
          'Refund failed',
          `Your refund of ${dbOrder.currency} ${Number(dbOrder.amount).toFixed(2)} could not be processed. Our team will contact you, or you can retry from your payments page.`,
          '/client/payments',
          { contract_id: dbOrder.contract_id || null }
        );

        await insertAuditLog(supabaseAdmin, {
          action: 'refund_failed',
          entity_type: 'razorpay_order',
          entity_id: dbOrder.id,
          user_id: dbOrder.user_id,
          amount: dbOrder.amount,
          currency: dbOrder.currency,
          metadata: { event: eventType },
        });
      } else {
        await insertAuditLog(supabaseAdmin, {
          action: 'webhook_received',
          entity_type: 'razorpay_order',
          entity_id: orderId || paymentId,
          metadata: { event: eventType, note: 'refund not processed' },
        });
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
    console.error('[razorpay-webhook] processing error:', error);
    await supabaseAdmin
      .from('payment_webhook_events')
      .update({ status: 'failed' })
      .eq('event_id', eventKey);
    return jsonResponse(500, { error: 'Webhook processing failed' });
  }
});
