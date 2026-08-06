import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Search, X } from 'lucide-react';
import { useIndustries } from '../hooks/useIndustries';

interface IndustrySelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Professional searchable industry dropdown.
 * Fetches all industries in real-time from the `industries` table and lets the
 * user type to filter. Falls back gracefully while loading or on error.
 */
export function IndustrySelect({
  value,
  onChange,
  placeholder = 'Select industry...',
  className = '',
}: IndustrySelectProps) {
  const { industries, loading } = useIndustries();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  // Focus search when the panel opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return industries;
    return industries.filter((i) => i.name.toLowerCase().includes(q));
  }, [industries, query]);

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger (div[role=button] so the inner clear button stays valid HTML) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-slate-200 bg-white text-left cursor-pointer focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all hover:border-slate-300"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          <span className={`truncate text-sm ${value ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
            {value || (loading ? 'Loading industries...' : placeholder)}
          </span>
        </span>
        {value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setOpen(false);
            }}
            className="shrink-0 p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Clear industry"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <ChevronDown
            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </div>

      {/* Panel */}
      {open && (
        <div className="absolute z-50 mt-2 w-full bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-900/10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search industries..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              />
            </div>
          </div>

          {/* List */}
          <div role="listbox" className="max-h-60 overflow-y-auto py-1.5">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No industries found</p>
            ) : (
              filtered.map((industry) => {
                const isSelected = industry.name === value;
                return (
                  <button
                    key={industry.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(industry.name)}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Building2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span className="truncate">{industry.name}</span>
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer count */}
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {industries.length} industries
            </span>
            <span className="text-[10px] text-slate-400">Real-time · All sectors</span>
          </div>
        </div>
      )}
    </div>
  );
}
