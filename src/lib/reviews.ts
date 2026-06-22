// Reviews Service
// Pure data-access layer for reviews and reputation.
// createReview uses the edge function for server-side validation + reputation recalculation.
// Read operations use direct Supabase queries with CacheManager.

import { supabase, realtimeChannels } from './supabase';
import { CacheManager } from './services/cacheManager';
import { renderStars as renderStarsUtil } from './utils';
import type { Tables } from '../types/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zttwsjehcgaicziqyxpq.supabase.co';

// Re-export canonical DB type
export type Review = Tables<'reviews'>;

export interface ReviewData {
  contract_id: string;
  reviewee_id: string;
  rating: number;
  communication_rating?: number;
  quality_rating?: number;
  timeliness_rating?: number;
  professionalism_rating?: number;
  comment?: string;
  would_hire_again?: boolean;
}

export interface ReviewWithProfiles extends Review {
  reviewer?: {
    id: string;
    name: string;
    avatar: string | null;
  } | null;
  reviewee?: {
    id: string;
    name: string;
    avatar: string | null;
  } | null;
  contract?: {
    id: string;
    project?: {
      title: string;
    } | null;
  } | null;
}

export interface ReputationMetrics {
  reputation_score: number;
  weighted_rating: number;
  total_reviews: number;
  on_time_delivery_rate: number;
  response_rate: number;
  hire_rate: number;
  repeat_hire_rate: number;
}

export const reviewService = {
  // ==================== WRITE OPERATIONS (via Edge Function) ====================

  /**
   * Create a review. Goes through the edge function for server-side
   * validation (contract participation check) and reputation recalculation.
   */
  async createReview(data: ReviewData): Promise<{ success: boolean; review?: Review; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/reviews`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        return { success: false, error: responseData.error || responseData.message || 'Failed to create review' };
      }

      CacheManager.invalidate('reviews:');
      return { success: true, review: responseData.review };
    } catch (error) {
      console.error('Create review error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      return { success: false, error: errorMessage };
    }
  },

  // ==================== READ OPERATIONS (Direct Queries + Cache) ====================

  /**
   * Get reviews for a contract
   */
  async getContractReviews(contractId: string): Promise<ReviewWithProfiles[]> {
    const cacheKey = `reviews:contract:${contractId}`;
    const cached = CacheManager.get<ReviewWithProfiles[]>(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          reviewer:profiles!reviewer_id(id, name, avatar),
          reviewee:profiles!reviewee_id(id, name, avatar),
          contract:contracts!contract_id(
            id,
            project:projects(title)
          )
        `)
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const result = (data || []) as unknown as ReviewWithProfiles[];
      CacheManager.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error fetching contract reviews:', error);
      return [];
    }
  },

  /**
   * Get reviews for a user (as reviewee)
   */
  async getUserReviews(userId: string): Promise<{ reviews: ReviewWithProfiles[]; average_rating: number; total_reviews: number }> {
    const cacheKey = `reviews:user:${userId}`;
    const cached = CacheManager.get<{ reviews: ReviewWithProfiles[]; average_rating: number; total_reviews: number }>(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          reviewer:profiles!reviewer_id(id, name, avatar)
        `)
        .eq('reviewee_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const reviews = (data || []) as unknown as ReviewWithProfiles[];
      const totalReviews = reviews.length;
      const averageRating = totalReviews > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0;

      const result = { reviews, average_rating: Math.round(averageRating * 10) / 10, total_reviews: totalReviews };
      CacheManager.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error fetching user reviews:', error);
      return { reviews: [], average_rating: 0, total_reviews: 0 };
    }
  },

  /**
   * Get reputation metrics for a freelancer
   */
  async getReputationMetrics(freelancerId: string): Promise<ReputationMetrics | null> {
    try {
      const { data, error } = await supabase
        .from('freelancer_profiles')
        .select('reputation_score, weighted_rating, total_reviews, on_time_delivery_rate, response_rate, hire_rate, repeat_hire_rate')
        .eq('user_id', freelancerId)
        .single();

      if (error) throw error;

      return data as ReputationMetrics;
    } catch (error) {
      console.error('Error fetching reputation metrics:', error);
      return null;
    }
  },

  // ==================== WRITE OPERATIONS (Direct Queries) ====================

  /**
   * Update a review
   */
  async updateReview(reviewId: string, data: Partial<ReviewData>): Promise<{ success: boolean; review?: Review; error?: string }> {
    try {
      const { data: review, error } = await supabase
        .from('reviews')
        .update({
          rating: data.rating,
          communication_rating: data.communication_rating,
          quality_rating: data.quality_rating,
          timeliness_rating: data.timeliness_rating,
          professionalism_rating: data.professionalism_rating,
          comment: data.comment,
          would_hire_again: data.would_hire_again,
        })
        .eq('id', reviewId)
        .select()
        .single();

      if (error) throw error;

      CacheManager.invalidate('reviews:');
      return { success: true, review: review as Review };
    } catch (error) {
      console.error('Error updating review:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update review';
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Subscribe to review updates in real-time for a user
   */
  subscribe(userId: string, callback: (review: Review) => void) {
    const channel = realtimeChannels.reviews(`${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reviews',
          filter: `reviewee_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            callback(payload.new as Review);
          }
        }
      )
      .subscribe();

    return channel;
  },

  // ==================== UI HELPERS ====================

  /**
   * Render star rating as string
   */
  renderStars(rating: number): string {
    return renderStarsUtil(rating);
  },
};