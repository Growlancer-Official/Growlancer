// ═══════════════════════════════════════════════════════════════════════════
// milestone-auto-release — delivery-based auto-release cron
//
// Runs HOURLY via pg_cron → pg_net with a CRON_SECRET bearer token.
//
// 1. SCAN: finds contracts with milestones in 'delivered' state whose
//    (now - delivered_at) >= auto_release_hours and contract.status !=
//    'disputed'/'frozen'.
// 2. RELEASE: calls the service-role-only auto_release_milestone RPC, which
//    re-verifies the elapsed window in SQL (defense in depth) and releases the
//    milestone — or the whole escrow when it was the last milestone.
// 3. REMIND: for delivered milestones with 0 < remaining <= 12h until
//    auto-release, sends the client an in-app notification + email
//    ("Review pending — auto-release in X hours") exactly once (deduped by
//    notification metadata).
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { sendEmail } from '../_shared/brevo.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Accepts the env CRON_SECRET or the DB cron_settings.cron_secret row, so a
// secret rotation that updates only one side can never silently break the
// cron again (either match authorizes the call).
async function isValidCronSecret(bearer: string): Promise<boolean> {
  if (CRON_SECRET && bearer === CRON_SECRET) return true;
  try {
    const { data } = await supabase
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmailSafe(params: { to: string; toName: string; subject: string; htmlBody: string }): Promise<void> {
  void params.toName;
  try {
    await sendEmail({ to: params.to, subject: params.subject, html: params.htmlBody });
  } catch (err) {
    console.error('milestone-auto-release email error:', err);
  }
}

serve(async (req: Request) => {
  // ── Cron auth: CRON_SECRET bearer (same pattern as razorpay execute_refund)
  const authHeader = req.headers.get('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!bearer || !(await isValidCronSecret(bearer))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results: string[] = [];
  try {
    const now = Date.now();

    // ── 1. Find contracts with delivered milestones ─────────────────────
    // Fetch candidate contracts (milestones JSONB scanned in SQL for accuracy).
    // Also includes milestone-less contracts that carry a contract-level
    // delivered_at (full-contract auto-release).
    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select('id, client_id, freelancer_id, status, frozen_at, milestones, delivered_at, auto_release_hours')
      .in('status', ['active', 'in_progress', 'submitted', 'approved', 'revision_requested']);

    if (contractsError) throw new Error(`Failed to load contracts: ${contractsError.message}`);

    const eligible: Array<{ contractId: string; index: number }> = [];
    const reminders: Array<{
      contractId: string;
      index: number;
      title: string;
      hoursLeft: number;
      clientId: string;
      freelancerName: string;
    }> = [];

    const fullContractEligible: Array<{ contractId: string }> = [];
    const fullContractReminders: Array<{
      contractId: string;
      hoursLeft: number;
      clientId: string;
    }> = [];

    for (const c of contracts || []) {
      if (c.status === 'disputed' || c.frozen_at) continue;

      // Milestone-less (full contract) delivery: contract-level delivered_at.
      if (!Array.isArray(c.milestones) || c.milestones.length === 0) {
        if (c.delivered_at) {
          const deliveredAt = new Date(c.delivered_at).getTime();
          if (!Number.isFinite(deliveredAt)) continue;

          const hours = Number(c.auto_release_hours) > 0 ? Number(c.auto_release_hours) : 72;
          const elapsedH = (now - deliveredAt) / 3600000;

          if (elapsedH >= hours) {
            fullContractEligible.push({ contractId: c.id });
          } else {
            const hoursLeft = hours - elapsedH;
            if (hoursLeft <= 12 && hoursLeft > 0) {
              fullContractReminders.push({ contractId: c.id, hoursLeft, clientId: c.client_id });
            }
          }
        }
        continue;
      }

      c.milestones.forEach((m: any, idx: number) => {
        if (m?.status !== 'delivered' || !m.delivered_at) return;

        const deliveredAt = new Date(m.delivered_at).getTime();
        if (!Number.isFinite(deliveredAt)) return;

        const hours = Number(m.auto_release_hours) > 0 ? Number(m.auto_release_hours) : 72;
        const elapsedH = (now - deliveredAt) / 3600000;

        // Due → auto-release now
        if (elapsedH >= hours) {
          eligible.push({ contractId: c.id, index: idx });
        } else {
          // Reminder window: last 12 hours before auto-release
          const hoursLeft = hours - elapsedH;
          if (hoursLeft <= 12 && hoursLeft > 0) {
            reminders.push({
              contractId: c.id,
              index: idx,
              title: m.title || 'a milestone',
              hoursLeft,
              clientId: c.client_id,
              freelancerName: 'your freelancer',
            });
          }
        }
      });
    }

    // ── 2. Auto-release due milestones ───────────────────────────────────
    let released = 0;
    for (const { contractId, index } of eligible) {
      const { data, error } = await supabase.rpc('auto_release_milestone', {
        p_contract_id: contractId,
        p_milestone_index: index,
      });
      const result = data as { success?: boolean; message?: string; error?: string } | null;
      if (error || !result?.success) {
        results.push(`SKIP ${contractId.slice(0, 8)}:${index} — ${result?.error || error?.message}`);
      } else {
        released++;
        results.push(`RELEASE ${contractId.slice(0, 8)}:${index} — ${result.message}`);
      }
    }

    // ── 2b. Auto-release due full contracts (milestone-less) ─────────────
    let fullReleased = 0;
    for (const { contractId } of fullContractEligible) {
      const { data, error } = await supabase.rpc('auto_release_contract', {
        p_contract_id: contractId,
      });
      const result = data as { success?: boolean; message?: string; error?: string } | null;
      if (error || !result?.success) {
        results.push(`SKIP-FULL ${contractId.slice(0, 8)} — ${result?.error || error?.message}`);
      } else {
        fullReleased++;
        results.push(`RELEASE-FULL ${contractId.slice(0, 8)} — ${result.message}`);
      }
    }

    // ── 3. Send 12h-before reminders (deduped) ───────────────────────────
    let remindersSent = 0;

    // Full-contract reminders (milestone-less).
    for (const r of fullContractReminders) {
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', r.clientId)
        .eq('type', 'milestone')
        .eq('metadata->>event', 'auto_release_reminder')
        .eq('metadata->>contract_id', r.contractId)
        .maybeSingle();
      if (existing) continue;

      const hoursLeftRound = Math.max(1, Math.round(r.hoursLeft));
      const actionUrl = `/client/workspace?contract=${r.contractId}`;

      await supabase.from('notifications').insert({
        user_id: r.clientId,
        type: 'milestone',
        title: `Review pending — auto-release in ~${hoursLeftRound}h`,
        message: `The freelancer delivered the full project. If you don't review and release within ~${hoursLeftRound} hours, the escrow payment will be released automatically.`,
        action_url: actionUrl,
        metadata: {
          contract_id: r.contractId,
          event: 'auto_release_reminder',
        },
      });

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('id', r.clientId)
        .maybeSingle();

      if (profile?.email) {
        await sendEmailSafe({
          to: profile.email,
          toName: profile.name || 'there',
          subject: `Review pending — auto-release in ~${hoursLeftRound}h`,
          htmlBody: `<p>Hi ${escapeHtml(profile.name || 'there')},</p>
            <p>The freelancer delivered the full project on your contract.</p>
            <p>If you do not review and release the payment within the next <strong>~${hoursLeftRound} hours</strong>,
            the escrow will be released to the freelancer automatically.</p>
            <p><a href="https://growlancer.com${actionUrl}" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Review in Workspace</a></p>
            <p style="color:#94a3b8;font-size:12px">You can adjust the auto-release window (24h–7 days) anytime in the contract workspace.</p>`,
        });
      }

      remindersSent++;
    }

    for (const r of reminders) {
      // Dedup: only if no reminder notification exists for this contract+index.
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', r.clientId)
        .eq('type', 'milestone')
        .eq('metadata->>event', 'auto_release_reminder')
        .eq('metadata->>contract_id', r.contractId)
        .eq('metadata->>milestone_index', String(r.index))
        .maybeSingle();

      if (existing) continue;

      const hoursLeftRound = Math.max(1, Math.round(r.hoursLeft));
      const actionUrl = `/client/workspace?contract=${r.contractId}`;

      await supabase.from('notifications').insert({
        user_id: r.clientId,
        type: 'milestone',
        title: `Review pending — auto-release in ~${hoursLeftRound}h`,
        message: `The freelancer delivered "${r.title}". If you don't review and release within ~${hoursLeftRound} hours, the escrow payment will be released automatically.`,
        action_url: actionUrl,
        metadata: {
          contract_id: r.contractId,
          milestone_index: r.index,
          event: 'auto_release_reminder',
        },
      });

      // Email the client too (they may not be in-app).
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, name')
        .eq('id', r.clientId)
        .maybeSingle();

      if (profile?.email) {
        await sendEmailSafe({
          to: profile.email,
          toName: profile.name || 'there',
          subject: `Review pending — auto-release in ~${hoursLeftRound}h`,
          htmlBody: `<p>Hi ${escapeHtml(profile.name || 'there')},</p>
            <p>The freelancer delivered <strong>"${escapeHtml(r.title)}"</strong> on your contract.</p>
            <p>If you do not review and release the payment within the next <strong>~${hoursLeftRound} hours</strong>,
            the escrow will be released to the freelancer automatically.</p>
            <p><a href="https://growlancer.com${actionUrl}" style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Review in Workspace</a></p>
            <p style="color:#94a3b8;font-size:12px">You can adjust the auto-release window (24h–7 days) anytime in the contract workspace.</p>`,
        });
      }

      remindersSent++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Milestone auto-release cron completed',
        scanned: (contracts || []).length,
        released,
        full_released: fullReleased,
        reminders_sent: remindersSent,
        results,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('milestone-auto-release cron failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        results,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
