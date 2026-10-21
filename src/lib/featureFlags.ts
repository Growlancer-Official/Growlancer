/**
 * Client-side feature switches — the SPA twin of
 * `supabase/functions/_shared/features.ts`.
 *
 * Both layers read the same names, both default to OFF, and both require the
 * exact string `'true'` to enable. The server is the enforcement point; this
 * module only decides what the user SEES, so a mismatch degrades to "page looks
 * available but the API answers 410" — never to "page hidden but API live".
 *
 * Enabling at runtime (staging only):
 *   VITE_FEATURE_CONTESTS_ENABLED=true
 *   VITE_FEATURE_INTERNSHIPS_ENABLED=true
 *   VITE_FEATURE_CERTIFICATES_ENABLED=true
 * and the matching `FEATURE_*_ENABLED=true` on the Supabase function side.
 */

export type ClientFeature = 'internships' | 'certificates' | 'contests';

/** Fail-closed defaults. Keep in step with the server module. */
const DEFAULTS: Record<ClientFeature, boolean> = {
  internships: false,
  certificates: false,
  contests: false,
};

export function isFeatureEnabled(feature: ClientFeature): boolean {
  const raw = import.meta.env?.[`VITE_FEATURE_${feature.toUpperCase()}_ENABLED`];
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return DEFAULTS[feature];
}

/**
 * True when `path` belongs to a module deferred from this release.
 *
 * Used to remove navigation entries (not to block rendering — the router gates
 * every deferred path explicitly). Prefix matching is deliberate for
 * `/contests/:id` and `/client/contests/create`, but exact matching is used
 * where a prefix would swallow an unrelated route (`/certificate` vs
 * `/certificates` is not a real conflict here, but `/client/contests` must not
 * match `/client/contracts`).
 */
export function isDeferredRoute(path: string | null | undefined): boolean {
  if (!path) return false;
  const p = path.split('?')[0].split('#')[0];

  if (
    !isFeatureEnabled('internships') &&
    (p === '/internships' || p === '/careers' || p === '/admin/internships')
  ) {
    return true;
  }

  if (
    !isFeatureEnabled('certificates') &&
    (p === '/certificate' ||
      p.startsWith('/certificate/') ||
      p === '/verify-certificate' ||
      p.startsWith('/verify-certificate/') ||
      p === '/dashboard/certifications' ||
      p.startsWith('/dashboard/certifications/') ||
      p === '/admin/certificates')
  ) {
    return true;
  }

  if (
    !isFeatureEnabled('contests') &&
    (p === '/contests' ||
      p.startsWith('/contests/') ||
      p === '/dashboard/contests' ||
      p === '/client/contests' ||
      p.startsWith('/client/contests/'))
  ) {
    return true;
  }

  return false;
}
