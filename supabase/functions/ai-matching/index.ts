import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

interface Project {
  id: string;
  category: string;
  skills_required: string[];
  budget_min: number;
  budget_max: number;
  experience_level: string;
}

interface Freelancer {
  id: string;
  skills: string[];
  categories: string[];
  hourly_rate: number;
  availability: boolean;
  experience_years: number;
  completion_rate: number;
  reputation_score: number;
}

interface MatchResult {
  project_id: string;
  freelancer_id: string;
  match_score: number;
  skill_score: number;
  experience_score: number;
  budget_score: number;
  availability_score: number;
  completion_score: number;
  category_score: number;
}

// Rate limiting - DB-backed (uses service role client)
const ROUTE = 'ai-matching';
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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { project_id } = await req.json();

    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit check (use project_id as identifier since there's no authenticated user)
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const identifier = project_id || clientIP;
    const allowed = await checkRateLimit(supabase, identifier);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch project details matching DB schema columns perfectly
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, category, skills_required, budget_min, budget_max, experience_level')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all freelancers with nested schema columns matching database constraints perfectly
    // Exclude soft-deleted profiles (deleted_at IS NULL)
    const { data: freelancers, error: freelancersError } = await supabase
      .from('profiles')
      .select(`
        id,
        freelancer_profiles (
          skills,
          hourly_rate,
          availability,
          experience,
          completion_rate,
          reputation_score
        )
      `)
      .eq('role', 'freelancer')
      .is('deleted_at', null);

    // Fetch freelancer service categories for category-based matching
    const { data: allServices } = await supabase
      .from('services')
      .select('freelancer_id, category')
      .eq('status', 'active');

    // Build a map of freelancer_id -> categories
    const freelancerCategoryMap = new Map<string, Set<string>>();
    if (allServices) {
      for (const svc of allServices) {
        if (!freelancerCategoryMap.has(svc.freelancer_id)) {
          freelancerCategoryMap.set(svc.freelancer_id, new Set());
        }
        freelancerCategoryMap.get(svc.freelancer_id)!.add(svc.category);
      }
    }

    if (freelancersError) {
      console.error('Failed to fetch freelancers:', freelancersError);
      return new Response(JSON.stringify({ error: 'Failed to fetch freelancers', details: freelancersError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate match scores for each freelancer
    const matches: MatchResult[] = [];

    for (const freelancer of freelancers || []) {
      const fProfile = freelancer.freelancer_profiles?.[0] || freelancer.freelancer_profiles;
      if (!fProfile) continue;

      const freelancerCategories = freelancerCategoryMap.get(freelancer.id) || new Set();
      const freelancerData: Freelancer = {
        id: freelancer.id,
        skills: Array.isArray(fProfile.skills) ? fProfile.skills : [],
        categories: Array.from(freelancerCategories),
        hourly_rate: Number(fProfile.hourly_rate) || 0,
        availability: fProfile.availability === true || fProfile.availability === 'true',
        experience_years: Number(fProfile.experience) || 0,
        completion_rate: Number(fProfile.completion_rate) || 100,
        reputation_score: Number(fProfile.reputation_score) || 100,
      };

      const score = calculateMatchScore(project as Project, freelancerData);
      
      // Strict matching: freelancer must have a decent score and must match both skills AND category (designation)
      if (score.match_score >= 40 && score.skill_score > 0 && score.category_score > 0) {
        matches.push(score);
      }
    }

    // Sort by match score descending
    matches.sort((a, b) => b.match_score - a.match_score);

    // Clear existing matches for this project
    await supabase
      .from('ai_matches')
      .delete()
      .eq('project_id', project_id);

    // Insert new matches (top 10)
    const topMatches = matches.slice(0, 10);
    
    if (topMatches.length > 0) {
      const { error: insertError } = await supabase
        .from('ai_matches')
        .insert(topMatches);

      if (insertError) {
        console.error('Failed to insert AI matches:', insertError);
        throw insertError;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      matches: topMatches,
      total_analyzed: freelancers?.length || 0,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('AI Matching internal error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown internal error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function calculateMatchScore(project: Project, freelancer: Freelancer): MatchResult {
  // 1. CATEGORY MATCH (10 points) — freelancer has services in the project's category
  const categoryMatch = freelancer.categories.some(c => {
    const cleanCat = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanProjCat = (project.category || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanCat.includes(cleanProjCat) || cleanProjCat.includes(cleanCat);
  });
  const categoryScore = categoryMatch ? 10 : 0;

  // 2. SKILL MATCH (35 points) — reduced to make room for category
  const skillScore = calculateSkillScore(project.skills_required, freelancer.skills);

  // 3. EXPERIENCE (20 points)
  const experienceScore = calculateExperienceScore(project.experience_level, freelancer.experience_years);

  // 4. BUDGET FIT (20 points)
  const budgetScore = calculateBudgetScore(project.budget_min, project.budget_max, freelancer.hourly_rate);

  // 5. AVAILABILITY (10 points)
  const availabilityScore = freelancer.availability ? 10 : 0;

  // 6. COMPLETION & REPUTATION (5 points) — reduced to make room for category
  const completionScore = ((freelancer.completion_rate + freelancer.reputation_score) / 200) * 5;

  const totalScore = categoryScore + skillScore + experienceScore + budgetScore + availabilityScore + completionScore;

  return {
    project_id: project.id,
    freelancer_id: freelancer.id,
    match_score: Math.min(100, Math.round(totalScore)),
    skill_score: Math.round(skillScore),
    experience_score: Math.round(experienceScore),
    budget_score: Math.round(budgetScore),
    availability_score: Math.round(availabilityScore),
    completion_score: Math.round(completionScore),
    category_score: Math.round(categoryScore),
  };
}

function calculateSkillScore(requiredSkills: string[], freelancerSkills: string[]): number {
  if (!requiredSkills || requiredSkills.length === 0) return 40;
  if (!freelancerSkills || freelancerSkills.length === 0) return 0;

  const matchedSkills = requiredSkills.filter(skill =>
    freelancerSkills.some(fs => {
      const cleanFs = fs.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanSkill = skill.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanFs.includes(cleanSkill) || cleanSkill.includes(cleanFs);
    })
  );

  return (matchedSkills.length / requiredSkills.length) * 35;
}

function calculateExperienceScore(requiredLevel: string, freelancerYears: number): number {
  const requirements: Record<string, { min: number; max: number }> = {
    entry: { min: 0, max: 2 },
    beginner: { min: 0, max: 2 },
    intermediate: { min: 2, max: 5 },
    expert: { min: 5, max: 100 },
  };

  const req = requirements[requiredLevel] || requirements.intermediate;

  if (freelancerYears >= req.min && freelancerYears <= req.max) {
    return 20;
  } else if (freelancerYears > req.max) {
    return 15; // Overqualified
  } else if (freelancerYears >= req.min - 1) {
    return 10; // Close to requirement
  }

  return 0;
}

function calculateBudgetScore(budgetMin: number, budgetMax: number, hourlyRate: number): number {
  if (hourlyRate === 0) return 10; // Baseline points if no rate is set

  // If budget_max is small (<= 150), it is treated as a direct hourly rate filter
  if (budgetMax <= 150) {
    if (hourlyRate >= budgetMin && hourlyRate <= budgetMax) {
      return 20;
    } else if (hourlyRate > budgetMax && hourlyRate <= budgetMax * 1.2) {
      return 10;
    } else if (hourlyRate < budgetMin && hourlyRate >= budgetMin * 0.8) {
      return 15;
    }
    return 0;
  }

  // If budget_max is large (> 150), it is a fixed budget. We assume a 40-hour project volume.
  const estimatedCost = hourlyRate * 40;
  if (estimatedCost >= budgetMin && estimatedCost <= budgetMax) {
    return 20;
  } else if (estimatedCost > budgetMax && estimatedCost <= budgetMax * 1.2) {
    return 10;
  } else if (estimatedCost < budgetMin && estimatedCost >= budgetMin * 0.8) {
    return 15;
  }

  return 5; // Moderate fit
}
