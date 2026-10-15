/**
 * dashboardSection.ts — the single source of truth for the dashboard header's
 * section label ("<Role> Dashboard" over the section name) in both the client
 * and freelancer shells.
 *
 * WHY this exists (founder report, Oct 14 2026 — "wrong section name aata hai"):
 * the mobile header used to search ONLY the sidebar groups and then fall back to
 * a hardcoded `'Workspace'`. Any route a user reaches that is not a sidebar link
 * — Post a Project, Post a Team Project, Identity Verification, Create Service,
 * Skill Test, Contest Create … — therefore announced itself as "Workspace",
 * i.e. the app displayed a confidently wrong page name in its most visible
 * chrome. Two real defects were reproduced from that: the header label and the
 * overlap it caused next to the section actions.
 *
 * The resolver never invents a name. Order of preference:
 *   1. exact route → title
 *   2. deepest matching route prefix → title (e.g. /client/workspace/123)
 *   3. deepest matching navigation link (labels the sidebar actually owns)
 *   4. the last URL segment, title-cased — always truthful, derived from the URL
 *   5. 'Overview' for the bare role root
 */

export interface DashboardNavLink {
  path: string;
  label: string;
}

/**
 * Every dashboard route that can render inside the client or freelancer shell.
 * Values intentionally match the visible sidebar labels so the header and the
 * navigation never disagree about the same destination.
 */
export const DASHBOARD_SECTION_TITLES: Record<string, string> = {
  // ── Client shell ──
  '/client': 'Overview',
  '/client/post': 'Post a Project',
  '/client/projects': 'My Projects',
  '/client/matches': 'AI Matches',
  '/client/invites': 'Invites',
  '/client/proposals': 'Proposals',
  '/client/contracts': 'Contracts',
  '/client/workspace': 'Workspace',
  '/client/workspace/:contractId': 'Workspace',
  '/client/notifications': 'Notifications',
  '/client/payments': 'Payments',
  '/client/settings': 'Settings',
  '/client/verification': 'Verification',
  '/client/support-tickets': 'Support Tickets',
  '/client/referrals': 'Refer & Hire',
  '/client/team-projects': 'Team Projects',
  '/client/team-projects/create': 'Post a Team Project',
  '/client/ai-assistant': 'AI Assistant',
  '/client/find-talent': 'Find Talent',
  '/client/reviews': 'Reviews',
  '/client/contests': 'Contests',
  '/client/contests/create': 'Post a Contest',
  '/client/help-center': 'Help Center',

  // ── Freelancer shell ──
  '/dashboard': 'Overview',
  '/dashboard/feed': 'Project Feed',
  '/dashboard/invites': 'Invites',
  '/dashboard/proposals': 'Proposals',
  '/dashboard/contracts': 'Contracts',
  '/dashboard/workspace': 'Workspace',
  '/dashboard/wallet': 'Wallet',
  '/dashboard/profile': 'Profile',
  '/dashboard/referrals': 'Referrals',
  '/dashboard/pro': 'Premium',
  '/dashboard/ai-assistant': 'AI Assistant',
  '/dashboard/services': 'Services',
  '/dashboard/services/create': 'Create Service',
  '/dashboard/services/edit/:serviceId': 'Edit Service',
  '/dashboard/portfolio': 'Portfolio',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/disputes': 'Disputes',
  '/dashboard/support-tickets': 'Support Tickets',
  '/dashboard/identity-verification': 'Verification',
  '/dashboard/certifications': 'Certifications',
  '/dashboard/certifications/:testId': 'Skill Test',
  '/dashboard/time-tracking': 'Time Tracking',
  '/dashboard/contests': 'Contests',
  '/dashboard/help-center': 'Help Center',
};

/**
 * The role roots are exact-only: a bare `/client` is "Overview", but an
 * unknown child of it is NOT "Overview" — that is the same class of lie the
 * hardcoded 'Workspace' fallback told.
 */
const ROOT_KEYS = new Set(['/client', '/dashboard']);

/** Longest-first so the deepest section always wins. */
const ROUTE_KEYS = Object.keys(DASHBOARD_SECTION_TITLES).sort((a, b) => b.length - a.length);
const PREFIX_KEYS = ROUTE_KEYS.filter((key) => !ROOT_KEYS.has(key));

function normalizePath(pathname: string): string {
  const withoutQuery = (pathname || '').split('?')[0].split('#')[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith('/')) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery || '/';
}

function titleCaseSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** True when `path` is the route itself or a child of it. */
function matchesPrefix(path: string, key: string): boolean {
  if (key === '/') return path === '/';
  return path === key || path.startsWith(`${key}/`);
}

/**
 * Match a route definition that may contain `:param` segments (the same
 * convention the router uses). Segment-count exact, so
 * `/dashboard/certifications/:testId` never claims the plain list route.
 */
function matchesRouteDefinition(path: string, key: string): boolean {
  const pathSegments = path.split('/').filter(Boolean);
  const keySegments = key.split('/').filter(Boolean);
  if (pathSegments.length !== keySegments.length) return false;
  return keySegments.every(
    (segment, index) => segment.startsWith(':') || segment === pathSegments[index]
  );
}

/** Every route key that describes exactly this path (params included). */
function exactRouteKey(path: string): string | undefined {
  return ROUTE_KEYS.find(
    (key) => key.includes(':') && matchesRouteDefinition(path, key)
  );
}

export function resolveDashboardSection(
  pathname: string,
  links: readonly DashboardNavLink[] = []
): string {
  const path = normalizePath(pathname);

  const exact = DASHBOARD_SECTION_TITLES[path];
  if (exact) return exact;

  // Parameterised routes first (they are exact by segment count), then the
  // deepest plain prefix, so /dashboard/services/create beats
  // /dashboard/services and /client/team-projects/create beats …/team-projects.
  const paramRoute = exactRouteKey(path);
  if (paramRoute) return DASHBOARD_SECTION_TITLES[paramRoute];

  const section = PREFIX_KEYS.find((key) => matchesPrefix(path, key));
  if (section) return DASHBOARD_SECTION_TITLES[section];

  const navMatch = [...links]
    .filter((link) => matchesPrefix(path, normalizePath(link.path)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (navMatch) return navMatch.label;

  // Truthful fallback: derive from the URL instead of inventing a name.
  const lastSegment = path.split('/').filter(Boolean).pop();
  if (lastSegment) return titleCaseSegment(lastSegment);

  return 'Overview';
}
