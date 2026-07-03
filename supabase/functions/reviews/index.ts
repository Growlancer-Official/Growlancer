// Reviews Edge Function
// Handles review creation and management
// Supports rating calculations and aggregation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

// Rate limiting - DB-backed
const ROUTE = 'reviews';
const RATE_LIMIT = 20;
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

    if (method === 'POST') {
      // Create a review
      const {
        contract_id,
        reviewee_id,
        rating,
        communication_rating,
        quality_rating,
        timeliness_rating,
        professionalism_rating,
        comment,
        would_hire_again,
      } = await req.json()

      if (!contract_id || !reviewee_id || !rating) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate rating range
      if (rating < 1 || rating > 5) {
        return new Response(
          JSON.stringify({ error: 'Rating must be between 1 and 5' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify user is part of the contract
      const { data: contract, error: contractError } = await supabaseClient
        .from('contracts')
        .select('freelancer_id, client_id, status')
        .eq('id', contract_id)
        .single()

      if (contractError || !contract) {
        return new Response(
          JSON.stringify({ error: 'Contract not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (contract.freelancer_id !== user.id && contract.client_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'You are not part of this contract' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify reviewee is the other party in the contract
      const otherPartyId = contract.freelancer_id === user.id ? contract.client_id : contract.freelancer_id
      if (reviewee_id !== otherPartyId) {
        return new Response(
          JSON.stringify({ error: 'You can only review the other party in the contract' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if review already exists
      const { data: existingReview } = await supabaseClient
        .from('reviews')
        .select('id')
        .eq('contract_id', contract_id)
        .eq('reviewer_id', user.id)
        .single()

      if (existingReview) {
        return new Response(
          JSON.stringify({ error: 'You have already reviewed this contract' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Create review
      const { data: review, error: reviewError } = await supabaseClient
        .from('reviews')
        .insert({
          contract_id,
          reviewer_id: user.id,
          reviewee_id,
          rating,
          communication_rating,
          quality_rating,
          timeliness_rating,
          professionalism_rating,
          comment,
          would_hire_again,
        })
        .select()
        .single()

      if (reviewError) {
        throw reviewError
      }

      // Update freelancer profile rating
      if (contract.freelancer_id === reviewee_id) {
        await updateFreelancerRating(supabaseClient, reviewee_id)
      }

      return new Response(
        JSON.stringify({ review }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (method === 'GET') {
      const url = new URL(req.url)
      const contractId = url.searchParams.get('contract_id')
      const revieweeId = url.searchParams.get('reviewee_id')

      if (contractId) {
        // Get reviews for a contract
        const { data: reviews, error } = await supabaseClient
          .from('reviews')
          .select(`
            *,
            reviewer:profiles(id, name, avatar),
            reviewee:profiles(id, name, avatar)
          `)
          .eq('contract_id', contractId)

        if (error) throw error

        return new Response(
          JSON.stringify({ reviews }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else if (revieweeId) {
        // Get reviews for a user
        const { data: reviews, error } = await supabaseClient
          .from('reviews')
          .select(`
            *,
            reviewer:profiles(id, name, avatar),
            contract:contracts(id, project:projects(title))
          `)
          .eq('reviewee_id', revieweeId)
          .order('created_at', { ascending: false })

        if (error) throw error

        // Calculate average rating
        const avgRating = reviews?.length > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0

        return new Response(
          JSON.stringify({ 
            reviews, 
            average_rating: Math.round(avgRating * 10) / 10,
            total_reviews: reviews?.length || 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else {
        return new Response(
          JSON.stringify({ error: 'Either contract_id or reviewee_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (method === 'PATCH') {
      // Update review
      const { review_id, ...updateData } = await req.json()

      if (!review_id) {
        return new Response(
          JSON.stringify({ error: 'Review ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify ownership
      const { data: existingReview } = await supabaseClient
        .from('reviews')
        .select('reviewer_id, reviewee_id')
        .eq('id', review_id)
        .single()

      if (!existingReview || existingReview.reviewer_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'You can only update your own reviews' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: review, error } = await supabaseClient
        .from('reviews')
        .update(updateData)
        .eq('id', review_id)
        .select()
        .single()

      if (error) throw error

      // Update freelancer profile rating if reviewee is freelancer
      await updateFreelancerRating(supabaseClient, existingReview.reviewee_id)

      return new Response(
        JSON.stringify({ review }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Reviews error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function updateFreelancerRating(supabaseClient: any, freelancerId: string) {
  // Use the get_reputation_stats RPC as single source of truth for rating calculation
  const { data: stats, error } = await supabaseClient
    .rpc('get_reputation_stats', { p_freelancer_id: freelancerId })

  if (error) {
    console.error('Failed to calculate reputation stats:', error)
    return
  }

  if (!stats || stats.length === 0) return

  const averageRating = Number(stats[0].average_rating) || 0

  // Update freelancer profile with RPC-computed rating
  await supabaseClient
    .from('freelancer_profiles')
    .update({ rating: Math.round(averageRating * 10) / 10 })
    .eq('user_id', freelancerId)
}
