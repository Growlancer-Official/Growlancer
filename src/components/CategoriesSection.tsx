import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Loader2, Layers, Search, X } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { resolveCategoryMeta } from '../lib/categories';

interface CategoriesSectionProps {
  /** 'browse' mode: show categories as a responsive card grid with count badges */
  /** 'select' mode: show categories as selectable cards for form fields */
  mode: 'browse' | 'select';
  /** For 'select' mode: currently selected category name */
  selectedCategory?: string;
  /** For 'select' mode: callback when category is selected */
  onSelectCategory?: (categoryName: string) => void;
  /** Max categories to show initially (0 = show all) */
  maxInitial?: number;
}

export function CategoriesSection({
  mode,
  selectedCategory,
  onSelectCategory,
  maxInitial = 0,
}: CategoriesSectionProps) {
  const { categories, counts, loading, error, refresh } = useCategories();
  const [showAll, setShowAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Sort categories A-Z alphabetically
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  // Live search filter (select mode)
  const searchedCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter((cat) => cat.name.toLowerCase().includes(q));
  }, [sortedCategories, searchQuery]);

  const displayCategories = showAll || maxInitial === 0 || searchQuery.trim()
    ? searchedCategories
    : searchedCategories.slice(0, maxInitial);

  const showToggleButton = maxInitial > 0 && sortedCategories.length > maxInitial;

  const handleCategoryClick = (name: string) => {
    if (mode === 'select' && onSelectCategory) {
      onSelectCategory(name);
    }
  };

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">Could not load categories</p>
          <p className="text-xs text-amber-600 mt-1">{error}</p>
        </div>
        <button
          onClick={refresh}
          className="px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 rounded-xl transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ─── SELECT MODE: searchable A–Z line list ───
  if (mode === 'select') {
    return (
      <div>
        {loading ? (
          <div className="flex items-center gap-3 text-sm text-slate-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading categories...
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories..."
                className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="Clear category search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* A–Z line list */}
            {displayCategories.length === 0 ? (
              <div className="border border-slate-200 rounded-xl bg-white py-8 text-center">
                <p className="text-sm text-slate-500">
                  No categories found matching &quot;{searchQuery}&quot;
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                <div className="max-h-80 overflow-y-auto overscroll-contain divide-y divide-slate-50">
                  {displayCategories.map((cat) => {
                    const meta = resolveCategoryMeta(cat.name);
                    const Icon = meta.icon;
                    const isSelected = selectedCategory === cat.name;

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategoryClick(cat.name)}
                        aria-pressed={isSelected}
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
                        <span
                          className={`shrink-0 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected ? 'border-emerald-500' : 'border-slate-300 group-hover:border-emerald-400'
                          }`}
                        >
                          {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Show More / Show Less (hidden while searching) */}
            {showToggleButton && !searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="mt-3 w-full py-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors flex items-center justify-center gap-1"
              >
                {showAll ? (
                  <>Show Less <ChevronUp className="w-4 h-4" /></>
                ) : (
                  <>Show All Categories ({sortedCategories.length}) <ChevronDown className="w-4 h-4" /></>
                )}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  // ─── BROWSE MODE: Clean category cards grid (no subcategories) ───
  return (
    <div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        </div>
      ) : displayCategories.length === 0 ? (
        <div className="text-center py-8">
          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No categories found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 content-start">
          {displayCategories.map((cat) => {
            const meta = resolveCategoryMeta(cat.name);
            const Icon = meta.icon;
            const catCount = counts[cat.name] ?? 0;

            return (
              <div
                key={cat.id}
                className="group bg-white rounded-xl border border-slate-100 p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-default"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.bgColor} ${meta.color} mb-3 group-hover:scale-110 transition-transform duration-200`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-slate-900 text-sm leading-tight">{cat.name}</h3>
                  {catCount > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full flex-shrink-0">
                      {catCount}
                    </span>
                  )}
                </div>
                {cat.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{cat.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Show More / Show Less with slide animation */}
      {showToggleButton && !loading && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-6 w-full py-3 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl border border-slate-200 hover:border-emerald-200 transition-all flex items-center justify-center gap-3 group"
        >
          <span className="transition-transform duration-300 inline-flex items-center gap-3">
            {showAll ? (
              <>Show Less <ChevronUp className="w-4 h-4 transition-transform duration-300 rotate-0" /></>
            ) : (
              <>Show All Categories ({sortedCategories.length}) <ChevronDown className="w-4 h-4 transition-transform duration-300 group-hover:translate-y-0.5" /></>
            )}
          </span>
        </button>
      )}
    </div>
  );
}
