// Platform Configuration
// Centralized configuration for all platform settings

export const PLATFORM_CONFIG = {
  // Platform Fees
  fees: {
    platform_percentage: 5, // 5% platform fee (client pays on top of bid)
    payment_processing_percentage: 2.9, // PayPal processing fee (charged to freelancer on withdrawal)
    razorpay_payout_percentage: 2, // RazorpayX payout fee for Indian bank transfers
    withdrawal_fee_fixed: 0, // Free withdrawals (no additional fixed fee)
  },
  
  // Platform Limits
  limits: {
    min_project_budget: 50,
    max_project_budget: 100000,
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
  
  // Subscription Plans (prices in USD)
  subscriptions: {
    free: {
      proposals_per_month: 5,
      ai_matches_per_month: 10,
      portfolio_items: 3,
    },
    pro_monthly: {
      price: 19.99,
      proposals_per_month: 50,
      ai_matches_per_month: 100,
      portfolio_items: 20,
      features: ['priority_support', 'analytics', 'verified_badge'],
    },
    pro_yearly: {
      price: 199.99,
      proposals_per_month: 50,
      ai_matches_per_month: 100,
      portfolio_items: 20,
      features: ['priority_support', 'analytics', 'verified_badge'],
    },
    ai_monthly: {
      price: 14.99,
      features: ['unlimited_ai_chat', 'ai_proposal_review', 'ai_profile_optimization'],
    },
    ai_yearly: {
      price: 149.99,
      features: ['unlimited_ai_chat', 'ai_proposal_review', 'ai_profile_optimization'],
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