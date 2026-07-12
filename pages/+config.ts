import type { Config } from 'vike/types';
import vikeReact from 'vike-react/config';

export default {
  extends: [vikeReact],

  // ─── Global <head> defaults ──────────────────────────────
  title: 'Growlancer — AI-Powered Freelancing Marketplace',
  description:
    'Growlancer is an AI-powered freelancing marketplace connecting talented freelancers with innovative clients. Find work, hire talent, and collaborate seamlessly.',
  image: 'https://growlancer.com/og-image.png',
  viewport: 'width=device-width, initial-scale=1.0, viewport-fit=cover',
  favicon: '/UpdatedLogo.webp',

  // ─── Render mode ─────────────────────────────────────────
  // SSR enabled globally. Protected/dashboard routes handle auth
  // on the client side (useEffect in AuthContext).
  ssr: true,

  // ─── React Strict Mode (was in main.tsx) ─────────────────
  reactStrictMode: true,

  // ─── Prerender (SSG): generate static HTML at build time ─
  // Vike crawls the URLs listed in +onBeforePrerenderStart.ts
  // and pre-renders each one to HTML. This gives instant FCP
  // for public pages without needing a running SSR server.
  prerender: true,

  // ─── i18n ─────────────────────────────────────────────────
  lang: 'en',

  // ─── HTML attributes ──────────────────────────────────────
  htmlAttributes: {
    lang: 'en',
  },

  // ─── Body attributes ──────────────────────────────────────
  bodyAttributes: {
    class: '',
  },
} satisfies Config;
