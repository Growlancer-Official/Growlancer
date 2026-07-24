import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { SupportedLocale, TranslationMessages, I18nContextValue } from './types';
import { I18N_CONFIG } from './types';
import enMessages from './en.json';
import hiMessages from './hi.json';

// ─── Load all translation files ──────────────────────────────────────────────
const messageBundles: Record<SupportedLocale, TranslationMessages> = {
  en: enMessages as TranslationMessages,
  hi: hiMessages as TranslationMessages,
};

// ─── Default context value (used before provider is mounted) ─────────────────
const DEFAULT_CONTEXT: I18nContextValue = {
  locale: I18N_CONFIG.defaultLocale,
  setLocale: () => {},
  t: (key: string) => key,
  isLoading: true,
};

const I18nContext = createContext<I18nContextValue>(DEFAULT_CONTEXT);

// ─── Helper: resolve dotted key like "common.loading" ────────────────────────
function resolveMessage(messages: TranslationMessages, key: string): string | undefined {
  const parts = key.split('.');
  let current: unknown = messages;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

// ─── Helper: interpolate {param} placeholders ────────────────────────────────
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}

// ─── i18n Provider ───────────────────────────────────────────────────────────
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    // Try to restore saved locale
    try {
      const saved = localStorage.getItem('growlancer-locale');
      if (saved === 'en' || saved === 'hi') return saved;
      // eslint-disable-next-line no-empty
    } catch {}
    return I18N_CONFIG.defaultLocale;
  });
  const [messages, setMessages] = useState<TranslationMessages>(messageBundles[locale]);
  const [isLoading, setIsLoading] = useState(false);
  const loadedLocales = useRef<Set<SupportedLocale>>(new Set([locale]));

  // When locale changes, load messages (includes sync fallback for built-in locales)
  useEffect(() => {
    const loadMessages = async () => {
      setIsLoading(true);
      try {
        // Built-in locales are already loaded synchronously
        if (messageBundles[locale]) {
          setMessages(messageBundles[locale]);
        } else {
          // Future: dynamic import for remote locales
          // const mod = await import(`./${locale}.json`);
          // setMessages(mod.default);
          setMessages(messageBundles[I18N_CONFIG.fallbackLocale]);
        }
        loadedLocales.current.add(locale);
      } catch {
        console.warn(`[i18n] Failed to load locale "${locale}", falling back to "${I18N_CONFIG.fallbackLocale}"`);
        setMessages(messageBundles[I18N_CONFIG.fallbackLocale]);
      } finally {
        setIsLoading(false);
      }
    };
    loadMessages();
  }, [locale]);

  // Persist locale choice
  const setLocale = useCallback((newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('growlancer-locale', newLocale);
      // eslint-disable-next-line no-empty
    } catch {}
    // Update <html lang> attribute
    document.documentElement.lang = newLocale;
  }, []);

  // Set initial <html lang> on mount
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Translation function
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      // Try current locale
      let msg = resolveMessage(messages, key);
      if (msg !== undefined) return interpolate(msg, params);

      // Try fallback locale
      if (locale !== I18N_CONFIG.fallbackLocale) {
        const fallbackMessages = messageBundles[I18N_CONFIG.fallbackLocale];
        msg = resolveMessage(fallbackMessages, key);
        if (msg !== undefined) return interpolate(msg, params);
      }

      // Key not found – return key as fallback
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing translation key: "${key}" for locale "${locale}"`);
      }
      return key.split('.').pop() || key;
    },
    [messages, locale]
  );

  const value: I18nContextValue = { locale, setLocale, t, isLoading };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return ctx;
}