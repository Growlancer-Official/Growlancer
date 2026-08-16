// ────────────────────────────────────────────────────────────────────────────
// GROWLANCER — centralized currency formatting
// India-first platform: every money value is INR by default. All UI formatting
// goes through formatCurrency() so a future currency switch only needs the
// currency code changed in one place — no per-file edits.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Format an amount with the currency symbol, Indian digit grouping
 * (1,23,456.78) and INR default.
 *
 * @param amount  - Amount to format (NaN/undefined-safe → renders 0)
 * @param currency - ISO 4217 code, default 'INR'
 * @returns e.g. "₹1,23,456" / "₹299"
 */
export function formatCurrency(amount: number, currency = 'INR'): string {
  // Guard against NaN/undefined so the UI never renders ₹NaN.
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

/**
 * Currency symbol for the active currency (default INR → "₹").
 * Used in labels/placeholders/input prefixes so a currency switch updates
 * every symbol in the UI from one place.
 */
export function currencySymbol(currency = 'INR'): string {
  try {
    const parts = new Intl.NumberFormat('en-IN', { style: 'currency', currency }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? '₹';
  } catch {
    return '₹';
  }
}

/**
 * Compact currency formatter for large metric-style numbers (₹1.2K, ₹3.4Cr).
 * Used on public stats pages where full precision is not needed.
 */
export function formatCompactCurrency(amount: number, currency = 'INR'): string {
  const inr = Number.isFinite(amount) ? amount : 0;
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  if (inr === 0) return `${symbol}0`;
  if (inr < 1_000) return `${symbol}${Math.round(inr).toLocaleString('en-IN')}`;
  if (inr < 1_00_00_000) return `${symbol}${(inr / 1_000).toFixed(inr < 10_000 ? 1 : 0)}K`;
  return `${symbol}${(inr / 1_00_00_000).toFixed(inr < 10_00_00_000 ? 2 : 1)}Cr`;
}
