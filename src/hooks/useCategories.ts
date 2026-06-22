import { useState, useEffect, useCallback } from 'react';
import { supabase, dbFunctions } from '../lib/supabase';

// Ensures each hook instance gets a unique channel to avoid 'cannot add callbacks after subscribe()'
let channelInstanceId = 0;

export interface Skill {
  id: string;
  name: string;
  slug: string;
}

export interface Subcategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  skills: Skill[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string | null;
  display_order: number;
  subcategories: Subcategory[];
}

interface CategoryCounts {
  [categoryName: string]: number;
}

interface FreelancerCounts {
  [categoryName: string]: number;
}

interface UseCategoriesReturn {
  categories: Category[];
  flatNames: string[];
  counts: CategoryCounts;
  freelancerCounts: FreelancerCounts;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCategories(): UseCategoriesReturn {
  const [categories, setCategories] = useState<Category[]>([]);
  const [counts, setCounts] = useState<CategoryCounts>({});
  const [freelancerCounts, setFreelancerCounts] = useState<FreelancerCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [hierarchyResult, countsResult, freelancerResult] = await Promise.all([
        dbFunctions.getCategoryHierarchy(),
        dbFunctions.getCategoryCountsV2(),
        dbFunctions.getActiveFreelancersByCategory(),
      ]);

      // Gracefully handle missing RPC functions (pre-launch: migrations may not be applied yet)
      if (hierarchyResult.error) {
        console.warn('Category hierarchy RPC not available (migration pending):', hierarchyResult.error.message);
      } else if (hierarchyResult.data) {
        setCategories(hierarchyResult.data as Category[]);
      }

      if (countsResult.error) {
        console.warn('Category counts RPC not available (migration pending):', countsResult.error.message);
      } else if (countsResult.data) {
        setCounts(countsResult.data as CategoryCounts);
      }

      if (freelancerResult.error) {
        console.warn('Freelancer counts RPC not available (migration pending):', freelancerResult.error.message);
      } else if (freelancerResult.data) {
        setFreelancerCounts(freelancerResult.data as FreelancerCounts);
      }
    } catch (err) {
      // Unexpected errors (not missing RPC functions)
      console.warn('Error fetching categories (non-critical):', err);
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Real-time subscription for category changes
  useEffect(() => {
    const instanceId = ++channelInstanceId;
    const channelName = `categories-realtime-${instanceId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => { fetchAll(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subcategories' },
        () => { fetchAll(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: 'status=eq.open' },
        () => {
          // Refresh counts when a project is created/updated/deleted
          dbFunctions.getCategoryCountsV2().then((r) => {
            if (!r.error && r.data) setCounts(r.data as CategoryCounts);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'services', filter: 'active=eq.true' },
        () => {
          dbFunctions.getCategoryCountsV2().then((r) => {
            if (!r.error && r.data) setCounts(r.data as CategoryCounts);
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  // Build flat list of category names (for dropdowns/filters)
  const flatNames = categories.map((c) => c.name);

  return {
    categories,
    flatNames,
    counts,
    freelancerCounts,
    loading,
    error,
    refresh: fetchAll,
  };
}
