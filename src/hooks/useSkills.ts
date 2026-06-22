import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { SkillData, SubcategoryWithSkills } from '../lib/skills';

let skillsChannelId = 0;

interface SkillRow {
  id: string;
  name: string;
  slug: string;
  subcategory_id: string;
  subcategories: { name: string; category_id: string; categories: { name: string } } | null;
}

interface UseSkillsReturn {
  skills: SkillData[];
  subcategoriesWithSkills: SubcategoryWithSkills[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getSkillsBySubcategory: (subcategoryId: string) => SkillData[];
  getSubcategoriesByCategory: (categoryId: string) => SubcategoryWithSkills[];
  getSkillsByCategory: (categoryId: string) => SkillData[];
  searchSkillsByQuery: (query: string) => SkillData[];
}

export function useSkills(): UseSkillsReturn {
  const [skills, setSkills] = useState<SkillData[]>([]);
  const [subcategoriesWithSkills, setSubcategoriesWithSkills] = useState<SubcategoryWithSkills[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch skills with their subcategory and category info
      const { data: skillsData, error: skillsError } = await supabase
        .from('skills')
        .select(`
          id,
          name,
          slug,
          subcategory_id,
          subcategories!inner (
            name,
            category_id,
            categories!inner (
              name
            )
          )
        `)
        .order('name');

      if (skillsError) {
        console.warn('Skills fetch error:', skillsError.message);
        setError(skillsError.message);
      } else if (skillsData) {
        const mapped: SkillData[] = (skillsData as unknown as SkillRow[]).map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          subcategory_id: row.subcategory_id,
          subcategory_name: row.subcategories?.name || '',
          category_name: row.subcategories?.categories?.name || '',
        }));
        setSkills(mapped);

        // Group skills by subcategory
        const subMap = new Map<string, SubcategoryWithSkills>();
        for (const skill of mapped) {
          if (!subMap.has(skill.subcategory_id)) {
            subMap.set(skill.subcategory_id, {
              id: skill.subcategory_id,
              name: skill.subcategory_name || skill.subcategory_id,
              slug: skill.subcategory_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '',
              description: null,
              category_id: '',
              skills: [],
            });
          }
          subMap.get(skill.subcategory_id)!.skills.push(skill);
        }
        setSubcategoriesWithSkills(Array.from(subMap.values()));
      }
    } catch (err) {
      console.warn('Error fetching skills:', err);
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Real-time subscription for skills changes
  useEffect(() => {
    const id = ++skillsChannelId;
    const channel = supabase
      .channel(`master-skills-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'skills' },
        () => { fetchAll(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subcategories' },
        () => { fetchAll(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const getSkillsBySubcategory = useCallback(
    (subcategoryId: string) => skills.filter((s) => s.subcategory_id === subcategoryId),
    [skills]
  );

  const getSubcategoriesByCategory = useCallback(
    (categoryId: string) =>
      subcategoriesWithSkills.filter((sub) => {
        const skill = skills.find((s) => s.subcategory_id === sub.id);
        return skill?.category_name === categoryId;
      }),
    [subcategoriesWithSkills, skills]
  );

  const getSkillsByCategory = useCallback(
    (categoryId: string) => skills.filter((s) => s.category_name === categoryId),
    [skills]
  );

  const searchSkillsByQuery = useCallback(
    (query: string) => {
      const q = query.toLowerCase().trim();
      if (!q) return skills;
      return skills.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.subcategory_name?.toLowerCase().includes(q) ||
          s.category_name?.toLowerCase().includes(q)
      );
    },
    [skills]
  );

  return {
    skills,
    subcategoriesWithSkills,
    loading,
    error,
    refresh: fetchAll,
    getSkillsBySubcategory,
    getSubcategoriesByCategory,
    getSkillsByCategory,
    searchSkillsByQuery,
  };
}
