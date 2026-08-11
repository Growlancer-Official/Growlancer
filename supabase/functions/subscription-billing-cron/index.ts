// Subscription Billing Cron
// Converts trial subscriptions to paid, renews active subscriptions with a REAL
// charge against the user's saved payment method (never a silent free renewal),
// and sends reminders.
//
// Secured with CRON_SECRET (Bearer token) — random authenticated users cannot
// invoke this; only pg_cron → pg_net with the shared secret can.
//
// Scheduled via pg_cron daily at 00:00 UTC.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { sendEmail } from '../_shared/brevo.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || '';
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendBillingEmail(params: {
  to: string;
  toName: string;
  subject: string;
  htmlBody: string;
}): Promise<boolean> {
  void params.toName;
  return sendEmail({ to: params.to, subject: params.subject, html: params.htmlBody });
}

// ── REAL renewal charge via Razorpay saved-card token ────────────────────────
// Charges the user's default saved payment card. Returns the charge outcome.
async function attemptRenewalCharge(
  userId: string,
  amountInr: number
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  // No saved payment method or no gateway keys → cannot charge → fail loudly
  // (the caller marks the subscription past_due; never silently renews).
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return { success: false, error: 'Payment gateway not configured for automatic renewal' };
  }

  // Prefer the default card; fall back to the most recently used one.
  const { data: card } = await supabase
    .from('saved_payment_cards')
    .select('card_id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  const cardToken = card?.card_id;

  let token = cardToken;
  if (!token) {
    const { data: anyCard } = await supabase
      .from('saved_payment_cards')
      .select('card_id')
      .eq('user_id', userId)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    token = anyCard?.card_id;
  }

  if (!token) {
    return { success: false, error: 'No saved payment method found for automatic renewal' };
  }

  try {
    // Razorpay token payment: charge the saved card directly (server-side).
    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
    const response = await fetch('https://api.razorpay.com/v1/payments/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: Math.round(amountInr * 100),
        currency: 'INR',
        token: { card: { token_id: token } },
        description: 'Growlancer Pro subscription renewal',
        notes: { user_id: userId, purpose: 'subscription_renewal' },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: `Razorpay charge failed: ${data?.error?.description || data?.error?.code || response.status}` };
    }

    // Payment created — capture it if needed, or consider it done if paid.
    if (data.status === 'paid' || data.status === 'captured') {
      // Increment usage count properly (keeps most-recently-used fallback meaningful)
      const { data: usedRow } = await supabase
        .from('saved_payment_cards')
        .select('used_count')
        .eq('user_id', userId)
        .eq('card_id', token)
        .maybeSingle();
      await supabase.from('saved_payment_cards').update({
        used_count: Number(usedRow?.used_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('card_id', token);
      return { success: true, paymentId: data.id };
    }

    // authorized → capture
    if (data.status === 'authorized' && data.id) {
      const cap = await fetch(`https://api.razorpay.com/v1/payments/${data.id}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        body: JSON.stringify({ amount: Math.round(amountInr * 100), currency: 'INR' }),
      });
      const capData = await cap.json();
      if (!cap.ok) {
        return { success: false, error: `Razorpay capture failed: ${capData?.error?.description || cap.status}` };
      }
      return { success: true, paymentId: data.id };
    }

    return { success: false, error: `Razorpay charge not completed (status: ${data.status})` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Renewal charge failed' };
  }
}

serve(async (req: Request) => {
  // ── Cron auth: CRON_SECRET bearer (same pattern as razorpay execute_refund)
  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!CRON_SECRET || bearer !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('Subscription billing cron started');
    const now = new Date().toISOString();
    const results: string[] = [];

    // 1. Process trial subscriptions that have expired
    const { data: expiredTrials, error: trialError } = await supabase
      .from('subscriptions')
      .select('*, profiles!inner(email, name), subscription_plans!inner(price, trial_days, name)')
      .eq('status', 'trial')
      .lt('trial_end_date', now);

    if (trialError) console.error('Error fetching expired trials:', trialError);

    if (expiredTrials) {
      for (const sub of expiredTrials) {
        try {
          const userEmail = (sub.profiles as any)?.email;
          const userName = (sub.profiles as any)?.name || 'User';
          const planName = (sub.subscription_plans as any)?.name || 'Pro';
          const price = Number((sub.subscription_plans as any)?.price) || 0;

          // Check if user cancelled during trial
          if (sub.cancel_at_period_end) {
            await supabase
              .from('subscriptions')
              .update({ status: 'cancelled', updated_at: now })
              .eq('id', sub.id);

            await sendBillingEmail({
              to: userEmail,
              toName: userName,
              subject: `Your ${planName} trial has ended`,
              htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
                <p>Your <strong>${escapeHtml(planName)}</strong> trial has ended. Since you cancelled during the trial period, your plan has been expired.</p>
                <p>You can re-subscribe anytime from your account settings.</p>`,
            });
            results.push(`Trial cancelled: ${sub.id}`);
            continue;
          }

          // Convert: attempt a REAL first charge on the saved card. Only a
          // successful charge upgrades the subscription to active.
          const charge = await attemptRenewalCharge(sub.user_id, price);

          if (charge.success) {
            const newEnd = new Date();
            newEnd.setMonth(newEnd.getMonth() + 1);
            await supabase
              .from('subscriptions')
              .update({
                status: 'active',
                subscription_start_date: now,
                subscription_end_date: newEnd.toISOString(),
                updated_at: now,
              })
              .eq('id', sub.id);

            await supabase.from('transactions').insert({
              user_id: sub.user_id,
              amount: price,
              type: 'debit',
              source: 'subscription',
              status: 'completed',
              description: `${planName} subscription (trial → paid)`,
              currency: 'INR',
              metadata: { subscription_id: sub.id, razorpay_payment_id: charge.paymentId },
            });

            await sendBillingEmail({
              to: userEmail,
              toName: userName,
              subject: `Your ${planName} subscription is now active`,
              htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
                <p>Your <strong>${escapeHtml(planName)}</strong> trial has ended and your paid subscription is now active.</p>
                <p>You were charged ₹${price} via your saved payment method.</p>`,
            });
            results.push(`Trial converted to paid: ${sub.id}`);
          } else {
            // No card / charge failed → past_due, never a silent free renewal.
            await supabase
              .from('subscriptions')
              .update({ status: 'past_due', updated_at: now })
              .eq('id', sub.id);

            await sendBillingEmail({
              to: userEmail,
              toName: userName,
              subject: `Your ${planName} trial has ended — action required`,
              htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
                <p>Your <strong>${escapeHtml(planName)}</strong> trial has ended. We tried to charge your saved payment method but it could not be completed (${escapeHtml(charge.error || 'no payment method on file')}).</p>
                <p>Please add or update your payment method to keep using Pro features.</p>
                <p><a href="https://growlancer.com/dashboard/subscription" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Resume Subscription</a></p>
                <p style="color:#94a3b8;font-size:12px">Your subscription is paused until payment is completed.</p>`,
            });
            results.push(`Trial expired → past_due (${charge.error}): ${sub.id}`);
          }
        } catch (err) {
          console.error(`Error processing trial ${sub.id}:`, err);
          results.push(`Error processing trial ${sub.id}: ${err}`);
        }
      }
    }

    // 2. Send trial ending reminders (2 days before expiry)
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + 2);
    const reminderEnd = reminderDate.toISOString().split('T')[0];

    const { data: upcomingExpiry } = await supabase
      .from('subscriptions')
      .select('*, profiles!inner(email, name), subscription_plans!inner(name, trial_days)')
      .eq('status', 'trial')
      .gte('trial_end_date', reminderEnd + 'T00:00:00')
      .lt('trial_end_date', reminderEnd + 'T23:59:59');

    if (upcomingExpiry) {
      for (const sub of upcomingExpiry) {
        const userEmail = (sub.profiles as any)?.email;
        const userName = (sub.profiles as any)?.name || 'User';
        const planName = (sub.subscription_plans as any)?.name || 'Pro';

        await sendBillingEmail({
          to: userEmail,
          toName: userName,
          subject: `Your ${planName} trial ends in 2 days`,
          htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
            <p>Your <strong>${escapeHtml(planName)}</strong> trial is ending in <strong>2 days</strong>.</p>
            <p>After the trial, your subscription will continue on a paid plan and your saved payment method will be charged. If you'd like to cancel, you can do so from your account settings.</p>
            <p><a href="https://growlancer.com/dashboard/subscription" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Manage Subscription</a></p>`,
        });
        results.push(`Reminder sent: ${sub.id}`);
      }
    }

    // 3. Process active subscriptions nearing renewal (REAL charge, schema-correct)
    const renewalWindowStart = new Date();
    const renewalWindowEnd = new Date();
    renewalWindowEnd.setDate(renewalWindowEnd.getDate() + 1);

    const { data: renewingSubs } = await supabase
      .from('subscriptions')
      .select('*, profiles!inner(email, name), subscription_plans!inner(price, name)')
      .eq('status', 'active')
      .gte('subscription_end_date', renewalWindowStart.toISOString())
      .lt('subscription_end_date', renewalWindowEnd.toISOString());

    if (renewingSubs) {
      for (const sub of renewingSubs) {
        const userEmail = (sub.profiles as any)?.email;
        const userName = (sub.profiles as any)?.name || 'User';
        const planName = (sub.subscription_plans as any)?.name || 'Pro';
        const price = Number((sub.subscription_plans as any)?.price) || 0;

        if (sub.cancel_at_period_end) {
          // User cancelled — expire it
          await supabase
            .from('subscriptions')
            .update({ status: 'cancelled', updated_at: now })
            .eq('id', sub.id);

          await sendBillingEmail({
            to: userEmail,
            toName: userName,
            subject: `Your ${planName} subscription has ended`,
            htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
              <p>Your <strong>${escapeHtml(planName)}</strong> subscription has ended as requested.</p>
              <p>You can re-subscribe anytime from your account settings.</p>`,
          });
          results.push(`Sub expired (cancelled): ${sub.id}`);
          continue;
        }

        // Attempt a REAL renewal charge against the saved card.
        const charge = await attemptRenewalCharge(sub.user_id, price);

        if (charge.success) {
          const newEnd = new Date();
          newEnd.setMonth(newEnd.getMonth() + 1);
          await supabase
            .from('subscriptions')
            .update({
              subscription_start_date: now,
              subscription_end_date: newEnd.toISOString(),
              updated_at: now,
            })
            .eq('id', sub.id);

          await supabase.from('transactions').insert({
            user_id: sub.user_id,
            amount: price,
            type: 'debit',
            source: 'subscription',
            status: 'completed',
            description: `${planName} subscription renewal`,
            currency: 'INR',
            metadata: { subscription_id: sub.id, razorpay_payment_id: charge.paymentId },
          });

          await sendBillingEmail({
            to: userEmail,
            toName: userName,
            subject: `Your ${planName} subscription renewed`,
            htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
              <p>Your <strong>${escapeHtml(planName)}</strong> subscription (₹${price}/mo) has been renewed.</p>
              <p>You were charged ₹${price} via your saved payment method. Your access continues uninterrupted.</p>
              <p><a href="https://growlancer.com/dashboard/subscription" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">View Subscription</a></p>`,
          });
          results.push(`Sub renewed (charged ₹${price}): ${sub.id}`);
        } else {
          // Charge failed → past_due + notify. NEVER silently free-renew.
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due', updated_at: now })
            .eq('id', sub.id);

          await sendBillingEmail({
            to: userEmail,
            toName: userName,
            subject: `Your ${planName} subscription is past due`,
            htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
              <p>We attempted to renew your <strong>${escapeHtml(planName)}</strong> subscription (₹${price}/mo) but the charge could not be completed (${escapeHtml(charge.error || 'payment failed')}).</p>
              <p>Your Pro features are paused until the payment succeeds. Please update your payment method and retry.</p>
              <p><a href="https://growlancer.com/dashboard/subscription" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Update Payment Method</a></p>`,
          });
          results.push(`Sub past_due (${charge.error}): ${sub.id}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Subscription billing cron completed',
      results,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Subscription billing cron failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
