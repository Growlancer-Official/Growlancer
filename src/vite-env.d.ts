/// <reference types="vite/client" />

/** Injected in `vite.config.ts` from the last git commit touching legal pages. */
declare const __LEGAL_LAST_UPDATED_ISO__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
