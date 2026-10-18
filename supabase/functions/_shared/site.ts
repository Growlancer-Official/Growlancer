/**
 * Centralized public-site URL for every edge function.
 *
 * SINGLE SOURCE OF TRUTH for the origin used in:
 *   - outbound email (logo, action links, footer links)
 *   - payment redirect URLs (PayPal return_url / cancel_url)
 *   - AI gateway attribution headers (OpenRouter HTTP-Referer)
 *
 * Switching the production domain (e.g. growlancer.vercel.app -> growlancer.com)
 * is then a SECRET change, not a code change:
 *
 *   npx supabase secrets set APP_URL=https://growlancer.com --project-ref <ref>
 *
 * The fallback below exists only so a missing secret degrades to a WORKING
 * origin instead of an empty string (which would emit broken links like
 * `/dashboard/subscription`). It is never silent — the miss is logged so it
 * shows up in the function logs. No secret VALUE is ever logged.
 */

const RAW_APP_URL = (Deno.env.get('APP_URL') ?? '').trim();

/**
 * Origin used when the APP_URL secret is not configured.
 * Kept at the currently-live deployment origin on purpose: if the secret were
 * ever lost, this keeps links working rather than pointing at a domain that
 * may not resolve yet.
 */
export const FALLBACK_SITE_URL = 'https://growlancer.vercel.app';

// 🔍 Absolute site origin, no trailing slash.
// Uses APP_URL secret when configured (production domain),// falls back to live Vercel URL when secret is missing.
export const SITE_URL: string = (RAW_APP_URL || FALLBACK_SITE_URL).replace(/\/+$/, '');

if (!RAW_APP_URL) {
  console.warn(
    `[site] APP_URL is not configured — falling back to ${FALLBACK_SITE_URL}. `,
    'Email links and payment redirects will use that origin. ',
    'Set the canonical domain with: supabase secrets set APP_URL=https://<domain>'
  );
}

/** Build an absolute URL for a site-relative path (`''` -> the origin). */

// 🔍 Enhanced: Log when email verification links would use fallback domain
// This helps track if APP_URL needs to be set for production email deliverability
if (!RAW_APP_URL && typeof window !== 'undefined') {
  // Only log on browser runtime — not during SSG/ISR builds
  devLog('[site] APP_URL not configured — email verification links using Vercel fallback domain');
}

// 🔍 Build an absolute URL for a site-relative path (`''` -> the origin).// Uses SITE_URL which respects APP_URL secret or falls back to Vercel URL.
export function siteUrl(path = ''): string {
  const suffix = String(path ?? '');
  if (!suffix) return SITE_URL;
  return SITE_URL + (suffix.startsWith('/') ? suffix : `/${suffix}`);
}
