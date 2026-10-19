import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, Search, X, MapPin, Globe, BellRing, Check, Loader2 } from 'lucide-react';
import { useCountries } from '../hooks/useCountries';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import { fetchCountryInterest, joinCountryWaitlist } from '../lib/countryWaitlist';

// ═══════════════════════════════════════════════════════════════════════════
// CountrySelect — the onboarding / profile country picker.
//
// Contract (tested in src/test/countrySelectContract.test.tsx):
//   • India is PINNED first, labelled AVAILABLE, and is the only selectable
//     country. Availability is a server-side truth, not a free pick.
//   • Every other country is browsable A→Z under "Coming soon" with a live
//     interest count, and tapping one joins its waitlist (it is never selected
//     — onChange is not called for it).
//   • "Remote / Online" stays a work mode, not a country.
//   • Optional `onPick` hands the tap decision to the parent (used by the OAuth
//     country gate) — the list itself stays identical either way, so every
//     country picker in the app shows the same countries in the same order.
//
// Real time: interest counts are refetched when the dropdown opens, right after
// a successful join, and on a light interval while it stays open. We deliberately
// do NOT open a `postgres_changes` channel on `waitlist` — RLS only lets admins
// SELECT that table, so a browser subscription would fail (and log an
// unauthorized error) for every normal user. The admin console keeps its own
// realtime channel, where the permission actually exists.
// ═══════════════════════════════════════════════════════════════════════════

function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const code = countryCode.toUpperCase();
  const first = 0x1f1e6 + code.charCodeAt(0) - 65;
  const second = 0x1f1e6 + code.charCodeAt(1) - 65;
  return String.fromCodePoint(first, second);
}

/** Countries that are actually live. Everything else is waitlist-only. */
const AVAILABLE_CODES = ['IN'];

/** How often to refresh interest counts while the dropdown is open. */
const COUNT_REFRESH_MS = 25000;

interface CountrySelectProps {
  value: string;
  onChange: (country: string) => void;
  placeholder?: string;
  className?: string;
  /**
   * Optional: the PARENT owns what happens on a country tap, so this component
   * becomes a pure picker (same list, same A→Z order, same search) and the
   * default per-row behaviour — select for the live country, waitlist join for
   * the rest — is skipped. The "Remote / Online" work-mode row is hidden too,
   * because it is not a country and only onboarding needs it.
   *
   * Used by the OAuth country gate so signing in and onboarding pick from the
   * exact same list instead of a hand-curated handful of countries.
   */
  onPick?: (country: { name: string; code: string }) => void;
  /** Locks the picker while the parent is submitting (e.g. the OAuth country gate). */
  disabled?: boolean;
}

export function CountrySelect({
  value,
  onChange,
  placeholder = 'Search for your country...',
  className = '',
  onPick,
  disabled = false,
}: CountrySelectProps) {
  const { countries, loading } = useCountries();
  const { isAuthenticated } = useAuth();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [interest, setInterest] = useState<Record<string, number>>({});
  const [requested, setRequested] = useState<Record<string, true>>({});
  const [pending, setPending] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Selected country label ──────────────────────────────────────────────
  const selectedCountry = useMemo(() => {
    if (!value) return null;
    const found = countries.find(
      (c) => c.name === value || c.code.toUpperCase() === value.toUpperCase(),
    );
    return found || { name: value, code: '', id: '' };
  }, [value, countries]);

  const selectedIsAvailable = selectedCountry
    ? AVAILABLE_CODES.includes(selectedCountry.code.toUpperCase())
    : false;

  // ── Interest counts ─────────────────────────────────────────────────────
  const loadInterest = useCallback(async () => {
    const rows = await fetchCountryInterest();
    const map: Record<string, number> = {};
    for (const row of rows) map[row.country] = row.interested;
    setInterest(map);
  }, []);

  useEffect(() => {
    loadInterest();
  }, [loadInterest]);

  useEffect(() => {
    if (!open) return;
    // Fresh numbers on every open…
    void loadInterest();
    // …and a light refresh while it stays open, so a count that moves on the
    // server shows up without a reload.
    const timer = window.setInterval(() => void loadInterest(), COUNT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [open, loadInterest]);

  // ── Grouping ────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = q
      ? countries.filter(
          (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
        )
      : countries;

    return {
      available: list.filter((c) => AVAILABLE_CODES.includes(c.code.toUpperCase())),
      comingSoon: list.filter((c) => !AVAILABLE_CODES.includes(c.code.toUpperCase())),
    };
  }, [countries, query]);

  // Flat index order: [0 = Remote,] then available, then coming soon.
  const flat = useMemo(
    () => [...groups.available, ...groups.comingSoon],
    [groups.available, groups.comingSoon],
  );
  // The Remote row is the first entry only when it is rendered at all.
  const showRemote = !onPick;
  const countryOffset = showRemote ? 1 : 0;
  const totalCount = flat.length + countryOffset;

  // ── Open / close ────────────────────────────────────────────────────────
  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setHighlightIdx(0);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleClose = () => {
    setOpen(false);
    setQuery('');
  };

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

  // A parent that owns the flow (onPick) gets every country tap; otherwise the
  // default rules apply (live country → select, coming-soon → waitlist).
  const pickCountry = useCallback(
    (country: { name: string; code: string }) => {
      if (!onPick) return false;
      onPick(country);
      handleClose();
      return true;
    },
    [onPick],
  );

  // ── Join the waitlist for a coming-soon country ─────────────────────────
  const requestWaitlist = useCallback(
    async (countryName: string) => {
      if (requested[countryName]) return;
      if (pending === countryName) return; // double-tap guard

      if (!isAuthenticated) {
        toast.info(
          'Sign in to join',
          `Create an account and we'll email you the moment ${countryName} goes live.`,
        );
        return;
      }

      setPending(countryName);
      const result = await joinCountryWaitlist(countryName);
      setPending(null);

      if (!result.success) {
        toast.error('Could not join waitlist', result.error || 'Please try again in a moment.');
        return;
      }

      if (result.available) {
        toast.info('Already available', `${countryName} is live — you can select it right away.`);
        return;
      }

      setRequested((prev) => ({ ...prev, [countryName]: true }));
      setInterest((prev) => ({
        ...prev,
        [countryName]: (prev[countryName] ?? 0) + (result.already_exists ? 0 : 1),
      }));
      toast.success(
        result.already_exists ? 'Already on the list' : `You're on the ${countryName} list`,
        `We'll email you as soon as Growlancer launches in ${countryName}.`,
      );
    },
    [isAuthenticated, pending, requested, toast],
  );

  // ── Keyboard navigation ─────────────────────────────────────────────────
  const activate = useCallback(
    (idx: number) => {
      if (showRemote && idx === 0) {
        onChange('Remote');
        handleClose();
        return;
      }
      const country = flat[idx - countryOffset];
      if (!country) return;
      if (pickCountry({ name: country.name, code: country.code })) return;
      if (AVAILABLE_CODES.includes(country.code.toUpperCase())) {
        onChange(country.name);
        handleClose();
      } else {
        void requestWaitlist(country.name);
      }
    },
    [flat, countryOffset, showRemote, onChange, pickCountry, requestWaitlist],
  );

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
        setHighlightIdx((prev) => Math.min(prev + 1, totalCount - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        activate(highlightIdx);
        break;
      case 'Escape':
        handleClose();
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector(`[data-idx="${highlightIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  const rowBase =
    'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors min-h-[44px]';

  const renderComingSoonRow = (country: { id: string; name: string; code: string }, i: number) => {
    const idx = countryOffset + groups.available.length + i;
    const waiting = interest[country.name] ?? 0;
    const isRequested = Boolean(requested[country.name]);
    const isPending = pending === country.name;
    const isHighlighted = highlightIdx === idx;

    return (
      <button
        key={country.id}
        type="button"
        data-idx={idx}
        onClick={() => {
          if (pickCountry({ name: country.name, code: country.code })) return;
          void requestWaitlist(country.name);
        }}
        onMouseEnter={() => setHighlightIdx(idx)}
        className={`${rowBase} ${isHighlighted ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
        aria-label={`${country.name} — coming soon${waiting > 0 ? `, ${waiting} waiting` : ''}${
          isRequested ? ', you are on the waitlist' : ', tap to join the waitlist'
        }`}
      >
        <span className="text-lg opacity-70">{getFlagEmoji(country.code)}</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-sm text-slate-700">{country.name}</span>
          {waiting > 0 && (
            <span className="block text-[11px] text-slate-400">
              {waiting} {waiting === 1 ? 'person' : 'people'} waiting
            </span>
          )}
        </span>

        {isPending ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-hidden="true" />
        ) : isRequested ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            <Check className="h-3 w-3" aria-hidden="true" />
            On the list
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <BellRing className="h-3 w-3" aria-hidden="true" />
            Notify me
          </span>
        )}
      </button>
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
          open
            ? 'border-emerald-500 ring-2 ring-emerald-200'
            : 'border-slate-200 hover:border-slate-300'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} bg-white`}
      >
        {selectedCountry ? (
          <>
            <span className="text-lg">{getFlagEmoji(selectedCountry.code)}</span>
            <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-900">
              {selectedCountry.name}
            </span>
            {selectedCountry.code && (
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  selectedIsAvailable
                    ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                    : 'border border-slate-200 bg-slate-100 text-slate-500'
                }`}
              >
                {selectedIsAvailable ? 'Available' : 'Coming soon'}
              </span>
            )}
          </>
        ) : (
          <>
            <MapPin className="w-5 h-5 text-slate-400 shrink-0" />
            <span className="flex-1 text-sm text-slate-400">
              {loading ? 'Loading countries...' : placeholder}
            </span>
          </>
        )}
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="menu-surface absolute z-50 top-full mt-1 left-0 right-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightIdx(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search 190+ countries..."
                aria-label="Search countries"
                className="w-full pl-9 pr-8 py-2.5 text-sm rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 outline-none transition-all"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setHighlightIdx(0);
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div ref={listRef} className="max-h-72 overflow-y-auto overscroll-contain custom-scrollbar">
            {/* Remote / Online — a work mode, not a country (onboarding only) */}
            {showRemote && (
              <button
                type="button"
                data-idx={0}
                onClick={() => {
                  onChange('Remote');
                  handleClose();
                }}
                onMouseEnter={() => setHighlightIdx(0)}
                className={`${rowBase} ${highlightIdx === 0 ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
              >
                <Globe className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-900">Remote / Online</span>
                  <span className="block text-xs text-slate-400">Work from anywhere</span>
                </span>
                {value === 'Remote' && (
                  <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-500" />
                )}
              </button>
            )}

            {/* Available now */}
            {groups.available.length > 0 && (
              <>
                <div className="border-y border-emerald-100/50 bg-emerald-50/50 px-4 py-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Live now
                  </span>
                </div>
                {groups.available.map((c, i) => {
                  const idx = countryOffset + i;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-idx={idx}
                      onClick={() => {
                        if (pickCountry({ name: c.name, code: c.code })) return;
                        onChange(c.name);
                        handleClose();
                      }}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`${rowBase} ${
                        highlightIdx === idx ? 'bg-emerald-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-lg">{getFlagEmoji(c.code)}</span>
                      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-emerald-700">
                        {c.name}
                      </span>
                      <span className="shrink-0 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Select
                      </span>
                      {value === c.name && (
                        <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-500" />
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* Coming soon — tap to join the waitlist */}
            {groups.comingSoon.length > 0 && (
              <>
                <div className="border-y border-slate-100 bg-slate-50 px-4 py-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Coming soon
                  </span>
                </div>
                {groups.comingSoon.map(renderComingSoonRow)}
              </>
            )}

            {totalCount === 1 && query && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-slate-500">No countries match "{query}"</p>
                <p className="mt-1 text-xs text-slate-400">
                  Tell us where you are and we'll add it to the roadmap.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2">
            <p className="text-center text-xs text-slate-400">
              ↑↓ Navigate · Enter Select / Join · Esc Close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
