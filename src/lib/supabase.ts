import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const REQUEST_TIMEOUT_MS = 15000;
let channelCounter = 0;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// ═══════════════════════════════════════════════════════════════════
// Static Supabase Client
// ═══════════════════════════════════════════════════════════════════
// The client is created synchronously at module load time.
// This is more reliable than the lazy proxy pattern — no race
// conditions between dynamic import() and React's async lifecycle.
// ═══════════════════════════════════════════════════════════════════

const supabaseClient: SupabaseClient<Database> = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    debug: import.meta.env.DEV,
  },
  realtime: {
    params: { eventsPerSecond: 100 },
  },
  global: {
    headers: {
      'X-Client-Info': 'growlancer-web',
      'X-App-Version': import.meta.env.VITE_APP_VERSION || 'dev',
    },
    fetch: (...args) => {
      const [url, options = {}] = args;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const urlStr = typeof url === 'string' ? url : url instanceof Request ? url.url : '';
      const isEdgeFunction = urlStr.includes('/functions/v1/');

      return fetch(url, {
        ...options,
        signal: controller.signal,
      })
        .then(async response => {
          if (!response.ok && response.status !== 406 && !isEdgeFunction) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }
          return response;
        })
        .finally(() => clearTimeout(timeoutId));
    },
  },
});

/** For backward compatibility — immediately returns the already-created client */
export async function getClient(): Promise<SupabaseClient<Database>> {
  return supabaseClient;
}

// ═══ Export the client ════════════════════════════════════════════
// All existing code that does `import { supabase } from '../lib/supabase'`
// continues to work unchanged.
export const supabase = supabaseClient;

// ═══ Typed table helpers ══════════════════════════════════════════
export const tables = {
  profiles: () => supabase.from('profiles'),
  freelancerProfiles: () => supabase.from('freelancer_profiles'),
  clientProfiles: () => supabase.from('client_profiles'),
  projects: () => supabase.from('projects'),
  projectMatches: () => supabase.from('project_matches'),
  proposals: () => supabase.from('proposals'),
  contracts: () => supabase.from('contracts'),
  escrow: () => supabase.from('escrow'),
  transactions: () => supabase.from('transactions'),
  invites: () => supabase.from('invites'),
  subscriptions: () => supabase.from('subscriptions'),
  referrals: () => supabase.from('referrals'),
  referralStats: () => supabase.from('referral_stats'),
  services: () => supabase.from('services'),
  messages: () => supabase.from('messages'),
  reviews: () => supabase.from('reviews'),
  notifications: () => supabase.from('notifications'),
  withdrawals: () => supabase.from('withdrawals'),
  paypalOrders: () => supabase.from('paypal_orders'),
  paypalTransactions: () => supabase.from('paypal_transactions'),
  contractFiles: () => supabase.from('contract_files'),
  subscriptionPlans: () => supabase.from('subscription_plans'),
  userDeletionRequests: () => supabase.from('user_deletion_requests'),
  userMfaSettings: () => supabase.from('user_mfa_settings' as any),
  recoveryCodes: () => supabase.from('recovery_codes' as any),
  notificationPreferences: () => supabase.from('notification_preferences' as any),
  pushTokens: () => supabase.from('push_tokens' as any),
  payoutMethods: () => supabase.from('payout_methods' as any),
  portfolioItems: () => supabase.from('portfolio_items' as any),
  disputeCases: () => supabase.from('disputes' as any),
  identityVerifications: () => supabase.from('identity_verifications' as any),
  wallets: () => supabase.from('wallets'),
  categories: () => supabase.from('categories' as any),
  subcategories: () => supabase.from('subcategories' as any),
  skills: () => supabase.from('skills' as any),
  freelancerSkills: () => supabase.from('freelancer_skills' as any),
  projectCategories: () => supabase.from('project_categories' as any),
  projectSkills: () => supabase.from('project_skills' as any),
  serviceCategories: () => supabase.from('service_categories' as any),
  workspaceTasks: () => supabase.from('workspace_tasks' as any),
  workspaceNotes: () => supabase.from('workspace_notes' as any),
  razorpayOrders: () => supabase.from('razorpay_orders' as any),
  razorpayTransactions: () => supabase.from('razorpay_transactions' as any),
};

// ═══ Realtime channels manager ════════════════════════════════════
function nextChannelName(base: string, scope?: string) {
  channelCounter += 1;
  return `${base}:${scope || 'global'}:${channelCounter}`;
}

export const realtimeChannels = {
  projects: (scope?: string) => supabase.channel(nextChannelName('projects', scope)),
  projectMatches: (scope?: string) => supabase.channel(nextChannelName('project_matches', scope)),
  aiMatches: (scope?: string) => supabase.channel(nextChannelName('ai_matches', scope)),
  invites: (scope?: string) => supabase.channel(nextChannelName('invites', scope)),
  proposals: (scope?: string) => supabase.channel(nextChannelName('proposals', scope)),
  contracts: (scope?: string) => supabase.channel(nextChannelName('contracts', scope)),
  escrow: (scope?: string) => supabase.channel(nextChannelName('escrow', scope)),
  transactions: (scope?: string) => supabase.channel(nextChannelName('transactions', scope)),
  profiles: (scope?: string) => supabase.channel(nextChannelName('profiles', scope)),
  services: (scope?: string) => supabase.channel(nextChannelName('services', scope)),
  messages: (scope?: string) => supabase.channel(nextChannelName('messages', scope)),
  notifications: (scope?: string) => supabase.channel(nextChannelName('notifications', scope)),
  reviews: (scope?: string) => supabase.channel(nextChannelName('reviews', scope)),
  paypalOrders: (scope?: string) => supabase.channel(nextChannelName('paypal_orders', scope)),
  razorpayOrders: (scope?: string) => supabase.channel(nextChannelName('razorpay_orders', scope)),
  referrals: (scope?: string) => supabase.channel(nextChannelName('referrals', scope)),
  referralStats: (scope?: string) => supabase.channel(nextChannelName('referral_stats', scope)),
  portfolio: (scope?: string) => supabase.channel(nextChannelName('portfolio_items', scope)),
  identity: (scope?: string) =>
    supabase.channel(nextChannelName('identity_verifications', scope)),
  workspaceTasks: (scope?: string) =>
    supabase.channel(nextChannelName('workspace_tasks', scope)),
  workspaceNotes: (scope?: string) =>
    supabase.channel(nextChannelName('workspace_notes', scope)),
};

// ═══ Database function callers ════════════════════════════════════
export const dbFunctions = {
  calculateMatchScore: (projectId: string, freelancerId: string) =>
    supabase.rpc('calculate_match_score', {
      p_project_id: projectId,
      p_freelancer_id: freelancerId,
    }),
  createContractWithEscrow: (params: {
    p_project_id: string;
    p_freelancer_id: string;
    p_proposal_id: string;
    p_amount: number;
    p_client_id: string;
  }) => supabase.rpc('create_contract_with_escrow', params),
  fundEscrow: (contractId: string, clientId: string) =>
    supabase.rpc('fund_escrow', {
      p_contract_id: contractId,
      p_client_id: clientId,
    }),
  releaseEscrow: (contractId: string, clientId: string) =>
    supabase.rpc('release_escrow', {
      p_contract_id: contractId,
      p_client_id: clientId,
    }),
  generateProjectMatches: (projectId: string) =>
    supabase.rpc('generate_project_matches', {
      p_project_id: projectId,
    }),
  // Account Deletion
  requestAccountDeletion: (userId: string, reason?: string) =>
    (supabase.rpc as any)('request_account_deletion', {
      p_user_id: userId,
      p_reason: reason || null,
    }),
  cancelAccountDeletion: (userId: string) =>
    (supabase.rpc as any)('cancel_account_deletion', {
      p_user_id: userId,
    }),
  checkDeletionStatus: (userId: string) =>
    (supabase.rpc as any)('check_deletion_status', {
      p_user_id: userId,
    }),
  processAccountDeletion: (requestId: string) =>
    (supabase.rpc as any)('process_account_deletion', {
      p_request_id: requestId,
    }),
  // Two-Factor Authentication (2FA)
  getMFAStatus: (userId: string) =>
    (supabase.rpc as any)('get_mfa_status', {
      p_user_id: userId,
    }),
  generateRecoveryCodes: (userId: string) =>
    (supabase.rpc as any)('generate_recovery_codes', {
      p_user_id: userId,
    }),
  verifyRecoveryCode: (userId: string, code: string) =>
    (supabase.rpc as any)('verify_recovery_code', {
      p_user_id: userId,
      p_code: code,
    }),
  enableUserMFA: (userId: string, totpSecret: string) =>
    (supabase.rpc as any)('enable_user_mfa', {
      p_user_id: userId,
      p_totp_secret: totpSecret,
    }),
  disableUserMFA: (userId: string) =>
    (supabase.rpc as any)('disable_user_mfa', {
      p_user_id: userId,
    }),
  getRecoveryCodesCount: (userId: string) =>
    (supabase.rpc as any)('get_recovery_codes_count', {
      p_user_id: userId,
    }),
  // Notification Preferences
  getNotificationPreferences: (userId: string) =>
    (supabase.rpc as any)('get_notification_preferences', {
      p_user_id: userId,
    }),
  setNotificationPreferences: (userId: string, preferences: Record<string, unknown>) =>
    (supabase.rpc as any)('set_notification_preferences', {
      p_user_id: userId,
      p_preferences: preferences as unknown as Json,
    }),
  // Notification Enhancements (Phase 5)
  archiveNotification: (notificationId: string, userId: string) =>
    (supabase.rpc as any)('archive_notification', {
      p_notification_id: notificationId,
      p_user_id: userId,
    }),
  restoreNotification: (notificationId: string, userId: string) =>
    (supabase.rpc as any)('restore_notification', {
      p_notification_id: notificationId,
      p_user_id: userId,
    }),
  archiveAllReadNotifications: (userId: string) =>
    (supabase.rpc as any)('archive_all_read_notifications', {
      p_user_id: userId,
    }),
  getNotificationsByCategory: (params: {
    p_user_id: string;
    p_type?: string;
    p_archived?: boolean;
    p_unread_only?: boolean;
    p_limit?: number;
    p_offset?: number;
  }) => (supabase.rpc as any)('get_notifications_by_category', params),
  registerPushToken: (
    userId: string,
    token: string,
    platform: string,
    deviceName?: string,
  ) =>
    (supabase.rpc as any)('register_push_token', {
      p_user_id: userId,
      p_token: token,
      p_platform: platform,
      p_device_name: deviceName || null,
    }),
  unregisterPushToken: (userId: string, token: string) =>
    (supabase.rpc as any)('unregister_push_token', {
      p_user_id: userId,
      p_token: token,
    }),
  getUserPushTokens: (userId: string) =>
    (supabase.rpc as any)('get_user_push_tokens', {
      p_user_id: userId,
    }),
  // === CATEGORY ECOSYSTEM RPCs ===
  getCategoryCounts: () => (supabase.rpc as any)('get_category_counts'),
  getCategoryHierarchy: () => (supabase.rpc as any)('get_category_hierarchy'),
  getCategoryCountsV2: () => (supabase.rpc as any)('get_category_counts_v2'),
  getActiveFreelancersByCategory: () =>
    (supabase.rpc as any)('get_active_freelancers_by_category'),
  searchFreelancersByCategory: (params: {
    p_category_slug: string;
    p_search_query?: string;
    p_min_rate?: number;
    p_max_rate?: number;
    p_sort_by?: string;
    p_limit?: number;
    p_offset?: number;
  }) => (supabase.rpc as any)('search_freelancers_by_category', params),
  getProjectsByCategory: (params: {
    p_category_slug: string;
    p_search_query?: string;
    p_limit?: number;
    p_offset?: number;
  }) => (supabase.rpc as any)('get_projects_by_category', params),

  // === WALLET RPCS ===
  getWalletBalance: (userId: string) =>
    (supabase.rpc as any)('get_wallet_balance', { p_user_id: userId }).single(),
  updateWalletBalance: (userId: string, amount: number) =>
    (supabase.rpc as any)('update_wallet_balance', {
      p_user_id: userId,
      p_amount: amount,
    }).single(),
  holdWalletFunds: (userId: string, amount: number) =>
    (supabase.rpc as any)('hold_wallet_funds', {
      p_user_id: userId,
      p_amount: amount,
    }).single(),
  releaseWalletFunds: (userId: string, amount: number) =>
    (supabase.rpc as any)('release_wallet_funds', {
      p_user_id: userId,
      p_amount: amount,
    }).single(),
  processWithdrawalComplete: (withdrawalId: string) =>
    (supabase.rpc as any)('process_withdrawal_complete', {
      p_withdrawal_id: withdrawalId,
    }).single(),
  cancelWithdrawal: (withdrawalId: string, userId: string) =>
    (supabase.rpc as any)('cancel_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_user_id: userId,
    }).single(),
  getPayoutMethods: (userId: string) =>
    (supabase.rpc as any)('get_payout_methods', { p_user_id: userId }),
  setDefaultPayoutMethod: (methodId: string, userId: string) =>
    (supabase.rpc as any)('set_default_payout_method', {
      p_method_id: methodId,
      p_user_id: userId,
    }).single(),
  deletePayoutMethod: (methodId: string, userId: string) =>
    (supabase.rpc as any)('delete_payout_method', {
      p_method_id: methodId,
      p_user_id: userId,
    }).single(),
};

export type { Database };
