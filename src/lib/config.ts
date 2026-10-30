// Platform Configuration
// Centralized configuration for all platform settings

export const PLATFORM_CONFIG = {
  // Platform Fees
  fees: {
    // 5% platform commission, withheld from the FREELANCER's released
    // earnings. It is never added on top of the client's agreed amount.
    platform_percentage: 5,
    payment_processing_percentage: 2, // payout processing fee (charged to freelancer on withdrawal)
    razorpay_payout_percentage: 2, // payout fee for Indian bank/UPI transfers
    withdrawal_fee_fixed: 0, // Free withdrawals (no additional fixed fee)
  },
  
  // Platform Limits (INR)
  limits: {
    min_project_budget: 2000,
    max_project_budget: 10000000,
    max_file_upload_size_mb: 25,
    max_proposal_per_day: 20,
    max_messages_per_minute: 10,
  },
  
  // Escrow Settings
  escrow: {
    release_timeout_hours: 24,
    dispute_window_days: 14,
    auto_cancel_unfunded_days: 7,
  },
  
  // Subscription Plans (prices in INR — India-first, affordable)
  // FINAL MODEL: ONE flat plan — Freelancer Premium ₹199/month, purely optional.
  // ₹199 is the ONLY paid price in the product: no second tier exists at all.
  // It unlocks ONLY AI capacity: a higher AI writing cap and no monthly cap on AI
  // assistant messages, plus a Premium badge. It NEVER gates packaging, visibility,
  // ranking or matching (merit-based, free for everyone) and analytics is NOT a
  // Premium feature — the dashboard is free for every freelancer.
  // Clients are free forever (fair-use rate limit only, no client AI upsell).
  subscriptions: {
    free: {
      proposals_per_month: 5,
      ai_matches_per_month: 10,
      portfolio_items: 3,
    },
    premium_monthly: {
      price: 199,
      proposals_per_month: 50,
      ai_matches_per_month: 100,
      portfolio_items: 20,
      features: [
        'ai_writer_100_per_day',
        'unlimited_ai_assistant',
        'premium_badge',
      ],
    },
  },
  
  // Real-time Settings
  realtime: {
    channel_timeout_ms: 30000,
    max_reconnect_attempts: 5,
    reconnect_interval_ms: 5000,
  },
  
  // Rate Limiting (for edge functions)
  rateLimits: {
    ai_assistant: { requests: 30, window_ms: 60000 },
    ai_matching: { requests: 20, window_ms: 60000 },
    paypal: { requests: 20, window_ms: 60000 },
    withdrawal: { requests: 10, window_ms: 3600000 }, // 10 per hour
    // Client AI is FREE FOR LIFETIME — this is a fair-use abuse-protection cap
    // (bots/cost-explosion guard), NOT a paywall. Cross it and the client sees
    // a friendly "resets tomorrow" message — never an upsell.
    client_ai_daily: { requests: 100, window_ms: 86400000 },
  },
  
  // Pagination
  pagination: {
    default_page_size: 20,
    max_page_size: 100,
  },
} as const;

export type PlatformConfig = typeof PLATFORM_CONFIG;

// Helper functions
//
// One money model everywhere (migration 20270203000000 is the SQL source of
// truth — public.platform_commission):
//   client pays      = agreed amount                      (no fee on top)
//   platform fee     = 5% of the freelancer's released gross
//   freelancer keeps = agreed amount − fee
//
// Rounding happens here in currency minor units so the client UI, the escrow
// checkout and the SQL release path agree to the paisa.
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** 5 % commission on the freelancer's released gross. */
export function calculatePlatformFee(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return round2(amount * (PLATFORM_CONFIG.fees.platform_percentage / 100));
}

/**
 * What the CLIENT pays: exactly the agreed amount. Kept under its historical
 * name so every existing call site keeps compiling — the value is no longer
 * `amount + fee` because the commission is freelancer-side.
 */
export function calculateTotalWithFee(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return round2(amount);
}

/** What the FREELANCER receives when the amount is released (gross − 5 %). */
export function calculateFreelancerAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return round2(Math.max(amount - calculatePlatformFee(amount), 0));
}