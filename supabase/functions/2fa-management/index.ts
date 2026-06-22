// 2FA Management Edge Function
// Handles TOTP two-factor authentication via Supabase Auth MFA
// Includes recovery codes management and backup email setup

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting constants (DB-backed via rate_limits table)
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60000;
const ROUTE = '2fa-management';

// DB-backed rate limit check (persists across cold starts)
async function checkRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);

  // Clean up expired records first (best-effort)
  try {
    await supabaseClient.rpc('cleanup_expired_rate_limits');
  } catch {
    // Non-critical; continue
  }

  // Count requests in the current window
  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());

  if (error) {
    // Fallback: allow if table doesn't exist yet
    return true;
  }

  if (count !== null && count >= RATE_LIMIT) {
    return false;
  }

  // Record this request
  await supabaseClient
    .from('rate_limits')
    .insert({
      identifier,
      route: ROUTE,
      count: 1,
      window_start: now.toISOString(),
    });

  return true;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    )

    // Get user from auth
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check rate limit (DB-backed, using user ID as identifier)
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const identifier = user.id || clientIP;
    const allowed = await checkRateLimit(supabaseClient, identifier);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { method } = req
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // GET: Retrieve MFA status
    if (method === 'GET') {
      const { data: mfaStatus, error: statusError } = await supabaseClient
        .rpc('get_mfa_status', { p_user_id: user.id })

      if (statusError) {
        throw statusError
      }

      // Also get Supabase Auth MFA factors
      const { data: mfaFactors, error: factorsError } = await supabaseClient.auth.mfa.listFactors()

      if (factorsError) {
        // If MFA listing fails, just return what we have
        return new Response(
          JSON.stringify({ status: mfaStatus }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          status: mfaStatus,
          factors: mfaFactors?.all || [],
          totp_factors: mfaFactors?.totp || [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // POST: Various 2FA actions
    if (method === 'POST') {
      const body = await req.json()
      const { action: bodyAction, ...params } = body
      const actionType = bodyAction || action

      // --- Enroll TOTP ---
      if (actionType === 'enroll') {
        const { data: enrollData, error: enrollError } = await supabaseClient.auth.mfa.enroll({
          factorType: 'totp',
        })

        if (enrollError) {
          return new Response(
            JSON.stringify({ error: enrollError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Generate recovery codes
        const { data: recoveryData, error: recoveryError } = await supabaseClient
          .rpc('generate_recovery_codes', { p_user_id: user.id })

        if (recoveryError) {
          console.error('Failed to generate recovery codes:', recoveryError)
        }

        return new Response(
          JSON.stringify({
            success: true,
            factor_id: enrollData?.id,
            totp: {
              qr_code: enrollData?.totp?.qr_code, // base64 SVG
              secret: enrollData?.totp?.secret,
              uri: enrollData?.totp?.uri,
            },
            recovery_codes: recoveryData || [],
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // --- Verify TOTP ---
      if (actionType === 'verify') {
        const { factor_id, code } = params

        if (!factor_id || !code) {
          return new Response(
            JSON.stringify({ error: 'factor_id and code are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Create challenge
        const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({
          factorId: factor_id,
        })

        if (challengeError) {
          return new Response(
            JSON.stringify({ error: challengeError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Verify the challenge
        const { data: verifyData, error: verifyError } = await supabaseClient.auth.mfa.verify({
          factorId: factor_id,
          challengeId: challengeData.id,
          code: code,
        })

        if (verifyError) {
          return new Response(
            JSON.stringify({ error: 'Invalid verification code. Please try again.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Enable MFA in our settings
        await supabaseClient
          .rpc('enable_user_mfa', { p_user_id: user.id, p_totp_secret: '' })

        return new Response(
          JSON.stringify({
            success: true,
            verified: verifyData?.verified || false,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // --- Verify with Recovery Code ---
      if (actionType === 'verify_recovery') {
        const { code } = params

        if (!code) {
          return new Response(
            JSON.stringify({ error: 'Recovery code is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data: verifyData, error: verifyError } = await supabaseClient
          .rpc('verify_recovery_code', { p_user_id: user.id, p_code: code })

        if (verifyError) {
          throw verifyError
        }

        if (!verifyData?.valid) {
          return new Response(
            JSON.stringify({ error: 'Invalid or already used recovery code' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // --- Disable MFA ---
      if (actionType === 'disable') {
        // Unenroll from Supabase Auth MFA
        const { data: factors } = await supabaseClient.auth.mfa.listFactors()

        if (factors?.totp) {
          for (const factor of factors.totp) {
            await supabaseClient.auth.mfa.unenroll({ factorId: factor.id })
          }
        }

        // Disable in our settings
        await supabaseClient
          .rpc('disable_user_mfa', { p_user_id: user.id })

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // --- Regenerate Recovery Codes ---
      if (actionType === 'regenerate_codes') {
        const { data: codes, error: codesError } = await supabaseClient
          .rpc('generate_recovery_codes', { p_user_id: user.id })

        if (codesError) {
          throw codesError
        }

        return new Response(
          JSON.stringify({
            success: true,
            recovery_codes: codes,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // --- Set Backup Email ---
      if (actionType === 'set_backup_email') {
        const { email } = params

        if (!email || !email.includes('@')) {
          return new Response(
            JSON.stringify({ error: 'Valid email is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { error: updateError } = await supabaseClient
          .from('user_mfa_settings')
          .upsert({
            user_id: user.id,
            backup_email: email,
          }, { onConflict: 'user_id' })

        if (updateError) {
          throw updateError
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Unknown action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('2FA Management error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})