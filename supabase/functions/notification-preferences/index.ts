// Notification Preferences Edge Function
// Handles CRUD operations for user notification preferences
// Supports email, in-app, and push notification channel toggles per category

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name, x-admin-token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}

// Rate limiting - DB-backed
const ROUTE = 'notification-preferences';
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60000;

async function checkRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);

  // Best-effort cleanup of expired rate limit records
  try {
    await supabaseClient.rpc('cleanup_expired_rate_limits');
  } catch {
    // Non-critical; cleanup also runs via cron
  }

  // Count existing requests in the current window
  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());

  if (error) {
    console.error('Rate limit check error:', error);
    return true; // Fallback: allow request if DB query fails
  }

  if (count !== null && count >= RATE_LIMIT) {
    return false;
  }

  // Record this request
  await supabaseClient
    .from('rate_limits')
    .insert({ identifier, route: ROUTE, count: 1, window_start: now.toISOString() });

  return true;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  // Handle CORS preflight
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

    // Authenticate user
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

    // Rate limit check (after auth to use user.id as identifier)
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

    // GET: Retrieve notification preferences
    if (method === 'GET') {
      const { data: prefs, error: prefsError } = await supabaseClient
        .rpc('get_notification_preferences', { p_user_id: user.id })

      if (prefsError) {
        throw prefsError
      }

      return new Response(
        JSON.stringify({ preferences: prefs }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // POST: Set notification preferences (merge)
    if (method === 'POST') {
      const { preferences } = await req.json()

      if (!preferences || typeof preferences !== 'object') {
        return new Response(
          JSON.stringify({ error: 'Preferences object is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: updated, error: updateError } = await supabaseClient
        .rpc('set_notification_preferences', {
          p_user_id: user.id,
          p_preferences: preferences,
        })

      if (updateError) {
        throw updateError
      }

      return new Response(
        JSON.stringify({ success: true, preferences: updated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // PUT: Replace all notification preferences
    if (method === 'PUT') {
      const { preferences } = await req.json()

      if (!preferences || typeof preferences !== 'object') {
        return new Response(
          JSON.stringify({ error: 'Preferences object is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Replace everything (no merge)
      const { error: upsertError } = await supabaseClient
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          preferences,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

      if (upsertError) {
        throw upsertError
      }

      return new Response(
        JSON.stringify({ success: true, preferences }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // PATCH: Update specific category preferences
    if (method === 'PATCH') {
      const { category, channels } = await req.json()

      if (!category || !channels || typeof channels !== 'object') {
        return new Response(
          JSON.stringify({ error: 'Category and channels object are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get current preferences, merge the category update
      const { data: currentPrefs } = await supabaseClient
        .rpc('get_notification_preferences', { p_user_id: user.id })

      const mergedPrefs = {
        ...(currentPrefs || {}),
        [category]: {
          ...((currentPrefs as Record<string, unknown>)?.[category] as Record<string, boolean> || {}),
          ...channels,
        },
      }

      const { data: updated, error: updateError } = await supabaseClient
        .rpc('set_notification_preferences', {
          p_user_id: user.id,
          p_preferences: mergedPrefs,
        })

      if (updateError) {
        throw updateError
      }

      return new Response(
        JSON.stringify({ success: true, preferences: updated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Notification preferences error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})