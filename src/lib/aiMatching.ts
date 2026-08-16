import { supabase, uniqueChannelName } from './supabase';

export interface AIMatch {
  id: string;
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
  created_at: string;
}

export interface AIMatchWithProfile extends AIMatch {
  freelancer: {
    id: string;
    name: string;
    avatar: string;
    is_pro?: boolean;
    verification_status?: string | null;
    categories: string[];
    skills: string[];
    hourly_rate: number;
    availability: string;
    bio?: string;
    location?: string;
    freelancer_profiles?: {
      experience_years: number;
      completion_rate: number;
      total_projects: number;
      rating: number;
      reviews_count: number;
    };
  };
}

export interface AIMatchWithProject extends AIMatch {
  project: {
    id: string;
    title: string;
    description: string;
    budget_min: number;
    budget_max: number;
    required_skills: string[];
    experience_level: string;
    timeline: string;
    category: string;
    status: string;
    created_at: string;
    client: {
      id: string;
      name: string;
      avatar: string;
    };
  };
}

// Category-Based Matchmaking Engine — matches freelancers to projects by CATEGORY (the primary signal).
// Growlancer works on 145 top-level categories: the project's category must overlap with the
// freelancer's selected categories to qualify; skills are a secondary boost.
async function runSkillBasedMatching(projectId: string): Promise<{ success: boolean; matches?: AIMatch[]; error?: string }> {
  try {
    if (import.meta.env.DEV) console.log('[aiMatching] Running Category-Based Matchmaking for Project:', projectId);
    
    // 1. Fetch project details
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
      
    if (projError || !project) {
      return { success: false, error: `Fallback failed: project not found (${projError?.message})` };
    }

    const projectCategory: string = project.category || '';
    const requiredSkills: string[] = project.skills_required || [];

    // If the project has no category, we can't match on category — return empty
    if (!projectCategory) {
      return { success: true, matches: [] };
    }

    // 2. Fetch all active freelancers with their profiles (EXCLUDING deleted users)
    const { data: profiles, error: profsError } = await supabase
      .from('profiles')
      .select(`
        id,
        name,
        avatar,
        freelancer_profiles (
          categories,
          skills,
          experience,
          rating,
          availability,
          hourly_rate,
          location
        )
      `)
      .eq('role', 'freelancer')
      .is('deleted_at', null);

    if (profsError || !profiles) {
      return { success: false, error: `Fallback failed: could not fetch freelancer profiles (${profsError?.message})` };
    }

    const calculatedMatches: any[] = [];

    // 3. Score each freelancer against the project
    for (const profile of profiles) {
      const fpRaw = Array.isArray(profile.freelancer_profiles)
        ? profile.freelancer_profiles[0]
        : profile.freelancer_profiles;

      if (!fpRaw) continue;

      const fp = fpRaw as {
        categories?: string[];
        skills?: string[];
        experience?: number;
        rating?: number;
        availability?: boolean;
        hourly_rate?: number;
        location?: string;
      };

      const freelancerCategories: string[] = fp.categories || [];
      const freelancerSkills: string[] = fp.skills || [];

      // --- CATEGORY MATCHING (Primary filter) ---
      // The freelancer must have selected the project's category (case-insensitive)
      const categoryMatched = freelancerCategories.some(
        (cat: string) => cat.toLowerCase().trim() === projectCategory.toLowerCase().trim()
      );
      if (!categoryMatched) continue; // Skip freelancers who don't cover this category
      const categoryScore = 100;

      // --- SKILL MATCHING (Secondary boost) ---
      // Any overlapping skill text adds to the score — but skills never disqualify a match
      const matchedSkills = requiredSkills.filter((s: string) =>
        freelancerSkills.some((fs: string) => fs.toLowerCase().trim() === s.toLowerCase().trim())
      );
      const skillScore = requiredSkills.length > 0
        ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
        : 50;

      // --- EXPERIENCE SCORE (0-100) ---
      const expYears = fp.experience || 0;
      let expScore = 50;
      if (project.experience_level === 'expert') {
        expScore = expYears >= 7 ? 100 : expYears >= 4 ? 80 : expYears >= 2 ? 50 : 30;
      } else if (project.experience_level === 'intermediate') {
        expScore = expYears >= 3 && expYears < 7 ? 100 : expYears >= 1 ? 80 : 40;
      } else { // entry level
        expScore = expYears <= 1 ? 100 : expYears <= 3 ? 80 : 50;
      }

      // --- BUDGET SCORE (0-100) ---
      // Fixed-pricing model: compare the freelancer's base rate directly to the
      // client's project budget (same fairness rule as the proposal smart
      // pricing — never reward a deal the freelancer would take at a loss).
      const baseRate = fp.hourly_rate || 0;
      const budgetMax = project.budget_max || 999;
      let budgetScore = 50;
      if (baseRate > 0 && budgetMax > 0) {
        if (baseRate <= budgetMax) {
          budgetScore = 100;          // base rate fits within the client's budget
        } else if (baseRate <= budgetMax * 1.3) {
          budgetScore = 80;           // slightly above budget — close enough
        } else if (baseRate <= budgetMax * 1.67) {
          budgetScore = 50;           // moderately above — may not fit
        } else {
          budgetScore = 30;           // well above budget — poor fit
        }
      }

      // --- AVAILABILITY SCORE (0-100) ---
      const availabilityScore = fp.availability ? 100 : 20;

      // --- OVERALL MATCH SCORE (weighted — category is the anchor) ---
      const matchScore = Math.min(100, Math.round(
        (categoryScore * 0.45) +
        (skillScore * 0.20) +
        (expScore * 0.15) +
        (budgetScore * 0.12) +
        (availabilityScore * 0.08)
      ));

      // Minimum threshold: category matched + at least 45% overall
      if (matchScore >= 45) {
        calculatedMatches.push({
          project_id: projectId,
          freelancer_id: profile.id,
          match_score: matchScore,
          skill_score: skillScore,
          experience_score: expScore,
          budget_score: budgetScore,
          availability_score: availabilityScore,
          completion_score: 100,
          category_score: categoryScore,
          ai_score: null,
          match_reason: null
        });
      }
    }

    // Sort by match_score descending
    calculatedMatches.sort((a, b) => b.match_score - a.match_score);

    // Take top 20 (or less)
    const topMatches = calculatedMatches.slice(0, 20);

    // 4. Write to the database
    await supabase
      .from('ai_matches')
      .delete()
      .eq('project_id', projectId);

    const { data: insertedMatches, error: insertError } = await supabase
      .from('ai_matches')
      .insert(topMatches)
      .select();

    if (insertError) {
      console.error('[aiMatching] Error inserting matches:', insertError);
      return { success: false, error: `Failed to store matches: ${insertError.message}` };
    }

    if (import.meta.env.DEV) console.log('[aiMatching] Matchmaking completed. Inserted:', insertedMatches?.length, 'out of', calculatedMatches.length, 'qualified freelancers');
    return { success: true, matches: (insertedMatches || []) as AIMatch[] };
  } catch (err: any) {
    console.error('[aiMatching] Exception in client-side fallback:', err);
    return { success: false, error: `Fallback exception: ${err.message}` };
  }
}

/**
 * Skill-based matching for TEAM PROJECT roles — same scoring engine as
 * runSkillBasedMatching, but driven by a role's required_skills + budget
 * range instead of a projects row. No new algorithm: identical weights
 * (category is skipped since roles don't carry a single category).
 * Returns top freelancers WITHOUT writing to ai_matches (roles cache their
 * own suggestions JSONB).
 */
export async function matchFreelancersBySkills(
  skills: string[],
  budgetMax?: number | null
): Promise<{ success: boolean; matches?: any[]; error?: string }> {
  try {
    const { data: profiles, error: profsError } = await supabase
      .from('profiles')
      .select(`
        id,
        name,
        avatar,
        verification_status,
        freelancer_profiles (
          categories,
          skills,
          experience,
          rating,
          availability,
          hourly_rate,
          location,
          bio
        )
      `)
      .eq('role', 'freelancer')
      .is('deleted_at', null);

    if (profsError || !profiles) {
      return { success: false, error: `Failed to fetch freelancer profiles (${profsError?.message})` };
    }

    const requiredSkills = (skills || []).map((s) => s.toLowerCase().trim()).filter(Boolean);
    const calculatedMatches: any[] = [];

    for (const profile of profiles) {
      const fpRaw = Array.isArray(profile.freelancer_profiles)
        ? profile.freelancer_profiles[0]
        : profile.freelancer_profiles;
      if (!fpRaw) continue;

      const fp = fpRaw as {
        categories?: string[];
        skills?: string[];
        experience?: number;
        rating?: number;
        availability?: boolean;
        hourly_rate?: number;
        location?: string;
        bio?: string;
      };
      const freelancerSkills: string[] = (fp.skills || []).map((s) => s.toLowerCase().trim());

      // Skills anchor: at least one required skill must overlap.
      const matchedSkills = requiredSkills.filter((s) => freelancerSkills.includes(s));
      if (requiredSkills.length > 0 && matchedSkills.length === 0) continue;

      const skillScore = requiredSkills.length > 0
        ? Math.round((matchedSkills.length / requiredSkills.length) * 100)
        : 50;

      // Experience (same bands as the main engine)
      const expYears = fp.experience || 0;
      const expScore = expYears >= 5 ? 100 : expYears >= 3 ? 80 : expYears >= 1 ? 60 : 30;

      // Budget fit (same fairness rule as the main engine)
      const baseRate = fp.hourly_rate || 0;
      let budgetScore = 50;
      if (baseRate > 0 && budgetMax) {
        if (baseRate <= budgetMax) budgetScore = 100;
        else if (baseRate <= budgetMax * 1.3) budgetScore = 80;
        else if (baseRate <= budgetMax * 1.67) budgetScore = 50;
        else budgetScore = 30;
      }

      const availabilityScore = fp.availability ? 100 : 20;

      // Same weights as the main engine, minus category (role-driven).
      const matchScore = Math.min(100, Math.round(
        (skillScore * 0.40) +
        (expScore * 0.20) +
        (budgetScore * 0.25) +
        (availabilityScore * 0.15)
      ));

      if (matchScore >= 45) {
        calculatedMatches.push({
          freelancer_id: profile.id,
          name: profile.name,
          avatar: profile.avatar,
          verification_status: profile.verification_status,
          match_score: matchScore,
          skill_score: skillScore,
          experience_score: expScore,
          budget_score: budgetScore,
          availability_score: availabilityScore,
          hourly_rate: baseRate,
          location: fp.location,
          bio: fp.bio,
          rating: fp.rating,
        });
      }
    }

    calculatedMatches.sort((a, b) => b.match_score - a.match_score);
    return { success: true, matches: calculatedMatches.slice(0, 20) };
  } catch (err: any) {
    console.error('[aiMatching] Exception in team-role matching:', err);
    return { success: false, error: `Matching exception: ${err?.message || 'unknown'}` };
  }
}

export const aiMatchingService = {
  /**
   * Generate AI matches for a project.
   * 1. Calls the ai-matching edge function (deterministic scoring + AI
   *    semantic boost, server-side, real-time numbers).
   * 2. Falls back to the client-side category/skill engine if the edge call
   *    fails (offline, gateway down, etc.) so matching ALWAYS works.
   */
  async generateMatches(projectId: string): Promise<{ success: boolean; matches?: AIMatch[]; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-matching`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ project_id: projectId }),
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (response.ok && payload?.success) {
        return { success: true, matches: (payload.matches || []) as AIMatch[] };
      }

      // Fall back to the client-side engine
      console.warn('[aiMatching] Edge function failed, using client fallback:', payload?.error);
      return await runSkillBasedMatching(projectId);
    } catch (err: any) {
      console.warn('[aiMatching] Edge function error, using client fallback:', err?.message);
      return await runSkillBasedMatching(projectId);
    }
  },

  // Get AI matches for a project with freelancer profiles
  // NOTE: After generating new matches, old data is replaced so only REAL matches show
  async getProjectMatches(projectId: string): Promise<AIMatchWithProfile[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return [];
      }

      const { data, error } = await supabase
        .from('ai_matches')
        .select(`
          *,
          freelancer:profiles!ai_matches_freelancer_id_fkey (
            id,
            name,
            avatar,
            is_pro,
            verification_status,
            freelancer_profiles (
              categories,
              skills,
              hourly_rate,
              availability,
              bio,
              location,
              experience,
              rating,
              total_reviews
            )
          )
        `)
        .eq('project_id', projectId)
        .order('match_score', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[aiMatching] Error fetching matches:', error);
        return [];
      }

      if (!data) return [];

      const mappedData = data.map((row: any) => {
        const freelancerRaw = row.freelancer;
        if (!freelancerRaw) return row;

        const fpRaw = Array.isArray(freelancerRaw.freelancer_profiles)
          ? freelancerRaw.freelancer_profiles[0]
          : freelancerRaw.freelancer_profiles;

        const fp = fpRaw || {};

        return {
          ...row,
          freelancer: {
            id: freelancerRaw.id,
            name: freelancerRaw.name,
            avatar: freelancerRaw.avatar || '',
            is_pro: freelancerRaw.is_pro || false,
            verification_status: freelancerRaw.verification_status || undefined,
            skills: fp.skills || [],
            hourly_rate: fp.hourly_rate || 0,
            availability: fp.availability ? 'Available' : 'Unavailable',
            bio: fp.bio || '',
            location: fp.location || 'Remote',
            freelancer_profiles: {
              experience_years: fp.experience || 0,
              completion_rate: fp.completion_rate ?? 0,
              total_projects: 0,
              rating: fp.rating ?? 0,
              reviews_count: fp.total_reviews ?? 0
            }
          }
        };
      });

      return mappedData as AIMatchWithProfile[];
    } catch (error) {
      console.error('[aiMatching] Exception fetching matches:', error);
      return [];
    }
  },

  // Get best projects for a freelancer (reverse matching)
  async getBestProjectsForFreelancer(freelancerId: string): Promise<AIMatchWithProject[]> {
    try {
      const { data, error } = await supabase
        .from('ai_matches')
        .select(`
          *,
          project:projects (
            id,
            title,
            description,
            budget_min,
            budget_max,
            skills_required,
            experience_level,
            deadline,
            category,
            status,
            created_at,
            client:profiles!projects_client_id_fkey (
              id,
              name,
              avatar
            )
          )
        `)
        .eq('freelancer_id', freelancerId)
        .gte('match_score', 50)
        .order('match_score', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[aiMatching] Error fetching freelancer projects:', error);
        return [];
      }

      if (!data) return [];

      const mappedData = data.map((row: any) => {
        const proj = row.project;
        if (!proj) return row;

        return {
          ...row,
          project: {
            id: proj.id,
            title: proj.title,
            description: proj.description,
            budget_min: proj.budget_min || 0,
            budget_max: proj.budget_max || 0,
            required_skills: proj.skills_required || [],
            experience_level: proj.experience_level || 'Intermediate',
            timeline: proj.deadline || '',
            category: proj.category || 'General',
            status: proj.status || 'open',
            created_at: proj.created_at || '',
            client: proj.client || { id: '', name: 'Unknown', avatar: '' }
          }
        };
      });

      return mappedData as AIMatchWithProject[];
    } catch (error) {
      console.error('[aiMatching] Exception fetching freelancer projects:', error);
      return [];
    }
  },

  // Subscribe to match updates in real-time
  subscribeToProjectMatches(
    projectId: string,
    callback: (matches: AIMatch[]) => void
  ) {
    const channel = supabase
      .channel(uniqueChannelName('ai-matches-updates', projectId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_matches',
          filter: `project_id=eq.${projectId}`,
        },
        async () => {
          const matches = await this.getProjectMatches(projectId);
          callback(matches);
        }
      )
      .subscribe();

    return channel;
  },
};
