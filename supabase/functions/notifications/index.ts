// Notifications Edge Function
// Handles notification CRUD, archive/restore, push token management
// Supports real-time notification delivery

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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  };
}

// Rate limiting - DB-backed
const ROUTE = 'notifications';
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
  // Handle CORS preflight BEFORE rate limit check (always allow OPTIONS)
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
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { method } = req
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    if (method === 'GET') {
      // Route by action param
      if (action === 'archived') {
        // Get archived notifications
        const limit = parseInt(url.searchParams.get('limit') || '50')
        const offset = parseInt(url.searchParams.get('offset') || '0')
        const type = url.searchParams.get('type')

        const { data: notifications, error } = await supabaseClient.rpc(
          'get_notifications_by_category',
          {
            p_user_id: user.id,
            p_type: type || null,
            p_archived: true,
            p_unread_only: false,
            p_limit: limit,
            p_offset: offset,
          }
        )

        if (error) throw error

        return new Response(
          JSON.stringify(notifications),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (action === 'push_tokens') {
        // Get user's push tokens
        const { data: tokens, error } = await supabaseClient.rpc(
          'get_user_push_tokens',
          { p_user_id: user.id }
        )

        if (error) throw error

        return new Response(
          JSON.stringify({ tokens }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Default: Get user's notifications (non-archived)
      const unreadOnly = url.searchParams.get('unread_only') === 'true'
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const offset = parseInt(url.searchParams.get('offset') || '0')
      const type = url.searchParams.get('type')

      let query = supabaseClient
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (offset > 0) {
        query = query.range(offset, offset + limit - 1)
      }

      if (unreadOnly) {
        query = query.eq('read', false)
      }

      if (type) {
        query = query.eq('type', type)
      }

      const { data: notifications, error } = await query

      if (error) {
        throw error
      }

      // Get unread count
      const { count: unreadCount } = await supabaseClient
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false)
        .eq('archived', false)

      return new Response(
        JSON.stringify({ 
          notifications, 
          unread_count: unreadCount || 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (method === 'POST') {
      const body = await req.json()

      // Route by action
      if (action === 'register_push_token') {
        const { token, platform, device_name } = body
        if (!token || !platform) {
          return new Response(
            JSON.stringify({ error: 'token and platform are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data, error } = await supabaseClient.rpc('register_push_token', {
          p_user_id: user.id,
          p_token: token,
          p_platform: platform,
          p_device_name: device_name || null,
        })

        if (error) throw error
        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (action === 'unregister_push_token') {
        const { token } = body
        if (!token) {
          return new Response(
            JSON.stringify({ error: 'token is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data, error } = await supabaseClient.rpc('unregister_push_token', {
          p_user_id: user.id,
          p_token: token,
        })

        if (error) throw error
        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Default: Create notification
      const { recipient_id, type, title, message, metadata, action_url } = body

      if (!recipient_id || !type || !title || !message) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Only allow creating notifications for yourself or if you're an admin
      if (recipient_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Can only create notifications for yourself' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: notification, error } = await supabaseClient
        .from('notifications')
        .insert({
          user_id: recipient_id,
          type,
          title,
          message,
          metadata: metadata || null,
          action_url: action_url || null,
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      return new Response(
        JSON.stringify({ notification }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (method === 'PATCH') {
      const body = await req.json()
      const { notification_id, mark_all, archive_all_read } = body

      if (archive_all_read) {
        // Archive all read notifications
        const { data, error } = await supabaseClient.rpc('archive_all_read_notifications', {
          p_user_id: user.id,
        })

        if (error) throw error
        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (mark_all) {
        // Mark all as read
        const { error } = await supabaseClient
          .from('notifications')
          .update({ read: true })
          .eq('user_id', user.id)
          .eq('read', false)
          .eq('archived', false)

        if (error) throw error

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else if (notification_id) {
        // Mark specific notification as read
        const { error } = await supabaseClient
          .from('notifications')
          .update({ read: true })
          .eq('id', notification_id)
          .eq('user_id', user.id)

        if (error) throw error

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        return new Response(
          JSON.stringify({ error: 'Either notification_id, mark_all, or archive_all_read is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (method === 'PUT') {
      // Archive or restore notification
      const body = await req.json()
      const { notification_id, archived } = body

      if (!notification_id) {
        return new Response(
          JSON.stringify({ error: 'notification_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (archived === true) {
        const { data, error } = await supabaseClient.rpc('archive_notification', {
          p_notification_id: notification_id,
          p_user_id: user.id,
        })
        if (error) throw error
        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        const { data, error } = await supabaseClient.rpc('restore_notification', {
          p_notification_id: notification_id,
          p_user_id: user.id,
        })
        if (error) throw error
        return new Response(
          JSON.stringify(data),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (method === 'DELETE') {
      // Delete notification
      const { notification_id } = await req.json()

      if (!notification_id) {
        return new Response(
          JSON.stringify({ error: 'Notification ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { error } = await supabaseClient
        .from('notifications')
        .delete()
        .eq('id', notification_id)
        .eq('user_id', user.id)

      if (error) throw error

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Notifications error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})