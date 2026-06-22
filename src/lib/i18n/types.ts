// ─── i18n Type Definitions ──────────────────────────────────────────────────

export type SupportedLocale = 'en' | 'hi';

export interface I18nConfig {
  defaultLocale: SupportedLocale;
  fallbackLocale: SupportedLocale;
  supportedLocales: SupportedLocale[];
}

export type TranslationValue = string | { [key: string]: TranslationValue };

export interface TranslationMessages {
  [namespace: string]: {
    [key: string]: TranslationValue;
  };
}

export interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLoading: boolean;
}

export const I18N_CONFIG: I18nConfig = {
  defaultLocale: 'en',
  fallbackLocale: 'en',
  supportedLocales: ['en', 'hi'],
};

export const LOCALE_META: Record<SupportedLocale, { label: string; nativeLabel: string; dir: 'ltr' | 'rtl' }> = {
  en: { label: 'English', nativeLabel: 'English', dir: 'ltr' },
  hi: { label: 'Hindi', nativeLabel: 'हिन्दी', dir: 'ltr' },
};