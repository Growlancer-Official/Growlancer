import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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
  created_at: string;
}

export interface AIMatchWithProfile extends AIMatch {
  freelancer: {
    id: string;
    name: string;
    avatar: string;
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

// Client-side AI Matchmaking Engine — matches freelancers to projects by skills
async function runClientSideFallback(projectId: string): Promise<{ success: boolean; matches?: AIMatch[]; error?: string }> {
  try {
    if (import.meta.env.DEV) console.log('[aiMatching] Running Skill-Based Matchmaking for Project:', projectId);
    
    // 1. Fetch project details
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();
      
    if (projError || !project) {
      return { success: false, error: `Fallback failed: project not found (${projError?.message})` };
    }

    const requiredSkills: string[] = project.skills_required || [];
    
    // If no skills required, return empty — can't match intelligently
    if (requiredSkills.length === 0) {
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
        skills?: string[];
        experience?: number;
        rating?: number;
        availability?: boolean;
        hourly_rate?: number;
        location?: string;
      };

      const freelancerSkills: string[] = fp.skills || [];
      
      // --- SKILL MATCHING (Primary filter) ---
      // Only show freelancers who have AT LEAST ONE matching skill
      const matchedSkills = requiredSkills.filter((s: string) => 
        freelancerSkills.some((fs: string) => fs.toLowerCase().trim() === s.toLowerCase().trim())
      );
      
      if (matchedSkills.length === 0) continue; // Skip freelancers with ZERO skill match
      
      // Calculate Skill Score (0-100) — percentage of required skills matched
      const skillScore = Math.round((matchedSkills.length / requiredSkills.length) * 100);

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
      // Compare hourly rate against project's implied hourly budget
      // Assume 40hr/week for ~2 weeks = 80hrs total for budget estimation
      const hourlyRate = fp.hourly_rate || 0;
      const budgetMin = project.budget_min || 0;
      const budgetMax = project.budget_max || 999;
      
      // Estimate implicit hourly budget: budget_max / 80 (2 weeks of work)
      const impliedHourlyBudget = budgetMax > 0 ? budgetMax / 80 : 0;
      let budgetScore = 50;
      if (hourlyRate > 0 && impliedHourlyBudget > 0) {
        if (hourlyRate <= impliedHourlyBudget && hourlyRate >= impliedHourlyBudget * 0.4) {
          budgetScore = 100; // Freelancer rate fits well within budget
        } else if (hourlyRate <= impliedHourlyBudget * 1.3) {
          budgetScore = 80; // Slightly above but still reasonable
        } else if (hourlyRate <= impliedHourlyBudget * 0.4) {
          budgetScore = 70; // Very cheap — might indicate lower quality
        } else if (hourlyRate <= impliedHourlyBudget * 1.8) {
          budgetScore = 50; // Above budget but could negotiate
        } else {
          budgetScore = 30; // Too expensive
        }
      }

      // --- AVAILABILITY SCORE (0-100) ---
      const availabilityScore = fp.availability ? 100 : 20;

      // --- OVERALL MATCH SCORE (weighted) ---
      const matchScore = Math.min(100, Math.round(
        (skillScore * 0.40) +
        (expScore * 0.25) +
        (budgetScore * 0.20) +
        (availabilityScore * 0.15)
      ));

      // Minimum threshold: at least 40% overall AND at least 50% skill match (strict skill filtering)
      if (matchScore >= 40 && skillScore >= 50) {
        calculatedMatches.push({
          project_id: projectId,
          freelancer_id: profile.id,
          match_score: matchScore,
          skill_score: skillScore,
          experience_score: expScore,
          budget_score: budgetScore,
          availability_score: availabilityScore,
          completion_score: 100,
          category_score: skillScore
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

export const aiMatchingService = {
  // Generate AI matches for a project
  async generateMatches(projectId: string): Promise<{ success: boolean; matches?: AIMatch[]; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ai-matching`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ project_id: projectId }),
        }
      );

      if (!response.ok) {
        console.warn('[aiMatching] Edge function returned error status. Triggering Client-Side AI Fallback Matchmaker.');
        return await runClientSideFallback(projectId);
      }

      const data = await response.json();
      return { success: true, matches: data.matches };
    } catch (error) {
      console.warn('[aiMatching] Edge function failed with exception. Triggering Client-Side AI Fallback Matchmaker.', error);
      return await runClientSideFallback(projectId);
    }
  },

  // Get AI matches for a project with freelancer profiles
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
          freelancer:freelancer_id (
            id,
            name,
            avatar,
            freelancer_profiles (
              skills,
              hourly_rate,
              availability,
              bio,
              location,
              experience,
              rating
            )
          )
        `)
        .eq('project_id', projectId)
        .order('match_score', { ascending: false })
        .limit(10);

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
            skills: fp.skills || [],
            hourly_rate: fp.hourly_rate || 0,
            availability: fp.availability ? 'Available' : 'Unavailable',
            bio: fp.bio || '',
            location: fp.location || 'Remote',
            freelancer_profiles: {
              experience_years: fp.experience || 0,
              completion_rate: 100,
              total_projects: fp.total_projects || 0,
              rating: fp.rating ?? 0,
              reviews_count: fp.reviews_count ?? 0
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
            client:profiles (
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
      .channel('ai-matches-updates')
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
