// ═══════════════════════════════════════════════════════════════════
// Single source of truth: which public URLs are PRE-RENDERED
// ═══════════════════════════════════════════════════════════════════
// This list is consumed by TWO places that MUST stay in sync:
//
//   1. pages/+onBeforePrerenderStart.ts — tells Vike which URLs to render
//      to static HTML at build time (instant FCP + real HTML for crawlers).
//   2. vite.config.ts — the pre-hydration "boot splash" overlay is shown for
//      every path NOT in this list (so a statically-prerendered page never
//      flashes the SPA-fallback homepage shell before hydration).
//
// They used to be two hand-maintained arrays, which drifted: `/report` and
// `/refund-policy` were linked site-wide from the footer but missing from
// BOTH — so those two public pages were served the homepage HTML (wrong
// <title>/canonical, a React hydration mismatch, nothing rendered until JS
// loaded) instead of their own prerendered page.
//
// Keep this file dependency-free (no vike imports) so vite.config.ts can
// import it directly.
// ═══════════════════════════════════════════════════════════════════

export const PUBLIC_PRERENDER_URLS = [
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
  '/refund-policy',
  '/cookies',

  // ── Browse pages ────────────────────────────────────────
  '/freelancers',
  '/services',
  '/contests',

  // ── Verification / Utility ──────────────────────────────
  '/certificate',
  '/verify-certificate',
  '/report',
  '/waitlist',

  // ── Auth pages (reached from email links) ───────────────
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/magic-link',
  '/auth/otp',
  '/auth/email-confirm',
  '/auth/verify-email',

  // ── Payment outcomes ────────────────────────────────────
  '/payment/success',
  '/payment/cancel',

  // ── Fallback ────────────────────────────────────────────
  '/not-found',
] as const;

export type PublicPrerenderUrl = (typeof PUBLIC_PRERENDER_URLS)[number];
