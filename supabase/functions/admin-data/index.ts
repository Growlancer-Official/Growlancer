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
      const { recipient_email, recipient_name } = body;

      if (!recipient_email || !recipient_name) {
        return new Response(JSON.stringify({ success: false, error: 'recipient_email and recipient_name are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
      const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app';

      const subject = `Welcome to Growlancer, ${recipient_name}! Your AI-powered journey begins now 🚀`;

      const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0fdf4; padding: 40px 20px; margin: 0;">
  <!-- Main Container -->
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.08);">
    
    <!-- Hero Section -->
    <tr>
      <td style="background: linear-gradient(135deg, #059669 0%, #047857 50%, #065f46 100%); padding: 48px 40px 40px; text-align: center;">
        <img src="${APP_URL}/Growlancer%20Logo%20(2).png" alt="Growlancer" style="height: 56px; width: auto; margin-bottom: 24px; border-radius: 14px;" />
        <div style="width: 64px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; margin: 0 auto 24px;"></div>
        <h1 style="color: #ffffff; font-size: 28px; font-weight: 800; margin: 0 0 8px; letter-spacing: -0.5px;">
          Welcome to Growlancer! 🎉
        </h1>
        <p style="color: #a7f3d0; font-size: 16px; margin: 0; line-height: 1.5;">
          Your email has been verified — your journey starts now
        </p>
      </td>
    </tr>

    <!-- Content Section -->
    <tr>
      <td style="padding: 40px;">
        <p style="font-size: 16px; color: #0f172a; line-height: 1.8; margin: 0 0 8px;">
          Hey <strong style="color: #059669;">${recipient_name}</strong> 👋
        </p>
        <p style="font-size: 15px; color: #475569; line-height: 1.8; margin: 0 0 24px;">
          Thank you for joining <strong style="color: #0f172a;">Growlancer</strong> — India's first AI-powered freelancing marketplace.
          We're thrilled to have you on board!
        </p>

        <!-- Three Feature Cards -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
          <tr>
            <td style="padding: 20px; background: #f0fdf4; border-radius: 16px; border: 1px solid #bbf7d0;" valign="top">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="44" valign="top" style="padding-right: 16px;">
                    <div style="width: 44px; height: 44px; background: #059669; border-radius: 12px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 44px; font-size: 20px;">🔍</div>
                  </td>
                  <td valign="top">
                    <h3 style="font-size: 15px; color: #065f46; font-weight: 700; margin: 0 0 4px;">Explore Projects</h3>
                    <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">Discover freelance opportunities that match your unique skills and expertise.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height: 12px;"></td></tr>
          <tr>
            <td style="padding: 20px; background: #f0fdf4; border-radius: 16px; border: 1px solid #bbf7d0;" valign="top">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="44" valign="top" style="padding-right: 16px;">
                    <div style="width: 44px; height: 44px; background: #059669; border-radius: 12px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 44px; font-size: 20px;">🤖</div>
                  </td>
                  <td valign="top">
                    <h3 style="font-size: 15px; color: #065f46; font-weight: 700; margin: 0 0 4px;">AI Matchmaking</h3>
                    <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">Our AI connects you with the perfect projects — no more endless scrolling.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="height: 12px;"></td></tr>
          <tr>
            <td style="padding: 20px; background: #f0fdf4; border-radius: 16px; border: 1px solid #bbf7d0;" valign="top">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="44" valign="top" style="padding-right: 16px;">
                    <div style="width: 44px; height: 44px; background: #059669; border-radius: 12px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 44px; font-size: 20px;">⚡</div>
                  </td>
                  <td valign="top">
                    <h3 style="font-size: 15px; color: #065f46; font-weight: 700; margin: 0 0 4px;">Secure Payments</h3>
                    <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">Built-in escrow and milestone tracking — get paid reliably and on time.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
          <tr>
            <td align="center">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background: #059669; border-radius: 14px; text-align: center; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.3);">
                    <a href="${APP_URL}/login" target="_blank" rel="noopener noreferrer"
                       style="display: inline-block; padding: 16px 48px; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; line-height: 1;">
                      Go to Dashboard 🚀
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Pro Tip Box -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
          <tr>
            <td style="padding: 20px; background: #fffbeb; border-radius: 16px; border: 1px solid #fde68a;">
              <p style="font-size: 13px; color: #92400e; margin: 0; text-align: center; line-height: 1.6;">
                💡 <strong>Pro Tip:</strong> Complete your profile and add your skills to unlock AI-powered project matches!
              </p>
            </td>
          </tr>
        </table>

        <!-- Divider -->
        <div style="width: 100%; height: 1px; background: #e2e8f0; margin-bottom: 24px;"></div>

        <!-- Quick Links -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
          <tr>
            <td align="center" style="padding: 0 8px;">
              <a href="${APP_URL}/how-it-works" target="_blank" rel="noopener noreferrer"
                 style="font-size: 13px; color: #059669; text-decoration: none; font-weight: 600; padding: 0 12px;">How it Works</a>
              <span style="color: #d1d5db; font-size: 13px;">|</span>
              <a href="${APP_URL}/help-center" target="_blank" rel="noopener noreferrer"
                 style="font-size: 13px; color: #059669; text-decoration: none; font-weight: 600; padding: 0 12px;">Help Center</a>
              <span style="color: #d1d5db; font-size: 13px;">|</span>
              <a href="${APP_URL}/contact" target="_blank" rel="noopener noreferrer"
                 style="font-size: 13px; color: #059669; text-decoration: none; font-weight: 600; padding: 0 12px;">Contact Us</a>
            </td>
          </tr>
        </table>

        <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0 0 16px;">
          If you have any questions, simply reply to this email or visit our Help Center. We're here for you!
        </p>

        <p style="font-size: 15px; color: #0f172a; line-height: 1.7; margin: 0 0 24px;">
          Welcome aboard, and here's to your success! 🚀
        </p>

        <!-- Signature -->
        <div style="padding-top: 24px; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 14px; color: #64748b; line-height: 1.7; margin: 0;">
            Warm regards,<br/>
            <strong style="font-size: 16px; color: #059669;">Mohammad Miran Khan</strong><br/>
            <span style="color: #94a3b8; font-size: 13px;">Founder & CEO, Growlancer</span>
          </p>
          <div style="margin-top: 16px;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">
              📍 India · 🌐 AI-Powered Freelancing Marketplace
            </p>
          </div>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 24px 40px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px; line-height: 1.6;">
          Growlancer — India's First AI-Powered Freelancing Marketplace<br/>
          © 2026 Growlancer. All rights reserved.
        </p>
        <p style="color: #cbd5e1; font-size: 11px; margin: 0; line-height: 1.5;">
          You received this email because you created an account on Growlancer.<br/>
          If you didn't create this account, please ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': BREVO_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Growlancer Team', email: Deno.env.get('BREVO_FROM_EMAIL') ?? 'growlancer.own@gmail.com' },
            to: [{ email: recipient_email, name: recipient_name }],
            subject,
            htmlContent: bodyHtml,
          }),
        });

        const text = await res.text();
        console.error('Welcome email Brevo response:', res.status, text);

        if (!res.ok) {
          return new Response(JSON.stringify({ success: false, error: 'Failed to send welcome email', details: text }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true, message: 'Welcome email sent!' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Failed to send welcome email' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ─── POST: send_certificate_email ──────────────────────────────
    if (req.method === 'POST' && action === 'send_certificate_email') {
      const { certificate_id, recipient_email, recipient_name, certificate_type, role_name, level, verification_code, performance_summary, skills_demonstrated, certificate_url } = body;

      if (!certificate_id || !recipient_email || !recipient_name) {
        return new Response(JSON.stringify({ success: false, error: 'certificate_id, recipient_email, and recipient_name are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
      const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app';
      const verifyUrl = `${APP_URL}/verify-certificate/${verification_code || ''}`;
      const isLOR = certificate_type === 'lor';

      const pdfDocSection = certificate_url ? `
      <div style="margin: 28px 0; padding: 28px; background: #f8fafc; border: 2px solid ${isLOR ? '#7c3aed' : '#059669'}; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 12px;">
          <div style="font-size: 36px; margin-bottom: 8px;">📄</div>
          <h3 style="font-size: 18px; color: ${isLOR ? '#6d28d9' : '#059669'}; margin: 0;">Your ${isLOR ? 'Recommendation Letter' : 'Certificate'} Document</h3>
          <p style="font-size: 14px; color: #475569; margin: 8px 0 0;">
            Download the official PDF document below. This is your formal ${isLOR ? 'letter of recommendation' : 'completion certificate'}.
          </p>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${certificate_url}" target="_blank" rel="noopener noreferrer"
             style="display: inline-block; padding: 16px 40px; background: ${isLOR ? '#7c3aed' : '#059669'}; color: white; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.1);">
            📥 Download ${isLOR ? 'LOR' : 'Certificate'} PDF
          </a>
        </div>
      </div>` : '';

      const subject = isLOR
        ? `Letter of Recommendation — ${role_name || 'Internship'} at Growlancer`
        : `Internship Completion Certificate — ${role_name || 'Internship'} at Growlancer`;

      const bodyHtml = isLOR
        ? `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; background: #f8fafc; padding: 40px 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; font-size: 22px; font-weight: 700; margin: 0;">Letter of Recommendation</h1>
      <p style="color: #c4b5fd; font-size: 14px; margin: 8px 0 0;">Growlancer — AI-Powered Freelancing Marketplace</p>
    </div>
    <div style="padding: 32px;">
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Dear ${recipient_name},</p>
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
        On behalf of the entire team at <strong>Growlancer</strong>, I am pleased to provide you with this
        <strong style="color: #7c3aed;">Letter of Recommendation</strong> for your outstanding performance during your<strong>${role_name || 'Internship'}</strong> with us.</p>
      <p style="font-size: 14px; color: #475569; line-height: 1.7;">
        Throughout your time with us, you demonstrated exceptional skill, dedication, and professionalism.
        ${performance_summary ? `Your contributions included: ${performance_summary}` : 'Your contributions have made a meaningful impact on our team and projects.'}
      </p>
      ${pdfDocSection}
      <div style="margin: 28px 0; padding: 24px; background: #f8fafc; border: 2px solid #7c3aed; border-radius: 16px; text-align: center;">
        <h3 style="font-size: 16px; color: #6d28d9; margin: 0 0 16px;">View & Verify Online</h3>
        <p style="font-size: 14px; color: #475569; margin: 0 0 16px;">
          You can also view and verify your letter online at any time.
        </p>
        <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer"
           style="display: inline-block; padding: 14px 36px; background: #7c3aed; color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px;">
          View Online
        </a>
        <p style="font-size: 11px; color: #94a3b8; margin: 12px 0 0;">
          Verification Code: <strong>${verification_code || ''}</strong>
        </p>
      </div>
      <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
        This letter confirms your association with Growlancer and your commendable performance.
      </p>
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">We wish you continued success in your career!</p>
      <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
        Warm regards,<br/>
        <strong style="font-size: 15px; color: #7c3aed;">Mohammad Miran Khan</strong><br/>
        <span style="color: #94a3b8;">Founder & CEO, Growlancer</span>
      </p>
    </div>
    <div style="padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">Growlancer — AI-Powered Freelancing Marketplace</p>
    </div>
  </div>
</body>
</html>`
        : `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; background: #f8fafc; padding: 40px 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; font-size: 22px; font-weight: 700; margin: 0;">Internship Completion Certificate</h1>
      <p style="color: #a7f3d0; font-size: 14px; margin: 8px 0 0;">Growlancer — AI-Powered Freelancing Marketplace</p>
    </div>
    <div style="padding: 32px;">
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Dear ${recipient_name},</p>
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
        Congratulations on successfully completing your <strong>${role_name || 'Internship'}</strong> at
        <strong>Growlancer</strong>! We are proud of the work you have done.
      </p>
      <p style="font-size: 14px; color: #475569; line-height: 1.7;">
        Your dedication and contributions during your time with us have been outstanding.
      </p>
      ${pdfDocSection}
      <div style="margin: 28px 0; padding: 24px; background: #f0fdf4; border: 2px solid #059669; border-radius: 16px; text-align: center;">
        <h3 style="font-size: 16px; color: #065f46; margin: 0 0 16px;">View & Verify Online</h3>
        <p style="font-size: 14px; color: #475569; margin: 0 0 16px;">
          View your certificate online and share the verification link with employers.
        </p>
        <a href="${verifyUrl}" target="_blank" rel="noopener noreferrer"
           style="display: inline-block; padding: 14px 36px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 15px;">
          View Online
        </a>
        <p style="font-size: 11px; color: #94a3b8; margin: 12px 0 0;">
          Verification Code: <strong>${verification_code || ''}</strong>
        </p>
      </div>
      <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
        This certificate is digitally verified and can be checked by entering the verification code on our website.
      </p>
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">We wish you the very best in all your future endeavors!</p>
      <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
        Warm regards,<br/>
        <strong style="font-size: 15px; color: #059669;">Mohammad Miran Khan</strong><br/>
        <span style="color: #94a3b8;">Founder & CEO, Growlancer</span>
      </p>
    </div>
    <div style="padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">Growlancer — AI-Powered Freelancing Marketplace</p>
    </div>
  </div>
</body>
</html>`;

      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': BREVO_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Growlancer Team', email: Deno.env.get('BREVO_FROM_EMAIL') ?? 'growlancer.own@gmail.com' },
            to: [{ email: recipient_email, name: recipient_name }],
            subject,
            htmlContent: bodyHtml,
          }),
        });

        const text = await res.text();
        console.error('Certificate email Brevo response:', res.status, text);

        if (!res.ok) {
          return new Response(JSON.stringify({ success: false, error: 'Failed to send email', details: text }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true, message: 'Email sent successfully' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Failed to send email' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
