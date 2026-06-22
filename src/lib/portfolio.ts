/**
 * Portfolio Service
 * Data-access layer for freelancer portfolio items (portfolio_items table).
 */
import { supabase, realtimeChannels } from './supabase';

export interface PortfolioItem {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  project_url: string | null;
  tags: string[];
  technologies_used: string[];
  media_urls: string[];
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PortfolioItemInput {
  title: string;
  description?: string;
  category?: string;
  image_url?: string;
  project_url?: string;
  tags?: string[];
  technologies_used?: string[];
  media_urls?: string[];
  is_featured?: boolean;
}

export const portfolioService = {
  /**
   * Fetch all portfolio items for a user.
   */
  async getByUser(userId: string): Promise<PortfolioItem[]> {
    try {
      const { data, error } = await (supabase.from('portfolio_items' as any))
        .select('*')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as PortfolioItem[];
    } catch (error) {
      console.error('Error fetching portfolio items:', error);
      return [];
    }
  },

  /**
   * Create a new portfolio item.
   */
  async create(
    userId: string,
    input: PortfolioItemInput
  ): Promise<{ success: boolean; item?: PortfolioItem; error?: string }> {
    try {
      const { data, error } = await (supabase.from('portfolio_items' as any))
        .insert({
          user_id: userId,
          title: input.title,
          description: input.description || null,
          category: input.category || null,
          image_url: input.image_url || null,
          project_url: input.project_url || null,
          tags: input.tags || [],
          technologies_used: input.technologies_used || [],
          media_urls: input.media_urls || [],
          is_featured: input.is_featured || false,
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, item: data as unknown as PortfolioItem };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create portfolio item';
      return { success: false, error: msg };
    }
  },

  /**
   * Update an existing portfolio item.
   */
  async update(
    itemId: string,
    userId: string,
    updates: Partial<PortfolioItemInput>
  ): Promise<{ success: boolean; item?: PortfolioItem; error?: string }> {
    try {
      const { data, error } = await (supabase.from('portfolio_items' as any))
        .update({
          title: updates.title,
          description: updates.description,
          category: updates.category,
          image_url: updates.image_url,
          project_url: updates.project_url,
          tags: updates.tags,
          technologies_used: updates.technologies_used,
          media_urls: updates.media_urls,
          is_featured: updates.is_featured,
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return { success: true, item: data as unknown as PortfolioItem };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update portfolio item';
      return { success: false, error: msg };
    }
  },

  /**
   * Delete a portfolio item.
   */
  async delete(
    itemId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await (supabase.from('portfolio_items' as any))
        .delete()
        .eq('id', itemId)
        .eq('user_id', userId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to delete portfolio item';
      return { success: false, error: msg };
    }
  },

  /**
   * Toggle featured status.
   */
  async toggleFeatured(
    itemId: string,
    userId: string,
    isFeatured: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await (supabase.from('portfolio_items' as any))
        .update({ is_featured: isFeatured, updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .eq('user_id', userId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to toggle featured status';
      return { success: false, error: msg };
    }
  },

  /**
   * Reorder portfolio items.
   */
  async reorder(
    items: { id: string; sort_order: number }[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const promises = items.map((item) =>
        (supabase.from('portfolio_items' as any))
          .update({ sort_order: item.sort_order })
          .eq('id', item.id)
      );
      await Promise.all(promises);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to reorder items';
      return { success: false, error: msg };
    }
  },

  /**
   * Subscribe to real-time portfolio updates.
   */
  subscribeToPortfolio(userId: string, callback: () => void) {
    const channel = realtimeChannels.portfolio(userId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'portfolio_items',
        filter: `user_id=eq.${userId}`,
      }, () => callback())
      .subscribe();

    return () => channel.unsubscribe();
  },
};
