import { supabase } from './supabase';

// Types
export interface Contest {
  id: string;
  client_id: string;
  title: string;
  description: string;
  category: string;
  prize_amount: number;
  second_prize: number;
  third_prize: number;
  skills_required: string[];
  contest_type: 'design' | 'development' | 'writing' | 'marketing' | 'other';
  status: 'draft' | 'active' | 'judging' | 'completed' | 'cancelled';
  start_date: string;
  end_date: string;
  max_submissions: number;
  submission_count: number;
  winner_id: string | null;
  created_at: string;
  updated_at: string;
  client?: {
    name: string;
    avatar: string | null;
  };
}

export interface ContestSubmission {
  id: string;
  contest_id: string;
  freelancer_id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_type: string | null;
  preview_url: string | null;
  status: 'submitted' | 'shortlisted' | 'winner' | 'rejected';
  rank: number | null;
  prize_amount: number;
  created_at: string;
  updated_at: string;
  freelancer?: {
    name: string;
    avatar: string | null;
  };
  vote_count?: number;
}

export interface ContestComment {
  id: string;
  contest_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  user?: {
    name: string;
    avatar: string | null;
  };
}

// Contest Categories
export const CONTEST_CATEGORIES = [
  'Logo Design',
  'Web Design',
  'Mobile App Design',
  'UI/UX Design',
  'Graphic Design',
  'Frontend Development',
  'Backend Development',
  'Full Stack Development',
  'Mobile Development',
  'Content Writing',
  'Copywriting',
  'SEO Content',
  'Social Media Marketing',
  'Brand Strategy',
  'Other',
] as const;

// Contest Service
// Shared utility
export function getTimeRemaining(endDate: string): string {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export const contestService = {
  // Get all active contests (public)
  async getActiveContests(limit = 20): Promise<Contest[]> {
    const { data, error } = await supabase
      .from('contests')
      .select('*')
      .eq('status', 'active')
      .order('end_date', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error fetching contests:', error);
      return [];
    }
    return (data ?? []) as unknown as Contest[];
  },

  // Get contest by ID
  async getContestById(contestId: string): Promise<Contest | null> {
    const { data, error } = await supabase
      .from('contests')
      .select('*')
      .eq('id', contestId)
      .single();

    if (error) {
      console.error('Error fetching contest:', error);
      return null;
    }
    return data as unknown as Contest;
  },

  // Get client's contests
  async getClientContests(clientId: string): Promise<Contest[]> {
    const { data, error } = await supabase
      .from('contests')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching client contests:', error);
      return [];
    }
    return (data || []) as unknown as Contest[];
  },

  // Create contest
  async createContest(contest: Omit<Contest, 'id' | 'created_at' | 'updated_at' | 'submission_count' | 'winner_id' | 'status'>): Promise<{ success: boolean; data?: Contest; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('contests')
        .insert({
          client_id: contest.client_id,
          title: contest.title,
          description: contest.description,
          category: contest.category,
          prize_amount: contest.prize_amount,
          second_prize: contest.second_prize,
          third_prize: contest.third_prize,
          skills_required: contest.skills_required,
          contest_type: contest.contest_type,
          status: 'active',
          start_date: contest.start_date,
          end_date: contest.end_date,
          max_submissions: contest.max_submissions,
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data: data as unknown as Contest };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to create contest';
      return { success: false, error };
    }
  },

  // Update contest
  async updateContest(contestId: string, updates: Partial<Contest>): Promise<boolean> {
     
    const { error } = await (supabase as any)
      .from('contests')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', contestId);

    return !error;
  },

  // Delete contest
  async deleteContest(contestId: string): Promise<boolean> {
    const { error } = await supabase
      .from('contests')
      .delete()
      .eq('id', contestId);

    return !error;
  },

  // Get submissions for a contest
  async getContestSubmissions(contestId: string): Promise<ContestSubmission[]> {
    const { data, error } = await supabase
      .from('contest_submissions')
      .select('*, freelancer:profiles!contest_submissions_freelancer_id_fkey(name, avatar)')
      .eq('contest_id', contestId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching submissions:', error);
      return [];
    }
    return (data ?? []) as unknown as ContestSubmission[];
  },

  // Get user's submission for a contest
  async getUserSubmission(contestId: string, userId: string): Promise<ContestSubmission | null> {
    const { data, error } = await supabase
      .from('contest_submissions')
      .select('*')
      .eq('contest_id', contestId)
      .eq('freelancer_id', userId)
      .single();

    if (error) return null;
    return data as unknown as ContestSubmission;
  },

  // Submit to contest
  async submitToContest(submission: Omit<ContestSubmission, 'id' | 'created_at' | 'updated_at' | 'status' | 'rank' | 'prize_amount'>): Promise<{ success: boolean; data?: ContestSubmission; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('contest_submissions')
        .insert({
          contest_id: submission.contest_id,
          freelancer_id: submission.freelancer_id,
          title: submission.title,
          description: submission.description,
          file_url: submission.file_url,
          file_type: submission.file_type,
          preview_url: submission.preview_url,
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data: data as unknown as ContestSubmission };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to submit';
      return { success: false, error };
    }
  },

  // Update submission status (contest owner only)
  async updateSubmissionStatus(submissionId: string, status: ContestSubmission['status'], rank?: number, prizeAmount?: number): Promise<boolean> {
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (rank !== undefined) updates.rank = rank;
    if (prizeAmount !== undefined) updates.prize_amount = prizeAmount;

    const { error } = await (supabase as any)
      .from('contest_submissions')
      .update(updates)
      .eq('id', submissionId);

    return !error;
  },

  // Vote on submission
  async voteOnSubmission(submissionId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('contest_votes')
        .insert({ submission_id: submissionId, user_id: userId });

      if (error) throw error;
      return { success: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to vote';
      return { success: false, error };
    }
  },

  // Remove vote
  async removeVote(submissionId: string, userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('contest_votes')
      .delete()
      .eq('submission_id', submissionId)
      .eq('user_id', userId);

    return !error;
  },

  // Get vote count for submission
  async getVoteCount(submissionId: string): Promise<number> {
    const { count, error } = await supabase
      .from('contest_votes')
      .select('id', { count: 'exact', head: true })
      .eq('submission_id', submissionId);

    if (error) return 0;
    return count || 0;
  },

  // Check if user has voted
  async hasUserVoted(submissionId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('contest_votes')
      .select('id')
      .eq('submission_id', submissionId)
      .eq('user_id', userId)
      .single();

    return !error && !!data;
  },

  // Get comments for contest
  async getContestComments(contestId: string): Promise<ContestComment[]> {
    const { data, error } = await supabase
      .from('contest_comments')
      .select('*, user:profiles!contest_comments_user_id_fkey(name, avatar)')
      .eq('contest_id', contestId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching comments:', error);
      return [];
    }
    return (data || []) as unknown as ContestComment[];
  },

  // Add comment
  async addComment(contestId: string, userId: string, content: string, parentId?: string): Promise<{ success: boolean; data?: ContestComment; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('contest_comments')
        .insert({
          contest_id: contestId,
          user_id: userId,
          content,
          parent_id: parentId || null,
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, data: data as unknown as ContestComment };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to add comment';
      return { success: false, error };
    }
  },

  // Delete comment
  async deleteComment(commentId: string): Promise<boolean> {
    const { error } = await supabase
      .from('contest_comments')
      .delete()
      .eq('id', commentId);

    return !error;
  },

  // Get contests by category
  async getContestsByCategory(category: string, limit = 20): Promise<Contest[]> {
    const { data, error } = await supabase
      .from('contests')
      .select('*')
      .eq('category', category)
      .eq('status', 'active')
      .order('end_date', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error fetching contests by category:', error);
      return [];
    }
    return (data ?? []) as unknown as Contest[];
  },

  // Search contests
  async searchContests(query: string): Promise<Contest[]> {
    const { data, error } = await supabase
      .from('contests')
      .select('*')
      .eq('status', 'active')
      .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
      .order('end_date', { ascending: true })
      .limit(20);

    if (error) {
      console.error('Error searching contests:', error);
      return [];
    }
    return (data || []) as unknown as Contest[];
  },
};
