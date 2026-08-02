import { useState } from 'react';
import { Loader2, Search, X, Check, Plus, Sparkles } from 'lucide-react';
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
 * 🗂️ Category-only picker.
 *
 * Growlancer works on 145 top-level categories — subcategories and the
 * pre-seeded skill hierarchy are NOT shown to users. Freelancers and clients
 * add their own skills as free text (their choice, their words), and all
 * matching/recommendations run on the category.
 *
 * This component replaces the old 3-step Category → Subcategory → Skills
 * selector everywhere, and removes the heavy 3,410-skill fetch from
 * onboarding / post-project / profile flows (big perf win).
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

  // Filter categories by the live search query (name match)
  const filteredCategories = searchQuery.trim()
    ? categories.filter((cat) =>
        cat.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : categories;

  const toggleCategory = (catId: string) => {
    if (!onCategoriesChange) return;
    const isSelected = selectedCategoryIds.includes(catId);
    if (isSelected) {
      onCategoriesChange(selectedCategoryIds.filter((id) => id !== catId));
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
      <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
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
            Select {mode === 'client' ? 'a category' : 'categories'}
            <span className="text-red-400">*</span>
          </p>
          {mode !== 'client' && (
            <span className="text-xs text-slate-400">
              {selectedCategoryIds.length}/{maxCategories} selected
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear category search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
          {filteredCategories.map((cat) => {
            const meta = resolveCategoryMeta(cat.name);
            const Icon = meta.icon;
            const isSelected = selectedCategoryIds.includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className={`group flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                } ${mode === 'client' && selectedCategoryIds.length > 0 && !isSelected ? 'opacity-50' : ''}`}
                title={cat.name}
              >
                <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${meta.bgColor} ${meta.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 text-[11px] font-medium text-slate-700 leading-tight truncate">
                  {cat.name}
                </span>
                {isSelected && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
              </button>
            );
          })}
        </div>
        {filteredCategories.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">
            No categories found matching &quot;{searchQuery}&quot;
          </p>
        )}
      </div>

      {/* Free-text skills */}
      {showSkills && (
        <div className="border-t border-slate-100 pt-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <p className="text-sm font-medium text-slate-700">Add your own skills</p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Type the skills you {mode === 'client' ? 'need for this project' : 'offer'} — e.g. React, Python, Figma.
            Add as many as you want.
          </p>

          <div className="flex gap-2 mb-3">
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
            <div className="flex flex-wrap gap-2 p-3 bg-emerald-50/60 rounded-xl">
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
                    <X className="w-3 h-3" />
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
