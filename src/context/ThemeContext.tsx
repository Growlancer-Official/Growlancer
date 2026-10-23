import React, { createContext, useContext, useEffect } from 'react';

// ────────────────────────────────────────────────────────────────────────────
// ThemeProvider — light only.
//
// Growlanzo is a light-only product: the cream/white surface IS the brand, and
// a half-themed dark variant read as a different site. Dark mode was removed
// outright rather than left switchable, so there is exactly one appearance on
// every device, in every OS setting, for every returning visitor.
//
// Two jobs remain:
//   1. strip any stale `.dark` class a previous build left on <html> (the class
//      was set by the old pre-paint guard and is persisted in the DOM until the
//      next full navigation);
//   2. pin `color-scheme: light` so native controls (scrollbars, date pickers,
//      autofill) never render dark inside a light page.
//
// The pre-paint half of the same guarantee lives in the THEME_FOUC_GUARD
// injected by vite.config.ts, so there is no flash before React hydrates.
// ────────────────────────────────────────────────────────────────────────────

export type ThemePreference = 'light';
export type ResolvedTheme = 'light';

interface ThemeContextValue {
  /** Kept for API compatibility with older call sites; always 'light'. */
  preference: ThemePreference;
  /** Always 'light'. */
  resolved: ResolvedTheme;
  /** No-op: there is no second theme to switch to. */
  setPreference: () => void;
  /** No-op: there is no second theme to cycle to. */
  cyclePreference: () => void;
}

const LIGHT_ONLY: ThemeContextValue = {
  preference: 'light',
  resolved: 'light',
  setPreference: () => {},
  cyclePreference: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(LIGHT_ONLY);

/** Remove the retired theme preference so stale clients stop re-applying it. */
function clearStoredPreference() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('growlancer-theme');
  } catch {
    // Storage blocked (private mode) — nothing to clean up.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
    clearStoredPreference();
  }, []);

  return <ThemeContext.Provider value={LIGHT_ONLY}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
