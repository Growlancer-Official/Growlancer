// ═══════════════════════════════════════════════════════════════════════
// Shared Resend email sender for all Growlancer edge functions.
//
// Reads RESEND_API_KEY from edge function secrets (never exposed to the
// frontend, never committed to git). When the key is missing the helper
// returns false — callers keep working with a logged no-op instead of
// failing hard (set the secret to enable delivery).
// ═══════════════════════════════════════════════════════════════════════

export interface ResendAttachment {
  url?: string;
  name?: string;
  filename?: string;
  content?: string; // base64 content (used with filename)
  path?: string; // URL to the attachment file
  type?: string; // MIME type (used with filename/content)
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: ResendAttachment[];
  text?: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Send an email via Resend.
 * - Never throws: returns false on missing key / API error / network failure.
 * - Never logs recipient addresses (PII) — logs the subject + sender result only.
 * - Supports optional attachments (Resend accepts { path | content+filename }).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.log('[resend] RESEND_API_KEY not set — email not sent:', opts.subject);
    return false;
  }

  const from = Deno.env.get('EMAIL_FROM') ?? 'Growlancer <no-reply@growlancer.vercel.app>';
  const replyTo = opts.replyTo ?? Deno.env.get('EMAIL_REPLY_TO');

  try {
    const payload: Record<string, unknown> = {
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.text) payload.text = opts.text;
    if (replyTo) payload.reply_to = replyTo;
    if (opts.attachments && opts.attachments.length > 0) {
      payload.attachments = opts.attachments.map((a) => {
        // Resend accepts { path } for file URLs or { filename + content(base64) }
        if (a.path) return { path: a.path };
        return { filename: a.name || a.filename || 'attachment', content: a.content || '' };
      });
    }

    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error('[resend] Resend error', res.status, (await res.text()).slice(0, 500));
      return false;
    }

    console.log('[resend] Email sent:', opts.subject);
    return true;
  } catch (err) {
    console.error('[resend] Resend exception:', err instanceof Error ? err.message : err);
    return false;
  }
}
