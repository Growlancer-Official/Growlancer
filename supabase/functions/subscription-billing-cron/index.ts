// Subscription Billing Cron
// Converts trial subscriptions to paid, renews active subscriptions, sends reminders
// Scheduled via pg_cron daily

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Email service removed (Brevo) — Growlancer uses Supabase Auth built-in sender for verification emails.

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmail(params: {
  to: string;
  toName: string;
  subject: string;
  htmlBody: string;
}): Promise<boolean> {
  // Email sending disabled — Brevo completely removed. Returns false (not sent).
  console.log('[subscription-billing-cron] Email sending disabled (Brevo removed):', params.subject)
  return false
}

serve(async () => {
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

          // Check if user cancelled during trial
          if (sub.cancel_at_period_end) {
            // Just expire the trial
            await supabase
              .from('subscriptions')
              .update({ status: 'cancelled', updated_at: now })
              .eq('id', sub.id);

            await sendEmail({
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

          // Try to convert — since real payment via Razorpay/PayPal happens client-side,
          // mark as past_due and notify user to set up payment
          await supabase
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: now,
            })
            .eq('id', sub.id);

          await sendEmail({
            to: userEmail,
            toName: userName,
            subject: `Your ${planName} trial has ended — action required`,
            htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
              <p>Your <strong>${escapeHtml(planName)}</strong> trial has ended. To continue using Pro features, please set up your payment method.</p>
              <p><a href="https://growlancer.com/dashboard/subscription" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Resume Subscription</a></p>
              <p style="color:#94a3b8;font-size:12px">Your subscription will be paused until payment is completed.</p>`,
          });
          results.push(`Trial expired → past_due: ${sub.id}`);
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

        await sendEmail({
          to: userEmail,
          toName: userName,
          subject: `Your ${planName} trial ends in 2 days`,
          htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
            <p>Your <strong>${escapeHtml(planName)}</strong> trial is ending in <strong>2 days</strong>.</p>
            <p>After the trial, your subscription will continue on a paid plan. If you'd like to cancel, you can do so from your account settings.</p>
            <p><a href="https://growlancer.com/dashboard/subscription" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Manage Subscription</a></p>`,
        });
        results.push(`Reminder sent: ${sub.id}`);
      }
    }

    // 3. Process active subscriptions nearing renewal
    const renewalWindowStart = new Date();
    const renewalWindowEnd = new Date();
    renewalWindowEnd.setDate(renewalWindowEnd.getDate() + 1);

    const { data: renewingSubs } = await supabase
      .from('subscriptions')
      .select('*, profiles!inner(email, name), subscription_plans!inner(price, name)')
      .eq('status', 'active')
      .gte('current_period_end', renewalWindowStart.toISOString())
      .lt('current_period_end', renewalWindowEnd.toISOString());

    if (renewingSubs) {
      for (const sub of renewingSubs) {
        const userEmail = (sub.profiles as any)?.email;
        const userName = (sub.profiles as any)?.name || 'User';
        const planName = (sub.subscription_plans as any)?.name || 'Pro';
        const price = (sub.subscription_plans as any)?.price || 0;

        if (sub.cancel_at_period_end) {
          // User cancelled — expire it
          await supabase
            .from('subscriptions')
            .update({ status: 'cancelled', ended_at: now, updated_at: now })
            .eq('id', sub.id);

          await sendEmail({
            to: userEmail,
            toName: userName,
            subject: `Your ${planName} subscription has ended`,
            htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
              <p>Your <strong>${escapeHtml(planName)}</strong> subscription has ended as requested.</p>
              <p>You can re-subscribe anytime from your account settings.</p>`,
          });
          results.push(`Sub expired (cancelled): ${sub.id}`);
        } else {
          // Send renewal notice
          await sendEmail({
            to: userEmail,
            toName: userName,
            subject: `Your ${planName} subscription is renewing`,
            htmlBody: `<p>Hi ${escapeHtml(userName)},</p>
              <p>Your <strong>${escapeHtml(planName)}</strong> subscription (₹${price}/mo) is renewing today.</p>
              <p>No action needed — your access continues uninterrupted.</p>
              <p><a href="https://growlancer.com/dashboard/subscription" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">View Subscription</a></p>`,
          });

          // Update period
          const newEnd = new Date();
          newEnd.setMonth(newEnd.getMonth() + 1);
          await supabase
            .from('subscriptions')
            .update({
              current_period_start: now,
              current_period_end: newEnd.toISOString(),
              updated_at: now,
            })
            .eq('id', sub.id);

          results.push(`Sub renewed: ${sub.id}`);
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
