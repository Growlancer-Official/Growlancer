// Device profiles + route lists for the Growlancer E2E device-matrix audit.
//
// Widths/brands mirror the real-world device spread for an India-first
// marketplace (cheap Android 320–360px up to 4K desktop). Keep this list in
// sync with any new breakpoint work.

export const DEVICES = [
  // ── Phones (small → large) ───────────────────────────────
  { name: 'phone-320-mini', label: '320px · Galaxy Fold / small Android', width: 320, height: 568, dpr: 2, mobile: true },
  { name: 'phone-360-android', label: '360px · common Android (India)', width: 360, height: 640, dpr: 3, mobile: true },
  { name: 'phone-375-iphone-se', label: '375px · iPhone SE (2/3)', width: 375, height: 667, dpr: 2, mobile: true },
  { name: 'phone-390-iphone14', label: '390px · iPhone 12/13/14', width: 390, height: 844, dpr: 3, mobile: true },
  { name: 'phone-414-iphone-xr', label: '414px · iPhone XR / 11', width: 414, height: 896, dpr: 2, mobile: true },
  { name: 'phone-360-landscape', label: '640×360 · Android landscape', width: 640, height: 360, dpr: 3, mobile: true, landscape: true },
  { name: 'phone-844-landscape', label: '844×390 · iPhone landscape', width: 844, height: 390, dpr: 3, mobile: true, landscape: true },

  // ── Tablets ──────────────────────────────────────────────
  { name: 'tablet-768-ipad', label: '768px · iPad portrait', width: 768, height: 1024, dpr: 2, mobile: true },
  { name: 'tablet-1024-ipad', label: '1024px · iPad landscape', width: 1024, height: 768, dpr: 2, mobile: true },

  // ── Desktops ─────────────────────────────────────────────
  { name: 'laptop-1280', label: '1280×800 · small laptop', width: 1280, height: 800, dpr: 1, mobile: false },
  { name: 'desktop-1440', label: '1440×900 · common laptop', width: 1440, height: 900, dpr: 1, mobile: false },
  { name: 'desktop-1920', label: '1920×1080 · desktop', width: 1920, height: 1080, dpr: 1, mobile: false },
  { name: 'desktop-2560-4k', label: '2560×1440 · large / 4K', width: 2560, height: 1440, dpr: 1, mobile: false },
];

/** Canonical widths for the full-route sweep (fast, catches most breakage). */
export const CANONICAL_DEVICES = ['phone-320-mini', 'phone-390-iphone14', 'tablet-768-ipad', 'desktop-1440'];

/** Key routes for the full 13-device matrix. */
export const KEY_ROUTES = [
  '/',
  '/pricing',
  '/freelancers',
  '/services',
  '/contests',
  '/help-center',
  '/auth/forgot-password',
  '/dashboard',
];

/** Every public route (protected routes are added separately with a session). */
export const PUBLIC_ROUTES = [
  '/',
  '/how-it-works',
  '/features',
  '/categories',
  '/pricing',
  '/about',
  '/philosophy',
  '/contact',
  '/report',
  '/help-center',
  '/safety',
  '/guidelines',
  '/status',
  '/terms',
  '/privacy',
  '/escrow-policy',
  '/refund-policy',
  '/cookies',
  '/internships',
  '/careers',
  '/freelancers',
  '/services',
  '/contests',
  '/waitlist',
  '/certificate',
  '/verify-certificate',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/magic-link',
  '/auth/otp',
  '/auth/email-confirm',
  '/auth/verify-email',
  '/payment/success',
  '/payment/cancel',
  '/login',
  '/signup',
  '/this-route-does-not-exist',
  '/dashboard',
  '/client',
  '/admin',
  '/onboarding',
];

/** Auth-protected routes (only meaningful with a logged-in storage state). */
export const FREELANCER_ROUTES = [
  '/dashboard',
  '/dashboard/feed',
  '/dashboard/invites',
  '/dashboard/proposals',
  '/dashboard/contracts',
  '/dashboard/workspace',
  '/dashboard/wallet',
  '/dashboard/profile',
  '/dashboard/referrals',
  '/dashboard/pro',
  '/dashboard/portfolio',
  '/dashboard/analytics',
  '/dashboard/notifications',
  '/dashboard/disputes',
  '/dashboard/identity-verification',
  '/dashboard/services',
  '/dashboard/services/create',
  '/dashboard/ai-assistant',
  '/dashboard/tickets',
  '/dashboard/certifications',
  '/dashboard/time-tracking',
  '/dashboard/contests',
  '/dashboard/help-center',
];

export const CLIENT_ROUTES = [
  '/client',
  '/client/post',
  '/client/projects',
  '/client/matches',
  '/client/find-talent',
  '/client/invites',
  '/client/proposals',
  '/client/contracts',
  '/client/workspace',
  '/client/notifications',
  '/client/payments',
  '/client/reviews',
  '/client/contests',
  '/client/contests/create',
  '/client/team-projects',
  '/client/team-projects/create',
  '/client/referrals',
  '/client/settings',
  '/client/verification',
  '/client/ai-assistant',
  '/client/help-center',
];

export const ADMIN_ROUTES = [
  '/admin',
  '/admin/users',
  '/admin/projects',
  '/admin/contracts',
  '/admin/payments',
  '/admin/finance',
  '/admin/withdrawals',
  '/admin/disputes',
  '/admin/subscriptions',
  '/admin/reports',
  '/admin/internships',
  '/admin/certificates',
  '/admin/identity-verification',
  '/admin/support-tickets',
  '/admin/user-reports',
  '/admin/waitlist',
];
