import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import {
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  detectCountryCode,
  formatCompactCurrency,
  formatCurrency,
  getCountryCode,
  getCurrencyForCountry,
  localeForCurrency,
  currencySymbol,
} from '../lib/currency';

// ────────────────────────────────────────────────────────────────────────────
// CurrencyProvider — resolves ONE currency for the whole app and re-renders
// every money surface through context when it changes.
//
// Priority:
//   1. the signed-in user's onboarding country (`profiles.country`)
//   2. the visitor's browser region/time zone (anonymous browsing)
//   3. INR (India-first default)
//
// Real time: `profiles.country` is refreshed by AuthContext's own
// `postgres_changes` subscription on the user's profile row, so finishing
// onboarding, or an admin/support correcting the country, updates `user`
// → this provider recomputes → every formatter in the tree re-renders.
// No second subscription is opened here (that would double the socket count
// for the same row).
// ────────────────────────────────────────────────────────────────────────────

export type CurrencySource = 'profile' | 'detected' | 'default';

interface CurrencyContextValue {
  /** ISO 4217 code currently used for display, e.g. 'INR'. */
  currency: string;
  /** Locale used for digit grouping/symbol placement, e.g. 'en-IN'. */
  locale: string;
  /** Alpha-2 country of the currency, or null when it came from detection. */
  countryCode: string | null;
  /** Why this currency was chosen — surfaced in tooltips for transparency. */
  source: CurrencySource;
  /** Format an amount in the active currency. */
  format: (amount: number) => string;
  /** Compact form for metric tiles (₹1.2L / $3.4K). */
  formatCompact: (amount: number) => string;
  /** Symbol only, for input prefixes and labels. */
  symbol: string;
}

const DEFAULT_CONTEXT: CurrencyContextValue = {
  currency: DEFAULT_CURRENCY,
  locale: DEFAULT_LOCALE,
  countryCode: null,
  source: 'default',
  format: (amount: number) => formatCurrency(amount, DEFAULT_CURRENCY, DEFAULT_LOCALE),
  formatCompact: (amount: number) => formatCompactCurrency(amount, DEFAULT_CURRENCY, DEFAULT_LOCALE),
  symbol: '₹',
};

const CurrencyContext = createContext<CurrencyContextValue>(DEFAULT_CONTEXT);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  // Browser-detected country, resolved once on mount (client only — the
  // server render uses the India-first default, then the effect corrects it).
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);

  useEffect(() => {
    setDetectedCountry(detectCountryCode());
  }, []);

  const value = useMemo<CurrencyContextValue>(() => {
    const profileCountry = user?.country ?? null;

    let currency: string;
    let source: CurrencySource;

    if (profileCountry) {
      currency = getCurrencyForCountry(profileCountry);
      source = 'profile';
    } else if (detectedCountry) {
      currency = getCurrencyForCountry(detectedCountry);
      source = 'detected';
    } else {
      currency = DEFAULT_CURRENCY;
      source = 'default';
    }

    const locale = localeForCurrency(currency);
    const countryCode = getCountryCode(profileCountry) ?? detectedCountry;

    return {
      currency,
      locale,
      countryCode,
      source,
      format: (amount: number) => formatCurrency(amount, currency, locale),
      formatCompact: (amount: number) => formatCompactCurrency(amount, currency, locale),
      symbol: currencySymbol(currency, locale),
    };
  }, [user?.country, detectedCountry]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}
