import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X, MapPin } from 'lucide-react';
import { useCountries } from '../hooks/useCountries';

// ═══════════════════════════════════════════════════════════════════════════
// Country code → flag emoji mapping (ISO 3166-1 alpha-2)
// ═══════════════════════════════════════════════════════════════════════════
function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const code = countryCode.toUpperCase();
  const first = 0x1f1e6 + code.charCodeAt(0) - 65;
  const second = 0x1f1e6 + code.charCodeAt(1) - 65;
  return String.fromCodePoint(first, second);
}

// ═══════════════════════════════════════════════════════════════════════════
// Pinned countries — shown at the top regardless of search
// ═══════════════════════════════════════════════════════════════════════════
const PINNED_CODES = ['IN']; // India always first

interface CountrySelectProps {
  value: string;
  onChange: (country: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Industry-level country selector used in onboarding and profile forms.
 *
 * Features:
 * - India 🇮🇳 pinned at the top with "Currently Available" badge
 * - All 197 countries searchable by typing (name or code)
 * - Flag emojis for every country
 * - Keyboard navigation (↑↓ to move, Enter to select, Esc to close)
 * - "Remote / Online" quick option
 * - Fuzzy search: "united" matches "United States", "United Kingdom", etc.
 */
export function CountrySelect({
  value,
  onChange,
  placeholder = 'Search for your country...',
  className = '',
}: CountrySelectProps) {
  const { countries, loading } = useCountries();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Derived: display label for the selected country ──
  const selectedCountry = useMemo(() => {
    if (!value) return null;
    // Match by name or code
    const found = countries.find(
      c => c.name === value || c.code.toUpperCase() === value.toUpperCase()
    );
    return found || { name: value, code: '', id: '' };
  }, [value, countries]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    let list = countries;

    if (q) {
      list = countries.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
      );
    }

    // Separate pinned from rest
    const pinned = list.filter(c => PINNED_CODES.includes(c.code.toUpperCase()));
    const rest = list.filter(c => !PINNED_CODES.includes(c.code.toUpperCase()));

    return { pinned, rest };
  }, [countries, query]);

  const totalCount = filtered.pinned.length + filtered.rest.length + 1; // +1 for "Remote"

  // ── Open/close ──
  const handleOpen = () => {
    setOpen(true);
    setQuery('');
    setHighlightIdx(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleClose = () => {
    setOpen(false);
    setQuery('');
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Keyboard navigation ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleOpen();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx(prev => Math.min(prev + 1, totalCount - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        selectByIndex(highlightIdx);
        break;
      case 'Escape':
        handleClose();
        break;
    }
  };

  // ── Select by flat index ──
  const selectByIndex = (idx: number) => {
    let i = 0;
    // "Remote" is always index 0
    if (idx === 0) {
      onChange('Remote');
      handleClose();
      return;
    }
    i = 1;
    // Pinned countries
    for (const c of filtered.pinned) {
      if (i === idx) { onChange(c.name); handleClose(); return; }
      i++;
    }
    // Rest
    for (const c of filtered.rest) {
      if (i === idx) { onChange(c.name); handleClose(); return; }
      i++;
    }
  };

  // ── Scroll highlighted item into view ──
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${highlightIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
          open
            ? 'border-emerald-500 ring-2 ring-emerald-200'
            : 'border-slate-200 hover:border-slate-300'
        } bg-white`}
      >
        {selectedCountry ? (
          <>
            <span className="text-lg">{getFlagEmoji(selectedCountry.code)}</span>
            <span className="flex-1 text-sm font-medium text-slate-900 truncate">
              {selectedCountry.name}
            </span>
          </>
        ) : (
          <>
            <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
            <span className="flex-1 text-sm text-slate-400">{loading ? 'Loading countries...' : placeholder}</span>
          </>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Search input */}
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Search countries..."
                className="w-full pl-9 pr-8 py-2.5 text-sm rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 outline-none transition-all"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); setHighlightIdx(0); inputRef.current?.focus(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          {/* Country list */}
          <div ref={listRef} className="max-h-64 overflow-y-auto overscroll-contain">
            {/* "Remote / Online" option — always first */}
            <button
              type="button"
              data-idx={0}
              onClick={() => { onChange('Remote'); handleClose(); }}
              onMouseEnter={() => setHighlightIdx(0)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                highlightIdx === 0 ? 'bg-emerald-50' : 'hover:bg-slate-50'
              }`}
            >
              <span className="text-lg">🌐</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-slate-900">Remote / Online</span>
                <span className="text-xs text-slate-400 ml-2">Work from anywhere</span>
              </div>
              {value === 'Remote' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              )}
            </button>

            {/* Pinned: India */}
            {filtered.pinned.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-emerald-50/50 border-y border-emerald-100/50">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                    🇮🇳 Currently Available
                  </span>
                </div>
                {filtered.pinned.map((c, i) => {
                  const idx = 1 + i;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-idx={idx}
                      onClick={() => { onChange(c.name); handleClose(); }}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        highlightIdx === idx ? 'bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-lg">{getFlagEmoji(c.code)}</span>
                      <span className="text-sm font-semibold text-emerald-700">{c.name}</span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded ml-1">
                        AVAILABLE
                      </span>
                      {value === c.name && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 ml-auto shrink-0" />
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* Coming Soon countries */}
            {filtered.rest.length > 0 && (
              <>
                <div className="px-4 py-1.5 bg-slate-50 border-y border-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Coming Soon
                  </span>
                </div>
                {filtered.rest.map((c, i) => {
                  const idx = 1 + filtered.pinned.length + i;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-idx={idx}
                      onClick={() => { onChange(c.name); handleClose(); }}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        highlightIdx === idx ? 'bg-slate-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-lg">{getFlagEmoji(c.code)}</span>
                      <span className="text-sm text-slate-700">{c.name}</span>
                      <span className="text-[10px] text-slate-400 ml-auto">{c.code}</span>
                      {value === c.name && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* No results */}
            {totalCount === 1 && query && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-slate-500">No countries match "{query}"</p>
                <p className="text-xs text-slate-400 mt-1">Try a different search term</p>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 text-center">
              ↑↓ Navigate · Enter Select · Esc Close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
