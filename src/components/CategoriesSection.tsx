import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Loader2, Layers } from 'lucide-react';
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

  // Sort categories A-Z alphabetically
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const displayCategories = showAll || maxInitial === 0
    ? sortedCategories
    : sortedCategories.slice(0, maxInitial);

  const showToggleButton = maxInitial > 0 && sortedCategories.length > maxInitial;

  const handleCategoryClick = (name: string) => {
    if (mode === 'select' && onSelectCategory) {
      onSelectCategory(name);
    }
  };

  if (error) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
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

  // ─── SELECT MODE: Category selection cards ───
  if (mode === 'select') {
    return (
      <div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading categories...
          </div>
        ) : displayCategories.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">No categories available</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {displayCategories.map((cat) => {
                const meta = resolveCategoryMeta(cat.name);
                const Icon = meta.icon;
                const isSelected = selectedCategory === cat.name;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryClick(cat.name)}
                    className={`group flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-500/10 scale-[1.02]'
                        : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50 hover:shadow-sm'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                      isSelected
                        ? `${meta.bgColor} ${meta.color} scale-110`
                        : 'bg-slate-50 text-slate-500 group-hover:scale-110'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs font-medium text-center leading-tight ${
                      isSelected ? 'text-emerald-700' : 'text-slate-600'
                    }`}>
                      {cat.name}
                    </span>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Show More / Show Less */}
            {showToggleButton && (
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
        <div
          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 transition-all duration-500 ease-in-out ${
            showAll ? 'max-h-[10000px] opacity-100' : 'max-h-[600px] opacity-100'
          }`}
        >
          {displayCategories.map((cat) => {
            const meta = resolveCategoryMeta(cat.name);
            const Icon = meta.icon;
            const catCount = counts[cat.name] ?? 0;

            return (
              <div
                key={cat.id}
                className="group bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-default"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.bgColor} ${meta.color} mb-3 group-hover:scale-110 transition-transform duration-200`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-slate-900 text-sm leading-tight">{cat.name}</h3>
                  {catCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full flex-shrink-0">
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
          className="mt-6 w-full py-3 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-2xl border border-slate-200 hover:border-emerald-200 transition-all flex items-center justify-center gap-2 group"
        >
          <span className="transition-transform duration-300 inline-flex items-center gap-2">
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
