/**
 * Early-access feature switches — the single source of truth for modules that
 * are deferred at launch (see docs/MVP-SCOPE-AND-E2E-TEST-PLAN.md).
 *
 * Why a switch and not deleted code:
 *   - The modules are deferred for scope, not because they are wrong. Deleting
 *     their server code would destroy the only tested implementation and make
 *     re-enabling a rewrite.
 *   - Every deferred module must be disabled at EVERY layer, including direct
 *     API calls. Hiding a navigation link is not a disable — this module is
 *     what the edge functions consult so a `curl` cannot reach a deferred
 *     action either.
 *
 * Defaults are fail-closed: a feature is OFF unless this file or an explicit
 * `FEATURE_<KEY>_ENABLED=true` env var turns it on. The env override exists so
 * the founder can re-enable a module without a redeploy — and so a staging
 * project can exercise the code before it goes live.
 *
 * Deliberate exceptions (documented, not accidental):
 *   - `inhouse_kyc` is off; payment/banking-provider KYC performed by Razorpay
 *     or PayPal is NOT this feature and is never gated here.
 *   - `subscription_billing` (the recurring cron that charges saved cards) is
 *     off. The one-off Premium purchase path is a different endpoint and stays
 *     intact per the platform's business rules (see AGENTS.md §Business).
 */

export type FeatureKey =
  | 'internships'
  | 'certificates'
  | 'contests'
  | 'inhouse_kyc'
  | 'subscription_billing';

// NOTE: `contests` is returned by isFeatureEnabled() but contests are enforced
// in the SPA (src/lib/featureFlags.ts >> App.tsx routes) rather than by an edge
// function — contest actions run through the shared razorpay/contract RPCs, so
// there is no separate endpoint to gate.

/** Fail-closed defaults for the launch scope. */
const DEFAULTS: Record<FeatureKey, boolean> = {
  internships: false,
  certificates: false,
  contests: false,
  inhouse_kyc: false,
  subscription_billing: false,
};

/**
 * Resolve a feature flag.
 *
 * `FEATURE_INTERNSHIPS_ENABLED=true` forces on, `...=false` forces off, and
 * anything else (unset, typo, "1", "yes") falls back to DEFAULTS — which is
 * always OFF. A typo must never enable a deferred money or PII surface.
 */
export function isFeatureEnabled(key: FeatureKey): boolean {
  const raw = Deno.env.get(`FEATURE_${key.toUpperCase()}_ENABLED`);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return DEFAULTS[key];
}

/** Line the UI and the function agree on, so the user sees one explanation. */
export const FEATURE_DISABLED_MESSAGE =
  'This feature is not available during Growlancer early access. It has been deferred and no data was read or changed.';

/**
 * 410 Gone with no record data. Used by every deferred edge function.
 *
 * 410 (not 404) is deliberate: it says "this existed and is intentionally
 * unavailable", which is honest to a crawler and to a support agent reading a
 * log, and it cannot be confused with a typo in the URL.
 */
export function featureDisabledResponse(
  corsHeaders: Record<string, string>,
  feature: FeatureKey,
  details: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      available: false,
      feature,
      error: FEATURE_DISABLED_MESSAGE,
      ...details,
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
