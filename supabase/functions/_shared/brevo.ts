// ═══════════════════════════════════════════════════════════════════════
// Shared Brevo email sender for all Growlancer edge functions.
//
// Reads BREVO_API_KEY from edge function secrets (never exposed to the
// frontend, never committed to git). When the key is missing the helper
// returns false — callers keep working with a logged no-op instead of
// failing hard (set the secret to enable delivery).
//
// Brevo (formerly Sendinblue) — https://developers.brevo.com
// ═══════════════════════════════════════════════════════════════════════

export interface EmailAttachment {
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
  attachments?: EmailAttachment[];
  text?: string;
}

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Send an email via Brevo.
 * - Never throws: returns false on missing key / API error / network failure.
 * - Never logs recipient addresses (PII) — logs the subject + sender result only.
 * - Supports optional attachments (Brevo accepts { name + url } or { name + content(base64) }).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) {
    console.log('[brevo] BREVO_API_KEY not set — email not sent:', opts.subject);
    return false;
  }

  const fromRaw = Deno.env.get('EMAIL_FROM') ?? 'Growlancer <noreplygrowlancer@gmail.com>';
  const replyTo = opts.replyTo ?? Deno.env.get('EMAIL_REPLY_TO');

  // Parse "Name <email>" into Brevo's { name, email } shape.
  const fromMatch = fromRaw.match(/^(.*?)\s*<([^>]+)>$/);
  const sender = fromMatch
    ? { name: fromMatch[1].trim(), email: fromMatch[2].trim() }
    : { name: 'Growlancer', email: fromRaw.trim() };

  try {
    const payload: Record<string, unknown> = {
      sender,
      to: [{ email: opts.to }],
      subject: opts.subject,
      htmlContent: opts.html,
    };
    if (opts.text) payload.textContent = opts.text;
    if (replyTo) payload.replyTo = { email: replyTo };
    if (opts.attachments && opts.attachments.length > 0) {
      payload.attachment = opts.attachments.map((a) => {
        // Brevo accepts { name + url } for file URLs or { name + content(base64) }.
        const url = a.url || a.path;
        const name = a.name || a.filename || 'attachment';
        if (url) return { name, url };
        return { name, content: a.content || '' };
      });
    }

    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error('[brevo] Brevo error', res.status, (await res.text()).slice(0, 500));
      return false;
    }

    console.log('[brevo] Email sent:', opts.subject);
    return true;
  } catch (err) {
    console.error('[brevo] Brevo exception:', err instanceof Error ? err.message : err);
    return false;
  }
}
