// Subscription Billing Cron
// Converts trial subscriptions to paid, renews active subscriptions, sends reminders
// Scheduled via pg_cron daily

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;
const BREVO_FROM_EMAIL = Deno.env.get('BREVO_FROM_EMAIL') || 'growlancer.own@gmail.com';
const BREVO_FROM_NAME = 'Growlancer';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function baseEmailHtml(body: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <tr><td style="padding:32px 32px 16px;text-align:center;background:linear-gradient(135deg,#059669,#047857)">
          <img src="https://zttwsjehcgaicziqyxpq.supabase.co/storage/v1/object/public/avatars/growlancer-logo.png" alt="Growlancer" style="height:40px;margin-bottom:8px" />
          <h1 style="color:#fff;font-size:20px;margin:0">Growlancer</h1>
        </td></tr>
        <tr><td style="padding:32px;color:#334155;font-size:14px;line-height:1.6">
          ${body}
        </td></tr>
        <tr><td style="padding:24px 32px;background:#f1f5f9;text-align:center;font-size:12px;color:#94a3b8">
          Growlancer &mdash; India's Freelance Marketplace<br>
          Need help? Contact support@growlancer.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendEmail(params: {
  to: string;
  toName: string;
  subject: string;
  htmlBody: string;
}): Promise<boolean> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
        to: [{ email: params.to, name: params.toName }],
        subject: params.subject,
        htmlContent: baseEmailHtml(params.htmlBody),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
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
