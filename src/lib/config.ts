// Platform Configuration
// Centralized configuration for all platform settings

export const PLATFORM_CONFIG = {
  // Platform Fees
  fees: {
    platform_percentage: 5, // 5% platform fee (client pays on top of bid)
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
  // FINAL MODEL: ONE flat plan — Freelancer Premium ₹299/month, purely optional.
  // It unlocks ONLY AI + productivity tools (AI writing, AI assistant, profile
  // optimization, advanced analytics). It NEVER gates packaging, visibility,
  // ranking or matching — those are 100% merit-based and free for everyone.
  // Clients are free forever (fair-use rate limit only).
  subscriptions: {
    free: {
      proposals_per_month: 5,
      ai_matches_per_month: 10,
      portfolio_items: 3,
    },
    premium_monthly: {
      price: 299,
      proposals_per_month: 50,
      ai_matches_per_month: 100,
      portfolio_items: 20,
      features: [
        'unlimited_ai_writing',
        'ai_assistant',
        'ai_profile_optimization',
        'advanced_analytics',
        'priority_support',
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
export function calculatePlatformFee(amount: number): number {
  return amount * (PLATFORM_CONFIG.fees.platform_percentage / 100);
}

export function calculateTotalWithFee(amount: number): number {
  return amount + calculatePlatformFee(amount);
}

export function calculateFreelancerAmount(amount: number): number {
  return amount - calculatePlatformFee(amount);
}