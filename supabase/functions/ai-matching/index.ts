import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ─── OmniRoute LLM gateway (OpenAI-compatible) — AI semantic match boost ────
const OMNIROUTE_BASE_URL = (Deno.env.get('OMNIROUTE_BASE_URL') || 'http://localhost:20128/v1').replace(/\/+$/, '');
const OMNIROUTE_API_KEY = Deno.env.get('OMNIROUTE_API_KEY') || '';
const OMNIROUTE_MODEL = Deno.env.get('OMNIROUTE_MODEL') || 'auto';

const ALLOWED_ORIGINS = [
  'https://growlancer-mrkhan154212s-projects.vercel.app',
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
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

interface Project {
  id: string;
  title: string;
  category: string;
  skills_required: string[];
  budget_min: number;
  budget_max: number;
  experience_level: string;
  description?: string;
}

interface FreelancerCandidate {
  id: string;
  name: string;
  skills: string[];
  categories: string[];
  hourly_rate: number;
  availability: boolean;
  experience_years: number;
  completion_rate: number;
  reputation_score: number;
  bio?: string;
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
  ai_score: number | null;
  match_reason: string | null;
}

// Rate limiting - DB-backed (uses service role client)
const ROUTE = 'ai-matching';
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60000;

async function checkRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);

  try {
    await supabaseClient.rpc('cleanup_expired_rate_limits');
  } catch {
    // Non-critical; cleanup also runs via cron
  }

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

  await supabaseClient
    .from('rate_limits')
    .insert({ identifier, route: ROUTE, count: 1, window_start: now.toISOString() });

  return true;
}

/**
 * AI semantic scoring pass via OmniRoute.
 * Asks the LLM to evaluate the top deterministic candidates against the
 * project and return refined scores + a one-line reason. Best-effort: if the
 * gateway is unreachable (e.g. local gateway offline), returns null and the
 * deterministic scores are used as-is — matching ALWAYS works.
 */
async function omniRouteSemanticBoost(
  project: Project,
  candidates: FreelancerCandidate[]
): Promise<Map<string, { ai_score: number; reason: string }> | null> {
  if (!OMNIROUTE_API_KEY || candidates.length === 0) return null;

  const candidatePayload = candidates.map((c) => ({
    id: c.id.slice(0, 8),
    name: c.name || 'Freelancer',
    skills: c.skills || [],
    categories: c.categories || [],
    hourly_rate: c.hourly_rate || 0,
    experience_years: c.experience_years || 0,
    completion_rate: c.completion_rate || 100,
    bio: c.bio ? c.bio.slice(0, 200) : '',
  }));

  const systemPrompt = `You are Growlancer's AI matchmaking engine. Given a project and a list of freelancer candidates, score how well each candidate fits the project from 0-100 and give a short one-line reason.

Respond with STRICT JSON ONLY — an object of the form:
{"<candidate_id>": {"score": <0-100 integer>, "reason": "<one short line>"}}

Rules:
- Score primarily on skill overlap, domain relevance, and experience fit.
- Consider budget compatibility (candidate hourly_rate vs project budget).
- Never invent skills. Use only what is provided.
- Keep reasons under 12 words, professional and specific.`;

  const userPrompt = `PROJECT:
Title: ${project.title || ''}
Category: ${project.category || ''}
Skills required: ${(project.skills_required || []).join(', ')}
Budget range: ₹${project.budget_min || 0} - ₹${project.budget_max || 0}
Experience level: ${project.experience_level || 'intermediate'}
Description: ${project.description ? project.description.slice(0, 300) : ''}

CANDIDATES (JSON):
${JSON.stringify(candidatePayload)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000); // 9s hard cap

    const response = await fetch(`${OMNIROUTE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OMNIROUTE_API_KEY}`,
      },
      body: JSON.stringify({
        model: OMNIROUTE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error('[ai-matching] OmniRoute semantic pass failed:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) return null;

    // Extract the JSON object (strip markdown fences if present)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const resultMap = new Map<string, { ai_score: number; reason: string }>();
    for (const [key, value] of Object.entries(parsed)) {
      const v = value as { score?: number; reason?: string };
      if (typeof v?.score === 'number') {
        resultMap.set(key, {
          ai_score: Math.max(0, Math.min(100, Math.round(v.score))),
          reason: String(v.reason || '').slice(0, 120),
        });
      }
    }
    return resultMap;
  } catch (err) {
    console.error('[ai-matching] OmniRoute semantic pass error (falling back to deterministic):', err?.message || err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Service-role client for DB ops (used below).
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  // Anon client with the caller's JWT — verify identity before touching the DB.
  const supabaseAnon = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  );

  try {
    // 🔒 Require an authenticated user
    const { data: authData } = await supabaseAnon.auth.getUser();
    if (!authData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { project_id } = await req.json();

    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit check
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const identifier = project_id || clientIP;
    const allowed = await checkRateLimit(supabase, identifier);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch project details
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, title, category, skills_required, budget_min, budget_max, experience_level, description')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all freelancers (exclude soft-deleted)
    const { data: freelancers, error: freelancersError } = await supabase
      .from('profiles')
      .select(`
        id,
        name,
        bio,
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

    // ─── PASS 1: deterministic scores (fast, always works) ─────────────────
    const candidates: FreelancerCandidate[] = [];
    const matches: MatchResult[] = [];

    for (const freelancer of freelancers || []) {
      const fProfile = freelancer.freelancer_profiles?.[0] || freelancer.freelancer_profiles;
      if (!fProfile) continue;

      const freelancerCategories = freelancerCategoryMap.get(freelancer.id) || new Set();
      const freelancerData: FreelancerCandidate = {
        id: freelancer.id,
        name: freelancer.name || 'Freelancer',
        bio: freelancer.bio || '',
        skills: Array.isArray(fProfile.skills) ? fProfile.skills : [],
        categories: Array.from(freelancerCategories),
        hourly_rate: Number(fProfile.hourly_rate) || 0,
        availability: fProfile.availability === true || fProfile.availability === 'true',
        experience_years: Number(fProfile.experience) || 0,
        completion_rate: Number(fProfile.completion_rate) || 100,
        reputation_score: Number(fProfile.reputation_score) || 100,
      };

      const score = calculateMatchScore(project as Project, freelancerData);

      // Strict matching: decent score + skills AND category overlap
      if (score.match_score >= 40 && score.skill_score > 0 && score.category_score > 0) {
        matches.push(score);
        candidates.push(freelancerData);
      }
    }

    // Sort by match score descending
    matches.sort((a, b) => b.match_score - a.match_score);

    // ─── PASS 2: OmniRoute AI semantic boost (top 25, best-effort) ─────────
    const topDeterministic = matches.slice(0, 25);
    const topCandidates = candidates.slice(0, 25);
    let aiBoost: Map<string, { ai_score: number; reason: string }> | null = null;

    if (topDeterministic.length > 0) {
      aiBoost = await omniRouteSemanticBoost(project as Project, topCandidates);
    }

    const finalMatches: MatchResult[] = topDeterministic.map((m) => {
      const shortId = m.freelancer_id.slice(0, 8);
      const boost = aiBoost?.get(shortId);

      // Blend: 60% deterministic + 40% AI semantic (when available)
      let matchScore = m.match_score;
      let aiScore: number | null = null;
      let reason: string | null = null;

      if (boost) {
        aiScore = boost.ai_score;
        matchScore = Math.min(100, Math.round(m.match_score * 0.6 + boost.ai_score * 0.4));
        reason = boost.reason || null;
      }

      return { ...m, match_score: matchScore, ai_score: aiScore, match_reason: reason };
    });

    // ─── Persist matches (replaces old ones for this project) ───────────────
    await supabase
      .from('ai_matches')
      .delete()
      .eq('project_id', project_id);

    if (finalMatches.length > 0) {
      const { error: insertError } = await supabase
        .from('ai_matches')
        .insert(finalMatches);

      if (insertError) {
        console.error('Failed to insert AI matches:', insertError);
        throw insertError;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      matches: finalMatches,
      total_analyzed: freelancers?.length || 0,
      ai_enhanced: aiBoost !== null,
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

function calculateMatchScore(project: Project, freelancer: FreelancerCandidate): MatchResult {
  // 1. CATEGORY MATCH (10 points)
  const categoryMatch = freelancer.categories.some(c => {
    const cleanCat = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanProjCat = (project.category || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanCat.includes(cleanProjCat) || cleanProjCat.includes(cleanCat);
  });
  const categoryScore = categoryMatch ? 10 : 0;

  // 2. SKILL MATCH (35 points)
  const skillScore = calculateSkillScore(project.skills_required, freelancer.skills);

  // 3. EXPERIENCE (20 points)
  const experienceScore = calculateExperienceScore(project.experience_level, freelancer.experience_years);

  // 4. BUDGET FIT (20 points)
  const budgetScore = calculateBudgetScore(project.budget_min, project.budget_max, freelancer.hourly_rate);

  // 5. AVAILABILITY (10 points)
  const availabilityScore = freelancer.availability ? 10 : 0;

  // 6. COMPLETION & REPUTATION (5 points)
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
    ai_score: null,
    match_reason: null,
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
