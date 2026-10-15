import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';

// ────────────────────────────────────────────────────────────────────────────
// ThemeProvider — light / dark / system, applied as a `.dark` class on <html>.
//
// The first paint is handled by a tiny inline script in index.html so a
// dark-mode user never sees a light flash (see the FOUC guard there). This
// provider then owns the live state: it reads what that script decided,
// follows the OS when the preference is "system", and persists changes.
// ────────────────────────────────────────────────────────────────────────────

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'growlancer-theme';

interface ThemeContextValue {
  /** What the user chose (may be 'system'). */
  preference: ThemePreference;
  /** What is actually applied right now. */
  resolved: ResolvedTheme;
  /** Cycle light → dark → system. */
  cyclePreference: () => void;
  setPreference: (preference: ThemePreference) => void;
}

const DEFAULT_CONTEXT: ThemeContextValue = {
  preference: 'system',
  resolved: 'light',
  cyclePreference: () => {},
  setPreference: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(DEFAULT_CONTEXT);

/** Read the saved preference (client only, storage-access safe). */
function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch (err) {
    console.warn('[theme] Could not read saved preference:', err);
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

/** Apply the resolved theme to <html> so CSS (.dark …) and `dark:` variants match. */
function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredPreference());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredPreference()));

  // Apply on every change (and once after hydration, so SSR-rendered markup
  // gets the class even if the inline script was blocked by a strict CSP).
  useEffect(() => {
    const next = resolveTheme(preference);
    setResolved(next);
    applyTheme(next);
  }, [preference]);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (preference !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next: ResolvedTheme = media.matches ? 'dark' : 'light';
      setResolved(next);
      applyTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (err) {
      // Private browsing / storage disabled — the theme still applies for this
      // session, it just will not be remembered.
      console.warn('[theme] Could not persist preference:', err);
    }
  }, []);

  const cyclePreference = useCallback(() => {
    setPreferenceState((prev) => {
      const next: ThemePreference = prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (err) {
        console.warn('[theme] Could not persist preference:', err);
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, cyclePreference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
