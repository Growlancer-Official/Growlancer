// Internship Applications Edge Function
// Handles new internship application submissions and notifies admins
// Supports real-time delivery via Supabase Realtime

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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

    // Rate limiting (30 req/min per IP)
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown'
    try {
      await supabaseClient.rpc('cleanup_expired_rate_limits')
      const { count } = await supabaseClient
        .from('rate_limits')
        .select('*', { count: 'exact', head: true })
        .eq('identifier', `internship:${clientIP}`)
        .gte('window_start', new Date(Date.now() - 60000).toISOString())

      if (count !== null && count >= 30) {
        return new Response(
          JSON.stringify({ error: 'Too many requests' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      await supabaseClient
        .from('rate_limits')
        .insert({ identifier: `internship:${clientIP}`, route: 'internship-applications', count: 1, window_start: new Date().toISOString() })
    } catch {
      // Rate limiting is best-effort
    }

    const { method } = req

    if (method === 'POST') {
      const body = await req.json()
      const { full_name, email, phone, role_id, role_name, education, graduation_date, discord_handle, github_url, portfolio_url, resume_url, cover_letter, why_growlancer, weekly_availability, available_from, available_to } = body

      // Validate required fields
      if (!full_name || !email || !role_id || !role_name || !cover_letter) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: full_name, email, role_id, role_name, cover_letter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({ error: 'Invalid email format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Insert the application
      const { data: application, error: insertError } = await supabaseClient
        .from('internship_applications')
        .insert({
          full_name,
          email,
          phone: phone || null,
          role_id,
          role_name,
          education: education || null,
          graduation_date: graduation_date || null,
          discord_handle: discord_handle || null,
          github_url: github_url || null,
          portfolio_url: portfolio_url || null,
          resume_url: resume_url || null,
          cover_letter,
          why_growlancer: why_growlancer || null,
          weekly_availability: weekly_availability || null,
          available_from: available_from || null,
          available_to: available_to || null,
          status: 'pending',
        })
        .select()
        .single()

      if (insertError) {
        console.error('Insert error:', insertError)
        return new Response(
          JSON.stringify({ error: 'Failed to submit application. Please try again.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Notify all admin users about the new application
      const { data: admins } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .is('deleted_at', null)

      if (admins && admins.length > 0) {
        const notifications = admins.map(admin => ({
          user_id: admin.id,
          type: 'internship_application',
          title: 'New Internship Application',
          message: `${full_name} applied for ${role_name}`,
          metadata: {
            application_id: application.id,
            role_id,
            role_name,
            applicant_name: full_name,
            applicant_email: email,
          },
          action_url: `/admin/internships/${application.id}`,
        }))

        await supabaseClient
          .from('notifications')
          .insert(notifications)
      }

      return new Response(
        JSON.stringify({ success: true, application_id: application.id }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (method === 'GET') {
      // Only authenticated users with admin role can view applications
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check admin role
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const url = new URL(req.url)
      const status = url.searchParams.get('status')
      const roleFilter = url.searchParams.get('role_id')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const offset = parseInt(url.searchParams.get('offset') || '0')

      let query = supabaseClient
        .from('internship_applications')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (status) {
        query = query.eq('status', status)
      }
      if (roleFilter) {
        query = query.eq('role_id', roleFilter)
      }

      const { data: applications, error } = await query
      if (error) throw error

      return new Response(
        JSON.stringify(applications),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (method === 'PATCH') {
      // Only admins can update application status
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const body = await req.json()
      const { application_id, status, notes } = body

      if (!application_id) {
        return new Response(
          JSON.stringify({ error: 'application_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const updateData: Record<string, unknown> = {}
      if (status) updateData.status = status
      if (notes !== undefined) updateData.notes = notes

      const { data: application, error } = await supabaseClient
        .from('internship_applications')
        .update(updateData)
        .eq('id', application_id)
        .select()
        .single()

      if (error) throw error

      return new Response(
        JSON.stringify(application),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Internship applications error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
