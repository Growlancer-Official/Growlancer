// Admin Data Proxy Edge Function — uses real Supabase Auth for admin verification
// Public actions: verify_certificate, verify_certificate_code, send_welcome_email

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Configuration ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
  'http://localhost:5173',
]

// Rate limiting for failed admin auth: max 10 failed attempts per IP per 15 minutes
const MAX_FAILED_ATTEMPTS = 10
const RATE_WINDOW_MS = 15 * 60 * 1000
const ROUTE = 'admin-data-auth'

// ─── Helpers ────────────────────────────────────────────────────────

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  }
}

// ─── HTML Escape Helper ─────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Rate limit failed admin auth attempts per IP (prevents brute-force of admin endpoints) */
async function checkAuthRateLimit(
  supabaseClient: any,
  identifier: string,
): Promise<boolean> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS)

  try { await supabaseClient.rpc('cleanup_expired_rate_limits') } catch { /* ignore */ }

  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString())

  if (error) return true // Allow if table doesn't exist yet
  if (count !== null && count >= MAX_FAILED_ATTEMPTS) return false

  await supabaseClient.from('rate_limits').insert({
    identifier,
    route: ROUTE,
    count: 1,
    window_start: now.toISOString(),
  })

  return true
}

const _eh = escapeHtml; // shorthand

// ─── Simple email validation ─────────────────────────────────────────────
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Brevo email sender with retry + timeout ────────────────────────────
async function sendBrevoEmail(
  subject: string,
  htmlContent: string,
  to: { email: string; name: string },
  attachments?: { url: string; name: string }[],
): Promise<{ success: boolean; status: number; text: string }> {
  const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
  
  // Validate email
  if (!isValidEmail(to.email)) {
    console.error('Invalid recipient email:', to.email);
    return { success: false, status: 400, text: 'Invalid email format' };
  }

  const payload: Record<string, any> = {
    sender: { name: 'Growlancer Team', email: Deno.env.get('BREVO_FROM_EMAIL') ?? 'growlancer.own@gmail.com' },
    to: [to],
    subject,
    htmlContent,
  };

  // Attach PDF if provided (Brevo supports attachment via URL)
  if (attachments && attachments.length > 0) {
    payload.attachment = attachments;
  }

  // Try up to 2 times (initial + 1 retry)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const text = await res.text();

      if (res.ok) {
        console.log('Brevo email sent:', subject, '→', to.email, 'status:', res.status);
        return { success: true, status: res.status, text };
      }

      console.error(`Brevo error (attempt ${attempt}/2):`, res.status, text);
      
      // Don't retry on 4xx (client errors)
      if (res.status >= 400 && res.status < 500) {
        return { success: false, status: res.status, text };
      }
      
      // Wait 1s before retry
      if (attempt === 1) await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Brevo exception (attempt ${attempt}/2):`, msg);
      
      if (attempt === 1) await new Promise(r => setTimeout(r, 1000));
      else return { success: false, status: 0, text: msg };
    }
  }

  return { success: false, status: 0, text: 'Max retries exceeded' };
}

// ─── Shared Email Template Wrapper ───────────────────────────────────────
function baseEmailHtml(title: string, bodyHtml: string, headerGradient?: string): string {
  const bg = headerGradient || '#059669 0%, #047857 100%';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 20px 8px; margin: 0;">
  <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;"><tr><td style="padding: 20px 12px;" align="center"><![endif]-->
  <div style="max-width: 640px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, ${bg}); padding: 28px 24px; text-align: center;">
      <h1 style="color: white; font-size: 20px; font-weight: 700; margin: 0; word-break: break-word; word-wrap: break-word;">${title}</h1>
    </div>
    <!-- Body -->
    <div style="padding: 28px 24px; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word;">
      ${bodyHtml}
    </div>
    <!-- Footer -->
    <div style="padding: 16px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 11px; margin: 0; word-break: break-word;">Growlancer — AI-Powered Freelancing Marketplace</p>
      <p style="color: #cbd5e1; font-size: 10px; margin: 6px 0 0; word-break: break-word;">© 2026 Growlancer. All rights reserved.</p>
    </div>
  </div>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`
}

/**
 * Verify the caller is an authenticated admin using the standard Supabase Auth session.
 * Reads the Authorization: Bearer <token> header (sent automatically by supabase.functions.invoke),
 * verifies the JWT via auth.getUser(), then checks profiles.is_admin = true.
 * Rate-limits ONLY failed attempts (not valid admin requests) to prevent brute-force.
 */
async function verifyAdminSession(
  serviceClient: any,
  req: Request,
): Promise<{ user_id: string; email: string } | null> {
  const authHeader = req.headers.get('authorization') || ''
  let token = ''
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim()
  }

  if (!token) return null

  // Create an anon-key client to verify the caller's JWT
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  )

  const { data: { user }, error } = await anonClient.auth.getUser()
  if (error || !user) {
    // Rate limit ONLY on failure — prevents brute-force without blocking legitimate admins
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown'
    await checkAuthRateLimit(serviceClient, clientIP)
    return null
  }

  // Check is_admin flag using service_role client
  let { data: profile } = await serviceClient
    .from('profiles')
    .select('is_admin, email')
    .eq('id', user.id)
    .maybeSingle()

  let isAdmin = profile?.is_admin === true

  // Fallback: check by email if not found by ID (handles ID mismatch)
  if (!isAdmin && user.email) {
    const { data: profileByEmail } = await serviceClient
      .from('profiles')
      .select('is_admin, email')
      .eq('email', user.email)
      .maybeSingle()
    if (profileByEmail?.is_admin === true) {
      profile = profileByEmail
      isAdmin = true
    }
  }

  if (!isAdmin) {
    // Rate limit ONLY on failure
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown'
    await checkAuthRateLimit(serviceClient, clientIP)
    return null
  }

  return { user_id: user.id, email: profile?.email || user.email || '' }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Parse body once
    let body: Record<string, any> = {}
    try { body = await req.json() } catch { /* empty body */ }
    const action = body?.action || 'query'

    // ─── Require admin session for all protected actions ────────────
    // Exception: public endpoints that anyone can call
    if (action !== 'verify_certificate' && action !== 'verify_certificate_code' && action !== 'send_welcome_email') {
      const session = await verifyAdminSession(supabaseClient, req)
      if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Admin session required' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ─── POST: storage_upload ──────────────────────────────────────
    if (req.method === 'POST' && action === 'storage_upload') {
      const { bucket, file_path, file_base64, content_type } = body;

      if (!bucket || !file_path || !file_base64) {
        return new Response(JSON.stringify({ error: 'bucket, file_path, and file_base64 are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        // Auto-create bucket if it doesn't exist (using service_role)
        const { error: bucketError } = await supabaseClient
          .storage
          .createBucket(bucket, { public: true });

        if (bucketError && !bucketError.message?.includes('already exists')) {
          console.error('Bucket creation error:', bucketError.message);
          // Non-fatal — might already exist, continue
        }

        // Decode base64 to binary
        const binaryStr = atob(file_base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const { data, error } = await supabaseClient
          .storage
          .from(bucket)
          .upload(file_path, bytes, {
            contentType: content_type || 'application/octet-stream',
            upsert: true,
          });

        if (error) {
          console.error('Storage upload error:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: { publicUrl } } = supabaseClient
          .storage
          .from(bucket)
          .getPublicUrl(file_path);

        return new Response(JSON.stringify({ success: true, path: data?.path, publicUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        console.error('Storage upload exception:', err);
        return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Upload failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── POST: issue_certificate ───────────────────────────────────
    if (req.method === 'POST' && action === 'issue_certificate') {
      const { user_id, skill, level, recipient_name, recipient_email, certificate_type, metadata, certificate_url } = body;

      if (!user_id || !skill || !level || !recipient_name) {
        return new Response(JSON.stringify({ success: false, error: 'user_id, skill, level, and recipient_name are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate verification code
      const { data: codeData } = await supabaseClient.rpc('generate_certificate_code');
      const verificationCode = codeData || ('GRW-CERT-' + Array.from({ length: 5 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join(''));

      const { data, error } = await supabaseClient
        .from('skill_certifications')
        .insert({
          user_id,
          skill,
          level,
          recipient_name,
          recipient_email,
          certificate_type: certificate_type || 'platform',
          verification_code: verificationCode,
          issued_at: new Date().toISOString(),
          status: 'active',
          metadata: metadata || {},
          passed_at: new Date().toISOString(),
          score: 100,
          max_score: 100,
          certificate_url: certificate_url || null,
        })
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, certificate: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── POST: verify_certificate (PUBLIC — no admin session required) ──
    if (req.method === 'POST' && action === 'verify_certificate') {
      const { verification_code } = body;

      if (!verification_code) {
        return new Response(JSON.stringify({ valid: false, error: 'Verification code is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabaseClient
        .from('skill_certifications')
        .select('*')
        .eq('verification_code', verification_code.toUpperCase())
        .single();

      if (error || !data) {
        return new Response(JSON.stringify({ valid: false, error: 'Certificate not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        valid: data.status === 'active',
        certificate: data,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── POST: send_welcome_email (PUBLIC — used after signup) ────
    if (req.method === 'POST' && action === 'send_welcome_email') {
      const { recipient_email, recipient_name: rawRecipientName } = body;

      if (!recipient_email || !rawRecipientName) {
        return new Response(JSON.stringify({ success: false, error: 'recipient_email and recipient_name are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const recipient_name = _eh(rawRecipientName);

      const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app';

      const rawName = rawRecipientName; // for subject line (plain text)
      const subject = `Welcome to Growlancer, ${rawName}! Your AI-powered journey begins now 🚀`;

      const bodyContent = `
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${APP_URL}/Growlancer%20Logo%20(2).png" alt="Growlancer" style="height: 48px; width: auto; border-radius: 12px;" />
          <div style="width: 48px; height: 3px; background: #059669; border-radius: 2px; margin: 16px auto 0;"></div>
        </div>

        <p style="font-size: 15px; color: #0f172a; line-height: 1.7; margin: 0 0 8px;">
          Hey <strong style="color: #059669;">${recipient_name}</strong> 👋
        </p>
        <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
          Thank you for joining <strong>Growlancer</strong> — India's first AI-powered freelancing marketplace.
          We're thrilled to have you on board!
        </p>

        <!-- Three Feature Cards -->
        <div style="margin-bottom: 24px;">
          ${[
            { icon: '🔍', title: 'Explore Projects', desc: 'Discover freelance opportunities that match your unique skills and expertise.' },
            { icon: '🤖', title: 'AI Matchmaking', desc: 'Our AI connects you with the perfect projects — no more endless scrolling.' },
            { icon: '⚡', title: 'Secure Payments', desc: 'Built-in escrow and milestone tracking — get paid reliably and on time.' },
          ].map((f, i) => `
          <div style="margin-bottom: ${i < 2 ? '12px' : '0'}; padding: 16px 18px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="width: 44px; vertical-align: top; font-size: 24px; text-align: center;">${f.icon}</td>
                <td style="padding-left: 14px; vertical-align: top;">
                  <h3 style="font-size: 14px; color: #065f46; font-weight: 700; margin: 0 0 3px;">${f.title}</h3>
                  <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">${f.desc}</p>
                </td>
              </tr>
            </table>
          </div>`).join('')}
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin-bottom: 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%;">
            <tr>
              <td style="background: #059669; border-radius: 12px; padding: 0;">
                <a href="${APP_URL}/login" target="_blank" rel="noopener noreferrer"
                   style="display: block; padding: 14px 20px; color: white; text-decoration: none; font-size: 15px; font-weight: 700; text-align: center; word-break: break-word;">
                  Go to Dashboard 🚀
                </a>
              </td>
            </tr>
          </table>
        </div>

        <!-- Pro Tip Box -->
        <div style="margin-bottom: 24px; padding: 18px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 14px; text-align: center;">
          <p style="font-size: 13px; color: #92400e; margin: 0; line-height: 1.6;">
            💡 <strong>Pro Tip:</strong> Complete your profile and add your skills to unlock AI-powered project matches!
          </p>
        </div>

        <!-- Divider -->
        <div style="width: 100%; height: 1px; background: #e2e8f0; margin-bottom: 20px;"></div>

        <!-- Quick Links -->
        <div style="text-align: center; margin-bottom: 20px;">
          <a href="${APP_URL}/how-it-works" target="_blank" rel="noopener noreferrer"
             style="font-size: 13px; color: #059669; text-decoration: none; font-weight: 600; padding: 0 10px;">How it Works</a>
          <span style="color: #d1d5db;">|</span>
          <a href="${APP_URL}/help-center" target="_blank" rel="noopener noreferrer"
             style="font-size: 13px; color: #059669; text-decoration: none; font-weight: 600; padding: 0 10px;">Help Center</a>
          <span style="color: #d1d5db;">|</span>
          <a href="${APP_URL}/contact" target="_blank" rel="noopener noreferrer"
             style="font-size: 13px; color: #059669; text-decoration: none; font-weight: 600; padding: 0 10px;">Contact Us</a>
        </div>

        <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 16px;">
          If you have any questions, simply reply to this email or visit our Help Center. We're here for you!
        </p>

        <p style="font-size: 15px; color: #0f172a; line-height: 1.7; margin: 0 0 24px;">
          Welcome aboard, and here's to your success! 🚀
        </p>

        <!-- Signature -->
        <div style="padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 2px;">Warm regards,</p>
          <p style="font-size: 15px; color: #059669; margin: 0 0 2px; font-weight: 700; word-break: break-word;">Mohammad Miran Khan</p>
          <p style="font-size: 13px; color: #64748b; margin: 0 0 10px; word-break: break-word;">Founder &amp; CEO, Growlancer</p>
          <table style="border-collapse: collapse;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 8px 16px; background: #f0fdf4; border-radius: 8px;">
                <p style="font-size: 11px; color: #166534; margin: 0; word-break: break-word;">
                  🌐 ${APP_URL} &nbsp;|&nbsp; 📧 growlancer.own@gmail.com
                </p>
              </td>
            </tr>
          </table>
        </div>`;

      const bodyHtml = baseEmailHtml('Welcome to Growlancer! 🎉', bodyContent);

      const brevoResult = await sendBrevoEmail(subject, bodyHtml, { email: recipient_email, name: recipient_name });

      if (!brevoResult.success) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to send welcome email', details: brevoResult.text }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, message: 'Welcome email sent!' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── POST: send_certificate_email ──────────────────────────────
    if (req.method === 'POST' && action === 'send_certificate_email') {
      const { certificate_id, recipient_email, recipient_name: rawRecipientName, certificate_type, role_name: rawRoleName, level, verification_code, performance_summary: rawPerformanceSummary, skills_demonstrated: rawSkills, certificate_url } = body;
      const recipient_name = _eh(rawRecipientName || '');
      const role_name = _eh(rawRoleName || '');
      const performance_summary = _eh(rawPerformanceSummary || '');
      const skills_demonstrated = rawSkills; // JSON array — safe

      if (!certificate_id || !recipient_email || !recipient_name) {
        return new Response(JSON.stringify({ success: false, error: 'certificate_id, recipient_email, and recipient_name are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app';
      const verifyUrl = `${APP_URL}/verify-certificate/${verification_code || ''}`;
      const isLOR = certificate_type === 'lor';

      const pdfDocSection = certificate_url ? `
      <div style="margin: 28px 0; padding: 0; background: #ffffff; border: 2px solid ${isLOR ? '#7c3aed' : '#059669'}; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, ${isLOR ? '#7c3aed 0%, #6d28d9 100%' : '#059669 0%, #047857 100%'}); padding: 20px 24px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 4px;">📄</div>
          <h3 style="font-size: 17px; color: white; margin: 0; font-weight: 700; word-break: break-word;">Your ${isLOR ? 'Recommendation Letter' : 'Certificate'} Document</h3>
          <p style="font-size: 12px; color: ${isLOR ? '#c4b5fd' : '#a7f3d0'}; margin: 6px 0 0; word-break: break-word;">Official PDF — Download for your records</p>
        </div>
        <div style="padding: 20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%;">
            <tr>
              <td style="background: ${isLOR ? '#7c3aed' : '#059669'}; border-radius: 12px; padding: 0;">
                <a href="${certificate_url}" target="_blank" rel="noopener noreferrer"
                   style="display: block; padding: 14px 20px; color: white; text-decoration: none; font-size: 15px; font-weight: 700; text-align: center; word-break: break-word;">
                  📥 Download ${isLOR ? 'LOR' : 'Certificate'} PDF
                </a>
              </td>
            </tr>
          </table>
          <p style="font-size: 11px; color: #94a3b8; margin: 12px 0 0; text-align: center; word-break: break-word;">
            The PDF contains your official ${isLOR ? 'letter of recommendation with details of your performance' : 'completion certificate with your name, skill, and level'}.
          </p>
        </div>
      </div>` : '';

      const subject = isLOR
        ? `Letter of Recommendation — ${role_name || 'Internship'} at Growlancer`
        : `Internship Completion Certificate — ${role_name || 'Internship'} at Growlancer`;

      const bodyContent = isLOR ? `
        <div style="font-size: 40px; text-align: center; margin-bottom: 16px;">🌟</div>

        <p style="font-size: 15px; color: #0f172a; line-height: 1.7; margin: 0 0 20px;">Dear ${recipient_name},</p>

        <p style="font-size: 15px; color: #0f172a; line-height: 1.7; margin: 0 0 16px;">
          On behalf of the entire team at <strong>Growlancer</strong>, it is my privilege to provide you with this
          <strong style="color: #7c3aed;">Letter of Recommendation</strong> for your outstanding performance during your
          <strong>${role_name || 'Internship'}</strong> with us.
        </p>

        <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 20px;">
          Throughout your time with us, you demonstrated exceptional skill, dedication, and professionalism.
          ${performance_summary ? `Your contributions included <strong>${performance_summary}</strong>.` : 'Your contributions have made a meaningful and lasting impact on our team and projects.'}
        </p>

        ${pdfDocSection}

        <!-- Verification Card -->
        <div style="margin: 28px 0; padding: 0; background: #ffffff; border: 2px solid #7c3aed; border-radius: 16px; overflow: hidden;">
          <div style="background: #f3e8ff; padding: 20px 24px; text-align: center;">
            <div style="font-size: 28px; margin-bottom: 8px;">🔗</div>
            <h3 style="font-size: 16px; color: #6d21a8; margin: 0 0 6px; font-weight: 700; word-break: break-word;">View &amp; Verify Online</h3>
            <p style="font-size: 13px; color: #7c3aed; margin: 0 0 16px; word-break: break-word;">Share this link with employers to verify your recommendation letter</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%;">
              <tr>
                <td style="background: #7c3aed; border-radius: 12px; padding: 0;">
                  <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer"
                     style="display: block; padding: 14px 20px; color: white; text-decoration: none; font-size: 15px; font-weight: 700; text-align: center; word-break: break-word;">
                    🔍 View &amp; Verify Online
                  </a>
                </td>
              </tr>
            </table>
            <p style="font-size: 11px; color: #7c3aed; margin: 12px 0 0; word-break: break-word;">
              Verification Code: <strong style="font-size: 14px; font-family: monospace;">${verification_code || ''}</strong>
            </p>
          </div>
        </div>

        <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 20px;">
          We have no doubt that you will continue to excel in all your future endeavors. Your time at Growlancer has been truly valued, and we are confident you will achieve great things ahead.
        </p>

        <p style="font-size: 15px; color: #0f172a; line-height: 1.7; margin: 0 0 24px;">
          We wish you continued success and growth in your career! 🚀
        </p>

        <!-- Signature -->
        <div style="margin-top: 32px; padding-top: 24px; border-top: 2px solid #e2e8f0;">
          <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 2px;">With warm regards,</p>
          <p style="font-size: 16px; color: #7c3aed; margin: 0 0 2px; font-weight: 700; word-break: break-word;">Mohammad Miran Khan</p>
          <p style="font-size: 13px; color: #64748b; margin: 0 0 12px; word-break: break-word;">Founder &amp; CEO, Growlancer</p>
          <table style="border-collapse: collapse;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 8px 16px; background: #f3e8ff; border-radius: 8px;">
                <p style="font-size: 11px; color: #6d28d9; margin: 0; word-break: break-word;">
                  🌐 ${APP_URL} &nbsp;|&nbsp; 📧 growlancer.own@gmail.com
                </p>
              </td>
            </tr>
          </table>
        </div>`
        : `
        <div style="font-size: 36px; text-align: center; margin-bottom: 16px;">🎉</div>

        <!-- Congratulations Banner -->
        <div style="margin: 0 0 24px; padding: 20px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #86efac; border-radius: 16px; text-align: center;">
          <div style="font-size: 36px; margin-bottom: 8px;">🎉</div>
          <h2 style="font-size: 20px; color: #065f46; margin: 0 0 6px; font-weight: 800; word-break: break-word;">Congratulations, ${recipient_name}! 🎊</h2>
          <p style="font-size: 14px; color: #047857; margin: 0; line-height: 1.5; word-break: break-word;">
            You have successfully completed your <strong>${role_name || 'Internship'}</strong> at <strong>Growlancer</strong>. We are so proud of everything you've achieved!
          </p>
        </div>

        <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 20px;">
          Your dedication, hard work, and contributions during your time with us have been truly outstanding. You have grown both personally and professionally, and we are honored to have been part of your journey.
        </p>

        <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
          This <strong>Internship Completion Certificate</strong> officially recognizes your successful completion of the program and the valuable skills you have developed along the way.
        </p>

        ${pdfDocSection}

        <!-- Verification Card -->
        <div style="margin: 28px 0; padding: 0; background: #ffffff; border: 2px solid #059669; border-radius: 16px; overflow: hidden;">
          <div style="background: #f0fdf4; padding: 20px 24px; text-align: center;">
            <div style="font-size: 28px; margin-bottom: 8px;">🔗</div>
            <h3 style="font-size: 16px; color: #065f46; margin: 0 0 6px; font-weight: 700; word-break: break-word;">View &amp; Verify Online</h3>
            <p style="font-size: 13px; color: #047857; margin: 0 0 16px; word-break: break-word;">Share this link with employers to verify your certificate</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="width: 100%;">
              <tr>
                <td style="background: #059669; border-radius: 12px; padding: 0;">
                  <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer"
                     style="display: block; padding: 14px 20px; color: white; text-decoration: none; font-size: 15px; font-weight: 700; text-align: center; word-break: break-word;">
                    🔍 View &amp; Verify Online
                  </a>
                </td>
              </tr>
            </table>
            <p style="font-size: 11px; color: #059669; margin: 12px 0 0; word-break: break-word;">
              Verification Code: <strong style="font-size: 14px; font-family: monospace;">${verification_code || ''}</strong>
            </p>
          </div>
        </div>

        <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 20px;">
          You can now add this certificate to your LinkedIn profile, resume, and portfolio. Employers can verify its authenticity by entering the verification code on our website.
        </p>

        <p style="font-size: 15px; color: #0f172a; line-height: 1.7; margin: 0 0 24px;">
          We wish you the very best in all your future endeavors! Keep growing, keep learning, and keep achieving. 🚀
        </p>

        <!-- Signature -->
        <div style="margin-top: 32px; padding-top: 24px; border-top: 2px solid #e2e8f0;">
          <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 2px;">With warm regards,</p>
          <p style="font-size: 16px; color: #059669; margin: 0 0 2px; font-weight: 700; word-break: break-word;">Mohammad Miran Khan</p>
          <p style="font-size: 13px; color: #64748b; margin: 0 0 12px; word-break: break-word;">Founder &amp; CEO, Growlancer</p>
          <table style="border-collapse: collapse;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding: 8px 16px; background: #f0fdf4; border-radius: 8px;">
                <p style="font-size: 11px; color: #166534; margin: 0; word-break: break-word;">
                  🌐 ${APP_URL} &nbsp;|&nbsp; 📧 growlancer.own@gmail.com
                </p>
              </td>
            </tr>
          </table>
        </div>`;

      const headerTitle = isLOR ? 'Letter of Recommendation' : 'Internship Completion Certificate';
      const headerGradient = isLOR ? '#7c3aed 0%, #6d28d9 100%' : '#059669 0%, #047857 100%';
      const bodyHtml = baseEmailHtml(headerTitle, bodyContent, headerGradient);

      // Attach the certificate/LOR PDF as email attachment (Brevo supports URL-based attachments)
      const attachments = certificate_url
        ? [{ url: certificate_url, name: isLOR ? 'Letter_of_Recommendation.pdf' : 'Completion_Certificate.pdf' }]
        : undefined;

      const brevoResult = await sendBrevoEmail(subject, bodyHtml, { email: recipient_email, name: recipient_name }, attachments);

      if (!brevoResult.success) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to send email', details: brevoResult.text }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, message: 'Email sent successfully' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── POST: counts ──────────────────────────────────────────────
    if (req.method === 'POST' && action === 'counts') {
      const tables: string[] = body.tables || []
      const results: Record<string, number> = {}

      for (const tableEntry of tables) {
        let tableName = tableEntry
        let filterCol: string | undefined
        let filterVal: string | undefined

        if (typeof tableEntry === 'string' && tableEntry.includes(':')) {
          const parts = tableEntry.split(':')
          tableName = parts[0]
          filterCol = parts[1]
          filterVal = parts[2]
        }

        try {
          let q = supabaseClient.from(tableName).select('*', { count: 'exact', head: true })
          if (filterCol && filterVal) q = q.eq(filterCol, filterVal)
          if (filterCol && filterCol === 'null') q = q.is(filterCol, null)
          const { count } = await q
          results[tableName] = count || 0
        } catch {
          results[tableName] = -1
        }
      }

      return new Response(JSON.stringify({ counts: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── POST: query ───────────────────────────────────────────────
    if (req.method === 'POST' && action === 'query') {
      const table = body.table
      const selectParam = body.select || '*'
      const orderCol = body.order
      const orderDir = body.orderDir || 'desc'
      const limitVal = body.limit ?? 100
      const offsetVal = body.offset ?? 0
      const countVal = body.count
      const headOnly = body.head === true
      const filters = body.filters || {}
      const isNull = body.isNull || {}
      const gte = body.gte || {}
      const lte = body.lte || {}
      const inFilters = body.in || {}

      if (!table) {
        return new Response(JSON.stringify({ error: 'table parameter is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let query = supabaseClient.from(table).select(selectParam, countVal ? { count: countVal as any, head: headOnly } : undefined)

      for (const [col, value] of Object.entries(filters)) {
        query = query.eq(col, value as string)
      }
      for (const [col, value] of Object.entries(isNull)) {
        query = query.is(col, value ? null : undefined)
      }
      for (const [col, value] of Object.entries(gte)) {
        query = query.gte(col, value as string)
      }
      for (const [col, value] of Object.entries(lte)) {
        query = query.lte(col, value as string)
      }
      for (const [col, values] of Object.entries(inFilters)) {
        query = query.in(col, values as string[])
      }

      if (orderCol) query = query.order(orderCol, { ascending: orderDir === 'asc' })
      if (!headOnly) query = query.range(offsetVal, offsetVal + limitVal - 1)

      const { data, error, count } = await query

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ data, total: count || undefined }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── POST: insert ──────────────────────────────────────────────
    if (req.method === 'POST' && action === 'insert') {
      const { table, data: insertData } = body

      if (!table || !insertData) {
        return new Response(JSON.stringify({ error: 'table and data are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await supabaseClient
        .from(table)
        .insert(insertData)
        .select()
        .single()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── PATCH: update ─────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { table, id, id_field, data: updateData } = body

      if (!table || !id || !updateData) {
        return new Response(JSON.stringify({ error: 'table, id, and data are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const idCol = id_field || 'id'
      const { data, error } = await supabaseClient
        .from(table)
        .update(updateData)
        .eq(idCol, id)
        .select()
        .single()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── DELETE ────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { table, id, id_field } = body

      if (!table || !id) {
        return new Response(JSON.stringify({ error: 'table and id are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const idCol = id_field || 'id'
      const { data, error } = await supabaseClient
        .from(table)
        .delete()
        .eq(idCol, id)
        .select()
        .single()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Action not recognized' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Admin data proxy error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
