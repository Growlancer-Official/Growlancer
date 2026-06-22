import { useState, useEffect } from 'react';
import { Loader2, Search, X, ChevronDown, Check } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { useSkills } from '../hooks/useSkills';
import { resolveCategoryMeta } from '../lib/categories';
import { searchSkills } from '../lib/skills';

interface SkillsSelectorProps {
  /** Max skills user can select */
  maxSkills?: number;
  /** Max categories user can select (for freelancer onboarding) */
  maxCategories?: number;
  /** Selected category IDs */
  selectedCategoryIds?: string[];
  /** Selected skill IDs */
  selectedSkillIds?: string[];
  /** Callback when skills change */
  onSkillsChange?: (skillIds: string[]) => void;
  /** Callback when categories change */
  onCategoriesChange?: (categoryIds: string[]) => void;
  /** Mode: 'freelancer' = select up to 3 categories, 'client' = select 1 category */
  mode?: 'freelancer' | 'client';
}

export function SkillsSelector({
  maxSkills = 15,
  maxCategories = 3,
  selectedCategoryIds = [],
  selectedSkillIds = [],
  onSkillsChange,
  onCategoriesChange,
  mode = 'client',
}: SkillsSelectorProps) {
  const { categories, loading: catLoading } = useCategories();
  const { skills, getSkillsBySubcategory, loading: skillLoading } = useSkills();

  const [step, setStep] = useState<'category' | 'subcategory' | 'skills'>(selectedCategoryIds.length > 0 ? 'subcategory' : 'category');
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Get all subcategories for selected categories
  const availableSubcategories = skills.filter(
    (s) => selectedCategoryIds.includes(s.category_name || '')
  );
  const uniqueSubcategories = [...new Set(availableSubcategories.map((s) => s.subcategory_name || ''))].sort();

  // Get available skills based on selected subcategories
  const availableSkills = selectedSubcategories.length > 0
    ? availableSubcategories.filter((s) => selectedSubcategories.includes(s.subcategory_name || ''))
    : availableSubcategories;

  const filteredSkills = searchQuery
    ? searchSkills(availableSkills, searchQuery)
    : availableSkills;

  const toggleCategory = (catId: string) => {
    if (!onCategoriesChange) return;
    const isSelected = selectedCategoryIds.includes(catId);
    if (isSelected) {
      onCategoriesChange(selectedCategoryIds.filter((id) => id !== catId));
    } else if (selectedCategoryIds.length < maxCategories) {
      onCategoriesChange([...selectedCategoryIds, catId]);
    }
  };

  const toggleSubcategory = (subName: string) => {
    setSelectedSubcategories((prev) =>
      prev.includes(subName) ? prev.filter((s) => s !== subName) : [...prev, subName]
    );
  };

  const toggleSkill = (skillId: string) => {
    if (!onSkillsChange) return;
    const isSelected = selectedSkillIds.includes(skillId);
    if (isSelected) {
      onSkillsChange(selectedSkillIds.filter((id) => id !== skillId));
    } else if (selectedSkillIds.length < maxSkills) {
      onSkillsChange([...selectedSkillIds, skillId]);
    }
  };

  // Count distinct skills for each category
  const categorySkillCount = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return 0;
    return skills.filter((s) => s.category_name === cat.name).length;
  };

  if (catLoading || skillLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading categories and skills...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress Steps */}
      <div className="flex items-center gap-2 text-sm mb-4">
        {['category', 'subcategory', 'skills'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              step === s
                ? 'bg-emerald-100 text-emerald-700'
                : ['category', 'subcategory', 'skills'].indexOf(step) > i
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-100 text-slate-400'
            }`}>
              {['category', 'subcategory', 'skills'].indexOf(step) > i ? '✓' : i + 1}
            </span>
            <span className={`text-xs font-medium ${
              step === s ? 'text-slate-900' : 'text-slate-400'
            }`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < 2 && <ChevronDown className="w-3 h-3 text-slate-300 -rotate-90" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Category */}
      {step === 'category' && (
        <div>
          <p className="text-xs text-slate-500 mb-3">
            {mode === 'freelancer'
              ? `Select up to ${maxCategories} categories that best describe your expertise`
              : 'Select a category for your project'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {categories.map((cat) => {
              const meta = resolveCategoryMeta(cat.name);
              const Icon = meta.icon;
              const isSelected = selectedCategoryIds.includes(cat.id);
              const skillCount = categorySkillCount(cat.id);

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`group flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                  } ${mode === 'client' && selectedCategoryIds.length > 0 && !isSelected ? 'opacity-50' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.bgColor} ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-700 text-center leading-tight">{cat.name}</span>
                  <span className="text-[10px] text-slate-400">{skillCount} skills</span>
                  {isSelected && <Check className="w-3 h-3 text-emerald-600" />}
                </button>
              );
            })}
          </div>

          {selectedCategoryIds.length > 0 && (
            <button
              type="button"
              onClick={() => setStep('subcategory')}
              className="mt-4 w-full py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors text-sm"
            >
              Next: Select Subcategories ({selectedCategoryIds.length} selected)
            </button>
          )}
        </div>
      )}

      {/* Step 2: Select Subcategories */}
      {step === 'subcategory' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500">
              Select subcategories to narrow down skills
            </p>
            <button
              type="button"
              onClick={() => setStep('skills')}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
            >
              Skip to Skills
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueSubcategories.map((sub) => {
              const isSelected = selectedSubcategories.includes(sub);
              const count = availableSubcategories.filter((s) => s.subcategory_name === sub).length;
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => toggleSubcategory(sub)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    isSelected
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-200'
                  }`}
                >
                  {sub}
                  <span className="ml-1 text-[10px] opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => setStep('category')}
              className="px-4 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep('skills')}
              className="flex-1 py-2 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors text-xs"
            >
              {selectedSubcategories.length > 0
                ? `Next: Select Skills (${selectedSubcategories.length} subcategories)`
                : 'Continue to All Skills'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Select Skills */}
      {step === 'skills' && (
        <div>
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Selected count */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500">
              {selectedSkillIds.length}/{maxSkills} skills selected
            </p>
            <button
              type="button"
              onClick={() => setStep('subcategory')}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              ← Back to subcategories
            </button>
          </div>

          {/* Selected skills chips */}
          {selectedSkillIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3 p-2 bg-emerald-50 rounded-xl">
              {skills
                .filter((s) => selectedSkillIds.includes(s.id))
                .map((skill) => (
                  <span
                    key={skill.id}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-white text-emerald-700 rounded-lg"
                  >
                    {skill.name}
                    <button
                      type="button"
                      onClick={() => toggleSkill(skill.id)}
                      className="hover:text-emerald-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
            </div>
          )}

          {/* Skills grid */}
          <div className="max-h-60 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
              {filteredSkills.slice(0, 100).map((skill) => {
                const isSelected = selectedSkillIds.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => toggleSkill(skill.id)}
                    disabled={!isSelected && selectedSkillIds.length >= maxSkills}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all text-left truncate ${
                      isSelected
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                        : selectedSkillIds.length >= maxSkills
                        ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                        : 'bg-white border-slate-100 text-slate-600 hover:border-emerald-200'
                    }`}
                    title={skill.name}
                  >
                    {skill.name}
                  </button>
                );
              })}
            </div>
            {filteredSkills.length > 100 && (
              <p className="text-xs text-slate-400 text-center mt-2">
                +{filteredSkills.length - 100} more skills. Use search to narrow down.
              </p>
            )}
            {filteredSkills.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">
                No skills found matching your search
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
