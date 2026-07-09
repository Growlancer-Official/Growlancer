// Admin Signup Edge Function
// Verifies admin signup secret code against ADMIN_SIGNUP_SECRET env var (set in Supabase Dashboard).
// On success, calls grant_admin_role(p_user_id) RPC using service_role key.
// Never stores the secret in code — reads it from Deno.env.get() only.
//
// 🔴 OPERATOR: Set ADMIN_SIGNUP_SECRET in Supabase Dashboard → Edge Functions → Environment Variables
//    Generate with: openssl rand -hex 32
//    Never commit the real secret to any file in this repo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
  'http://localhost:5173',
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// ─── Rate Limiting ──────────────────────────────────────────────
// Prevent brute-force of the admin signup secret code.
// Max 5 attempts per IP per 15 minutes.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const ROUTE = 'admin-signup';

async function checkRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  // Clean expired rate limits (best-effort)
  try { await supabaseClient.rpc('cleanup_expired_rate_limits'); } catch { /* ignore */ }

  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());

  if (error) return true; // Allow if table doesn't exist yet

  if (count !== null && count >= MAX_ATTEMPTS) return false;

  // Record this attempt
  await supabaseClient.from('rate_limits').insert({
    identifier,
    route: ROUTE,
    count: 1,
    window_start: now.toISOString(),
  });

  return true;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Parse body
    let body: Record<string, any> = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const action = body?.action || '';
    const userId = body?.user_id || '';
    const secretCode = body?.secret_code || '';

    if (action !== 'verify_admin_signup') {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!userId || !secretCode) {
      return new Response(JSON.stringify({ success: false, error: 'user_id and secret_code are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting: max 5 attempts per IP per 15 minutes
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    const rateAllowed = await checkRateLimit(supabaseClient, clientIP);
    if (!rateAllowed) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Too many signup attempts. Please try again later.',
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify secret code against environment variable
    // Set ADMIN_SIGNUP_SECRET in Supabase Dashboard → Edge Functions → Environment Variables
    const expectedSecret = Deno.env.get('ADMIN_SIGNUP_SECRET') || '';
    if (!expectedSecret) {
      console.error('[admin-signup] ADMIN_SIGNUP_SECRET is not set in environment variables');
      return new Response(JSON.stringify({
        success: false,
        error: 'Admin signup is not configured. Please contact the administrator.',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Constant-time comparison to prevent timing attacks
    if (secretCode.length !== expectedSecret.length) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid admin secret code' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let codeValid = true;
    for (let i = 0; i < secretCode.length; i++) {
      if (secretCode[i] !== expectedSecret[i]) {
        codeValid = false;
      }
    }

    if (!codeValid) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid admin secret code' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Code is valid — call the grant_admin_role RPC (no secret in SQL, safe)
    const { data: rpcResult, error: rpcError } = await supabaseClient.rpc('grant_admin_role', {
      p_user_id: userId,
    });

    if (rpcError) {
      console.error('[admin-signup] grant_admin_role RPC error:', rpcError);
      return new Response(JSON.stringify({ success: false, error: rpcError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = rpcResult as { success?: boolean; error?: string };
    if (!result?.success) {
      return new Response(JSON.stringify({ success: false, error: result?.error || 'Failed to grant admin access' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Admin access granted',
      user_id: userId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[admin-signup] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
