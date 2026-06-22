/**
 * Skills utility — provides helpers for looking up skills by subcategory/category.
 * All skill data is fetched from the database via `useSkills()` hook.
 * This file provides static helpers for display and fallback.
 */

export interface SkillData {
  id: string;
  name: string;
  slug: string;
  subcategory_id: string;
  subcategory_name?: string;
  category_name?: string;
}

export interface SubcategoryWithSkills {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string;
  skills: SkillData[];
}

/**
 * Group skills by their subcategory for cascading selectors.
 */
export function groupSkillsBySubcategory(skills: SkillData[]): Record<string, SkillData[]> {
  const grouped: Record<string, SkillData[]> = {};
  for (const skill of skills) {
    const key = skill.subcategory_id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(skill);
  }
  return grouped;
}

/**
 * Check if a skill name exists in a list of skills (case-insensitive).
 */
export function hasSkill(skills: SkillData[], skillName: string): boolean {
  return skills.some((s) => s.name.toLowerCase() === skillName.toLowerCase());
}

/**
 * Search skills by query (case-insensitive, partial match).
 */
export function searchSkills(skills: SkillData[], query: string): SkillData[] {
  const q = query.toLowerCase().trim();
  if (!q) return skills;
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.subcategory_name?.toLowerCase().includes(q) ||
      s.category_name?.toLowerCase().includes(q)
  );
}

/**
 * Get unique subcategories from a list of skills.
 */
export function getUniqueSubcategories(skills: SkillData[]): { id: string; name: string; category_name?: string }[] {
  const map = new Map<string, { id: string; name: string; category_name?: string }>();
  for (const skill of skills) {
    if (!map.has(skill.subcategory_id)) {
      map.set(skill.subcategory_id, {
        id: skill.subcategory_id,
        name: skill.subcategory_name || skill.subcategory_id,
        category_name: skill.category_name,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
