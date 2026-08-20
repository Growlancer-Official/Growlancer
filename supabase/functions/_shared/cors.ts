/**
 * Centralized CORS configuration for all edge functions.
 *
 * Single source of truth — add new domains HERE ONLY.
 * Every edge function imports getCorsHeaders from this module.
 */

const ALLOWED_ORIGINS = [
  'https://growlancer-mrkhan154212s-projects.vercel.app',
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
  'http://localhost:5173',
];

/**
 * Returns CORS headers for the given request origin.
 * - Known origin → reflects it back (proper per-origin CORS)
 * - Unknown/missing origin → returns empty headers (rejects cross-origin)
 *
 * @param origin - The request Origin header value
 * @param methods - Optional override for allowed methods (default: all)
 */
export function getCorsHeaders(
  origin: string | null,
  methods: string = 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name',
      'Access-Control-Allow-Methods': methods,
    };
  }

  // Unknown origin — do NOT reflect. Return no CORS headers so the browser
  // blocks the response. For server-to-server calls (webhooks, cron) that
  // don't send an Origin header, this is fine — CORS is a browser mechanism.
  return {};
}
