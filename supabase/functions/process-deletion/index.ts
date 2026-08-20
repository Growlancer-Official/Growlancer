// Process Deletion Edge Function
// Processes confirmed account deletions that have passed the 7-day cooldown
// Should be triggered by a scheduled job (cron) or admin action

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ─── AUTHORIZATION (fail closed) ───
    // Only two callers are allowed:
    //   1. A scheduled job carrying the CRON_SECRET header (x-cron-secret).
    //   2. An authenticated admin (JWT verified via auth.getUser() + is_admin).
    // The previous `authHeader.includes('service_role')` string check was
    // trivially spoofable — anyone could append "service_role" to any header
    // value and the function would use the REAL service-role key to delete
    // arbitrary users. Never trust header substrings.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const cronHeader = req.headers.get('x-cron-secret') || '';
    const isCronCall = !!cronSecret && cronHeader === cronSecret;

    if (!isCronCall) {
      // Verify the caller is an authenticated admin via their JWT
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        {
          global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
          auth: { autoRefreshToken: false, persistSession: false },
        }
      );
      const {
        data: { user },
        error: userError,
      } = await anonClient.auth.getUser()

      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if user is admin
      const serviceClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile || profile.is_admin !== true) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Service-role client for the actual admin operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const { method } = req

    if (method === 'GET') {
      // List pending deletion requests that are ready for processing
      const { data: requests, error } = await supabaseClient
        .from('user_deletion_requests')
        .select('*')
        .eq('status', 'confirmed')
        .lte('scheduled_deletion_at', new Date().toISOString())
        .order('scheduled_deletion_at', { ascending: true })

      if (error) {
        throw error
      }

      return new Response(
        JSON.stringify({
          ready_for_deletion: requests?.length || 0,
          requests: requests?.map(r => ({
            id: r.id,
            user_id: r.user_id,
            created_at: r.created_at,
            scheduled_deletion_at: r.scheduled_deletion_at,
            reason: r.reason,
          })) || [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (method === 'POST') {
      // Process deletion for a specific request
      const { request_id, confirm_all } = await req.json()

      if (confirm_all) {
        // Process ALL ready requests — also fetch user_id for auth deletion
        const { data: readyRequests, error: fetchError } = await supabaseClient
          .from('user_deletion_requests')
          .select('id, user_id')
          .eq('status', 'confirmed')
          .lte('scheduled_deletion_at', new Date().toISOString())

        if (fetchError) {
          throw fetchError
        }

        if (!readyRequests || readyRequests.length === 0) {
          return new Response(
            JSON.stringify({ success: false, message: 'No requests ready for deletion' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const results: { id: string; success: boolean; auth_deleted: boolean; error?: string }[] = []

        for (const req of readyRequests) {
          const { data, error: processError } = await supabaseClient
            .rpc('process_account_deletion', { p_request_id: req.id })

          if (processError) {
            results.push({ id: req.id, success: false, auth_deleted: false, error: processError.message })
          } else {
            const rpcSuccess = data?.success ?? false;
            let authDeleted = false;

            if (rpcSuccess && req.user_id) {
              const { error: authError } = await supabaseClient.auth.admin.deleteUser(req.user_id);
              if (authError) {
                console.error(`Failed to delete auth user ${req.user_id}:`, authError.message);
              }
              authDeleted = !authError;
            }

            results.push({
              id: req.id,
              success: rpcSuccess,
              auth_deleted: authDeleted,
              error: data?.error,
            })
          }
        }

        const succeeded = results.filter(r => r.success).length
        const failed = results.filter(r => !r.success).length

        return new Response(
          JSON.stringify({
            success: true,
            total_processed: results.length,
            succeeded,
            failed,
            details: results,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!request_id) {
        return new Response(
          JSON.stringify({ error: 'request_id or confirm_all is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify the request exists and is ready
      const { data: request, error: requestError } = await supabaseClient
        .from('user_deletion_requests')
        .select('*')
        .eq('id', request_id)
        .eq('status', 'confirmed')
        .single()

      if (requestError || !request) {
        return new Response(
          JSON.stringify({ error: 'Deletion request not found or not confirmed' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (new Date(request.scheduled_deletion_at) > new Date()) {
        return new Response(
          JSON.stringify({
            error: 'Deletion cooldown period has not yet passed',
            scheduled_deletion_at: request.scheduled_deletion_at,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const userId = request.user_id;

      // Process the public data deletion (RPC already nullifies FKs and deletes profile)
      const { data, error } = await supabaseClient
        .rpc('process_account_deletion', { p_request_id: request_id })

      if (error) {
        throw error
      }

      // Delete auth user for complete removal (requires service_role key)
      const { error: authError } = await supabaseClient.auth.admin.deleteUser(userId);
      if (authError) {
        console.error('Failed to delete auth user after profile deletion:', authError.message);
      }

      return new Response(
        JSON.stringify({
          data,
          auth_deleted: !authError,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Process Deletion error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})