import { useMemo, useState } from 'react';
import { Check, Layers, Loader2, Plus, Search, Sparkles, X } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { resolveCategoryMeta } from '../lib/categories';

interface CategoryPickerProps {
  /** Max categories user can select (freelancer: 3, client: 1) */
  maxCategories?: number;
  /** Selected category IDs */
  selectedCategoryIds?: string[];
  /** Callback when categories change */
  onCategoriesChange?: (categoryIds: string[]) => void;
  /** Free-text skills already selected (user types their own skills) */
  selectedSkills?: string[];
  /** Callback when free-text skills change */
  onSkillsChange?: (skills: string[]) => void;
  /** Mode: 'freelancer' = multi category + skills, 'client' = single category + skills */
  mode?: 'freelancer' | 'client';
  /** Show the free-text skills input (default true) */
  showSkills?: boolean;
}

/**
 * 🗂️ Category-only picker — searchable A–Z line list.
 *
 * Growlancer works on 145 top-level categories — subcategories and the
 * pre-seeded skill hierarchy are NOT shown to users. Freelancers and clients
 * add their own skills as free text (their choice, their words), and all
 * matching/recommendations run on the category.
 *
 * Categories render as a single-column A–Z line list (grouped by first
 * letter with sticky headers) plus a live search box, so all 145 categories
 * are easy to scan and pick. Single-select (client) rows behave like radio
 * buttons — picking a new category replaces the old one.
 */
export function CategoryPicker({
  maxCategories = 3,
  selectedCategoryIds = [],
  onCategoriesChange,
  selectedSkills = [],
  onSkillsChange,
  mode = 'freelancer',
  showSkills = true,
}: CategoryPickerProps) {
  const { categories, loading: catLoading } = useCategories();

  const [searchQuery, setSearchQuery] = useState('');
  const [skillInput, setSkillInput] = useState('');

  const isSingleSelect = mode === 'client' || maxCategories === 1;

  // Live search filter (case-insensitive name match)
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((cat) => cat.name.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  // Group matches A–Z by first letter (categories are already sorted A–Z)
  const groupedCategories = useMemo(() => {
    const groups = new Map<string, typeof categories>();
    for (const cat of filteredCategories) {
      const letter = (cat.name.charAt(0) || '#').toUpperCase();
      const bucket = groups.get(letter);
      if (bucket) bucket.push(cat);
      else groups.set(letter, [cat]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredCategories]);

  const toggleCategory = (catId: string) => {
    if (!onCategoriesChange) return;
    const isSelected = selectedCategoryIds.includes(catId);
    if (isSelected) {
      onCategoriesChange(selectedCategoryIds.filter((id) => id !== catId));
    } else if (maxCategories === 1) {
      // Single-select: picking a new category replaces the current one
      onCategoriesChange([catId]);
    } else if (selectedCategoryIds.length < maxCategories) {
      onCategoriesChange([...selectedCategoryIds, catId]);
    }
  };

  const addSkill = (skill: string) => {
    const trimmed = skill.trim();
    if (!trimmed || !onSkillsChange) return;
    if (!selectedSkills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      onSkillsChange([...selectedSkills, trimmed]);
    }
    setSkillInput('');
  };

  const removeSkill = (skill: string) => {
    if (onSkillsChange) {
      onSkillsChange(selectedSkills.filter((s) => s !== skill));
    }
  };

  if (catLoading) {
    return (
      <div className="flex items-center gap-3 py-4 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading categories...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Category selection */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-700">
            Select {isSingleSelect ? 'a category' : 'categories'}
            <span className="text-red-400">*</span>
          </p>
          <div className="flex items-center gap-3">
            {!isSingleSelect && selectedCategoryIds.length > 0 && (
              <button
                type="button"
                onClick={() => onCategoriesChange?.([])}
                className="text-xs font-medium text-slate-400 hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            )}
            <span className="text-xs text-slate-400">
              {selectedCategoryIds.length}/{maxCategories} selected
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories... (e.g. AI, design, marketing)"
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Clear category search"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-300 pointer-events-none">
              A–Z
            </span>
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
          <Layers className="w-3.5 h-3.5" />
          {categories.length} categories · listed alphabetically
        </p>

        {/* A–Z line list */}
        <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
          <div className="max-h-80 overflow-y-auto overscroll-contain">
            {groupedCategories.map(([letter, items]) => (
              <div key={letter}>
                <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-slate-400 border-y border-slate-100">
                  {letter}
                </div>
                <div className="divide-y divide-slate-50">
                  {items.map((cat) => {
                    const meta = resolveCategoryMeta(cat.name);
                    const Icon = meta.icon;
                    const isSelected = selectedCategoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        aria-pressed={isSelected}
                        title={cat.name}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 group ${
                          isSelected ? 'bg-emerald-50/80' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <span
                          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-150 group-hover:scale-105 ${meta.bgColor} ${meta.color}`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span
                          className={`flex-1 min-w-0 truncate text-[13px] ${
                            isSelected ? 'font-semibold text-emerald-800' : 'font-medium text-slate-700'
                          }`}
                        >
                          {cat.name}
                        </span>
                        {isSingleSelect ? (
                          /* Radio-style indicator (client / single select) */
                          <span
                            className={`shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-colors ${
                              isSelected ? 'border-emerald-500' : 'border-slate-300 group-hover:border-emerald-400'
                            }`}
                          >
                            {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                          </span>
                        ) : (
                          /* Checkbox-style indicator (freelancer / multi select) */
                          <span
                            className={`shrink-0 w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-slate-300 group-hover:border-emerald-400'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3.5} />}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {filteredCategories.length === 0 && (
              <div className="px-4 py-10 text-center">
                <Search className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500 mb-3">
                  No categories found matching &quot;{searchQuery}&quot;
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Free-text skills */}
      {showSkills && (
        <div className="border-t border-slate-100 pt-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <p className="text-sm font-medium text-slate-700">Add your own skills</p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Type the skills you {isSingleSelect ? 'need for this project' : 'offer'} — e.g. React, Python, Figma.
            Add as many as you want.
          </p>

          <div className="flex gap-3 mb-3">
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSkill(skillInput);
                }
              }}
              placeholder="Type a skill and press Enter"
              className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={() => addSkill(skillInput)}
              className="px-4 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors"
              aria-label="Add skill"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {selectedSkills.length > 0 ? (
            <div className="flex flex-wrap gap-3 p-3 bg-emerald-50/60 rounded-xl">
              {selectedSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-emerald-700 rounded-lg text-xs font-medium border border-emerald-200"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="hover:text-emerald-900"
                    aria-label={`Remove ${skill}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              No skills added yet. Skills help you get better matches.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
