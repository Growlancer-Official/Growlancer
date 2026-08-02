// Payment Provider Configuration (frontend)
// ─────────────────────────────────────────────────────────────────────────────
// Razorpay is the primary payment gateway for all payments.
//
// PayPal is fully implemented in the backend but DISABLED in the UI until live
// credentials are provisioned. Flip VITE_PAYPAL_ENABLED=true in your .env
// (along with PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_WEBHOOK_ID) to
// reveal the PayPal checkout options.
export const PAYMENTS_CONFIG = {
  paypalEnabled: import.meta.env.VITE_PAYPAL_ENABLED === 'true',
} as const;
