import type { Tables } from '../types/supabase';
import { dbFunctions, supabase, uniqueChannelName } from './supabase';

type AnyRecord = Record<string, unknown>;

export type SubscriptionWithPlan = Tables<'subscriptions'> & {
  subscription_plans?: Tables<'subscription_plans'> | null;
};

export interface AIPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval: string;
  features: string[];
  ai_messages_limit: number;
  ai_priority: boolean;
  trial_days: number;
  role: string;
  is_active: boolean;
}

export interface AIUsageStats {
  messagesUsed: number;
  messagesLimit: number;
  percentageUsed: number;
  isUnlimited: boolean;
  resetDate: string | null;
  isPriority: boolean;
}

/** True when user has an active or trial Pro-tier plan from subscription_plans. */
export function isProSubscription(
  subscription: SubscriptionWithPlan | null | undefined
): boolean {
  if (!subscription) return false;
  const status = subscription.status ?? '';
  if (status !== 'active' && status !== 'trial') return false;

  // A 'trial' row is PRO only while the trial end date is still in the future.
  // This is the real-time guard — without it an expired trial (before the daily
  // cron flips status) would keep showing the PRO badge.
  if (status === 'trial') {
    if (!subscription.trial_end_date) return false;
    const trialEnd = new Date(subscription.trial_end_date);
    if (Number.isNaN(trialEnd.getTime()) || trialEnd.getTime() <= Date.now()) return false;
  }

  const plan = subscription.subscription_plans;
  if (!plan) return false;

  const name = (plan.name ?? '').toLowerCase();
  return name.includes('pro') || name.includes('premium') || (plan.price ?? 0) > 0;
}

export function subscriptionIsActive(
  subscription: SubscriptionWithPlan | null | undefined
): boolean {
  if (!subscription?.status) return false;
  return subscription.status === 'active' || subscription.status === 'trial';
}

const subscriptionService = {
  /**
   * Fetch active subscription plans, optionally filtered by role.
   */
  async getPlans(role?: string): Promise<{ success: boolean; plans?: AIPlan[]; error?: string }> {
    try {
      let query = supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (role) {
        query = query.eq('role', role);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedPlans: AIPlan[] = (data || []).map((plan: any) => ({
        ...plan,
        features: Array.isArray(plan.features) ? plan.features : [],
      })) as AIPlan[];

      return { success: true, plans: formattedPlans };
    } catch (error) {
      console.error('Error fetching plans:', error);
      return { success: false, error: 'Failed to fetch subscription plans.' };
    }
  },

  /**
   * Get the current user's active/trial subscription with plan details.
   */
  async getCurrentSubscription(userId: string): Promise<{
    success: boolean;
    subscription?: SubscriptionWithPlan | null;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, subscription_plans(*)')
        .eq('user_id', userId)
        .in('status', ['active', 'trial'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return { success: true, subscription: (data as AnyRecord) as SubscriptionWithPlan | null };
    } catch (error) {
      console.error('Error fetching current subscription:', error);
      return { success: false, error: 'Failed to fetch current subscription.' };
    }
  },

  /**
   * True when this user has EVER started a free trial (any plan, any status).
   * The DB guard `enforce_subscription_trial_guard` enforces "one free trial per
   * email, ever" — the UI uses this to hide the trial button and show only
   * paid options (wallet / Razorpay) for users who already used their trial.
   */
  async hasUsedFreeTrial(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .not('trial_start_date', 'is', null)
        .limit(1)
        .maybeSingle();

      if (error) return false;
      return !!data;
    } catch {
      return false;
    }
  },

  /**
   * Subscribe to a plan. If the plan has trial_days > 0 AND the user has never
   * used a free trial before, starts a trial. Otherwise creates a 'pending'
   * subscription (payment is handled separately — wallet or Razorpay).
   *
   * ⚠️ SECURITY (2026): subscription creation runs ENTIRELY server-side through
   * the SECURITY DEFINER RPC `create_user_subscription`. The browser never
   * INSERTs/UPDATEs subscription state directly, so it can never fabricate an
   * 'active' (paid) row, never farm a second trial via upsert, and never set
   * its own end-dates. 'active' is only reached after real payment
   * (pay_subscription_with_wallet / razorpay verify / webhook capture).
   */
  async subscribeToPlan(
    userId: string,
    planId: string
  ): Promise<{ success: boolean; subscription?: SubscriptionWithPlan; error?: string }> {
    try {
      // Trial eligibility is decided SERVER-SIDE by the RPC (verified email +
      // one trial per email ever). This method is now a thin RPC wrapper.
      const { data: rpc, error: rpcError } = await dbFunctions.createUserSubscription(planId);

      if (rpcError) throw rpcError;
      const result = rpc as { success?: boolean; subscription_id?: string; error?: string } | null;
      if (!result?.success || !result.subscription_id) {
        throw new Error(result?.error || 'Failed to create subscription');
      }

      // Load the freshly created row (own-row SELECT is allowed by RLS).
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, subscription_plans(*)')
        .eq('id', result.subscription_id)
        .maybeSingle();

      if (error) throw error;

      // is_pro is automatically synced by the sync_profile_pro_flag trigger
      // (SECURITY DEFINER) on the subscriptions table — no client-side update needed.

      return { success: true, subscription: (data as unknown as SubscriptionWithPlan) ?? null };
    } catch (error: any) {
      // Surface the REAL server message (e.g. the trial guard trigger's
      // "A free trial has already been used for this email address" or
      // "Please verify your email address before starting a free trial")
      // instead of a generic failure — that's why trials seemed to "not activate".
      console.error('Error subscribing to plan:', error);
      const serverMessage = error?.message || '';
      return {
        success: false,
        error: serverMessage && !/failed to fetch|networkerror|load failed/i.test(serverMessage)
          ? serverMessage
          : 'Failed to subscribe to plan. Please try again.'
      };
    }
  },

  /**
   * Get the user's LATEST subscription row regardless of status
   * (active / trial / past_due / cancelled / expired). Used by the
   * manage/renew UI so a cancelled subscription can be renewed.
   */
  async getLatestSubscription(userId: string): Promise<{
    success: boolean;
    subscription?: SubscriptionWithPlan | null;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, subscription_plans(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return { success: true, subscription: (data as AnyRecord) as SubscriptionWithPlan | null };
    } catch (error) {
      console.error('Error fetching latest subscription:', error);
      return { success: false, error: 'Failed to fetch subscription.' };
    }
  },

  /**
   * Cancel a subscription (set cancel_at_period_end).
   */
  async cancelSubscription(
    subscriptionId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ cancel_at_period_end: true })
        .eq('id', subscriptionId)
        .eq('user_id', userId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      return { success: false, error: 'Failed to cancel subscription.' };
    }
  },

  /**
   * Renew a cancelled/past_due subscription (re-enable auto-renewal).
   * Payment (wallet or Razorpay) then extends the period.
   */
  async renewSubscription(
    subscriptionId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ cancel_at_period_end: false })
        .eq('id', subscriptionId)
        .eq('user_id', userId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error renewing subscription:', error);
      return { success: false, error: 'Failed to renew subscription.' };
    }
  },

  /**
   * Pay for a subscription using the Growlancer wallet balance.
   * All financial validation happens server-side (razorpay edge function,
   * action `wallet_subscription_pay`): server-side plan price, wallet
   * balance check, atomic deduction, subscription activation + audit log.
   */
  async payWithWallet(
    subscriptionId: string
  ): Promise<{ success: boolean; subscription?: SubscriptionWithPlan; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('razorpay', {
        body: {
          action: 'wallet_subscription_pay',
          data: { subscription_id: subscriptionId },
        },
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Wallet payment failed');
      }

      return { success: true, subscription: data.subscription as SubscriptionWithPlan };
    } catch (error) {
      console.error('Error paying with wallet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Wallet payment failed.',
      };
    }
  },

  /**
   * Get AI message usage statistics for the current billing period.
   */
  async getAIMessageUsage(
    userId: string,
    planId?: string | null
  ): Promise<{ success: boolean; stats?: AIUsageStats; error?: string }> {
    try {
      let messagesLimit = 10; // Free plan default
      let isUnlimited = false;
      let isPriority = false;

      if (planId) {
        const { data: plan } = await supabase
          .from('subscription_plans')
          .select('ai_messages_limit, ai_priority')
          .eq('id', planId)
          .single();

        if (plan) {
          messagesLimit = plan.ai_messages_limit ?? 10;
          isUnlimited = messagesLimit >= 1000;
          isPriority = plan.ai_priority ?? false;
        }
      }

      // Count messages used this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Aggregate: usage_logs can legally hold MULTIPLE rows per (user, month)
      // (each billing/tracking pass inserts its own row). maybeSingle() would
      // error on the second row and silently kill the usage meter — sum instead.
      const { data: usageRows, error: usageError } = await supabase
        .from('usage_logs')
        .select('usage_count')
        .eq('user_id', userId)
        .eq('feature_type', 'ai_message')
        .gte('created_at', startOfMonth.toISOString());

      if (usageError) throw usageError;

      const messagesUsed = (usageRows || []).reduce(
        (sum, row) => sum + (Number((row as { usage_count?: number }).usage_count) || 0),
        0
      );
      const percentageUsed = isUnlimited ? 0 : Math.min(100, Math.round((messagesUsed / messagesLimit) * 100));

      // Calculate reset date (next 1st of month)
      const resetDate = new Date();
      resetDate.setMonth(resetDate.getMonth() + 1);
      resetDate.setDate(1);
      resetDate.setHours(0, 0, 0, 0);

      return {
        success: true,
        stats: {
          messagesUsed,
          messagesLimit,
          percentageUsed,
          isUnlimited,
          resetDate: resetDate.toISOString(),
          isPriority,
        },
      };
    } catch (error) {
      console.error('Error fetching AI usage stats:', error);
      return { success: false, error: 'Failed to fetch AI usage statistics.' };
    }
  },

  /**
   * Start a realtime channel to listen for subscription changes.
   */
  subscribeToChanges(userId: string, callback: () => void) {
    // uniqueChannelName() is REQUIRED: useProStatus() is mounted in multiple
    // components (DashboardLayout + OverviewPage + Pro pages) — a static name
    // makes supabase-js return the already-subscribed channel, and adding
    // .on() after subscribe() throws and crashes the dashboard.
    const channel = supabase
      .channel(uniqueChannelName('subscription-changes', userId))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          callback();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};

export { subscriptionService };
export default subscriptionService;