/**
 * Shared helpers for surfacing service pricing to clients.
 *
 * The 3-tier model stores Basic/Standard/Premium in `services.packages` (JSONB)
 * while the legacy `services.price` column stays in sync with the Basic tier so
 * older queries/cards keep working. Every public listing should show the
 * Fiverr-style "From ₹X" starting price derived from the published packages.
 */

export interface ServicePackageLite {
  tier?: string;
  title?: string;
  price?: number | string;
  currency?: string;
  delivery_days?: number;
  revisions?: number;
  deliverables?: string[];
}

function asPackages(packages: unknown): ServicePackageLite[] {
  if (!Array.isArray(packages)) return [];
  return packages.filter(
    (p): p is ServicePackageLite => p !== null && typeof p === 'object'
  );
}

/**
 * Starting price shown on listing cards: the Basic tier price when published,
 * otherwise the lowest priced tier, otherwise the legacy `price` column.
 */
export function serviceFromPrice(service: {
  price?: number | string | null;
  packages?: unknown;
}): number {
  const pkgs = asPackages(service.packages);
  if (pkgs.length > 0) {
    const basic = pkgs.find((p) => p.tier === 'basic');
    const basicPrice = basic ? Number(basic.price) || 0 : 0;
    if (basicPrice > 0) return basicPrice;
    const priced = pkgs.map((p) => Number(p.price) || 0).filter((v) => v > 0);
    if (priced.length > 0) return Math.min(...priced);
  }
  return Number(service.price) || 0;
}

/** Number of packages with a real price attached (legacy rows may have fewer than 3). */
export function packageCount(service: { packages?: unknown }): number {
  return asPackages(service.packages).filter((p) => (Number(p.price) || 0) > 0).length;
}
