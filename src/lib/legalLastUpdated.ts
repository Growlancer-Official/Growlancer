/**
 * ISO date (YYYY-MM-DD) of the most recent commit that modified any legal page
 * (Cookies, Privacy, Terms). Injected at dev/build by Vite from `git log`.
 */
export function formatLegalLastUpdatedLine(): string {
  const iso = __LEGAL_LAST_UPDATED_ISO__;
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || [y, m, d].some((n) => Number.isNaN(n))) {
    return `Last updated: ${iso}`;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  const formatted = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Last updated: ${formatted}`;
}
