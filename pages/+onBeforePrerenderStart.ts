import type { OnBeforePrerenderStartSync } from 'vike/types';

// ═══════════════════════════════════════════════════════════════════
// Vike Prerender — Static Site Generation
// ═══════════════════════════════════════════════════════════════════
// During `vite build`, Vike renders each of these URLs to static
// HTML files. Visitors get fully-rendered HTML instantly without
// needing a running SSR server (like a CDN-hosted static site).
//
// Auth-protected routes (dashboard, admin, client) are NOT listed
// here — they require client-side session checks which can't be
// pre-rendered. Their initial HTML will show the loading skeleton
// until JS hydrates and AuthContext resolves the session.
// ═══════════════════════════════════════════════════════════════════

const PUBLIC_URLS = [
  // ── Main pages ──────────────────────────────────────────
  '/',
  '/how-it-works',
  '/features',
  '/categories',
  '/pricing',
  '/about',
  '/philosophy',
  '/contact',
  '/internships',
  '/careers',
  '/help-center',
  '/safety',
  '/guidelines',
  '/status',
  '/terms',
  '/privacy',
  '/escrow-policy',
  '/cookies',

  // ── Browse pages ────────────────────────────────────────
  '/freelancers',
  '/services',
  '/contests',

  // ── Verification / Legal / Utility ──────────────────────
  '/certificate',
  '/verify-certificate',

  // ── Auth pages ──────────────────────────────────────────
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/magic-link',
  '/auth/email-confirm',
  '/auth/verify-email',

  // ── Secondary ───────────────────────────────────────────
  '/waitlist',
  '/payment/success',
  '/payment/cancel',

  // ── Fallback ────────────────────────────────────────────
  '/not-found',
];

const onBeforePrerenderStart: OnBeforePrerenderStartSync = () => {
  return PUBLIC_URLS;
};

export { onBeforePrerenderStart };
