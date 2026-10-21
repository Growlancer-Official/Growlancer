/**
 * PayPal server-side kill switch.
 *
 * Why this exists separately from `VITE_PAYPAL_ENABLED`:
 *   The frontend flag only hides the button. It is compiled into the public
 *   bundle, so anyone can call `/functions/v1/paypal` with `curl` and reach
 *   create-order / capture / refund. Until PayPal credentials, a verified
 *   webhook endpoint and sandbox reconciliation are in place, the SERVER must
 *   refuse before any provider call or money movement.
 *
 * Default is OFF and only the exact string "true" enables it — a typo, "1" or
 * "yes" keeps the money path shut (fail closed).
 */

export function isPaypalEnabled(): boolean {
  return Deno.env.get('PAYPAL_ENABLED') === 'true';
}

/** 503: the method exists but is intentionally unavailable right now. */
export function paypalDisabledResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'paypal_disabled',
      message:
        'PayPal is not available during Growlancer early access. No payment was created, captured, refunded or acknowledged.',
    }),
    { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
