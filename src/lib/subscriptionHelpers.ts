import type { Tables } from '../types/supabase';
import { supabase } from './supabase';

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
   * Subscribe to a plan. If the plan has trial_days > 0, starts a trial.
   * Otherwise creates an active subscription (for paid plans, payment should be handled separately).
   */
  async subscribeToPlan(
    userId: string,
    planId: string,
    paymentProvider?: string,
    paymentSubscriptionId?: string
  ): Promise<{ success: boolean; subscription?: SubscriptionWithPlan; error?: string }> {
    try {
      // Fetch the plan to check trial days
      const { data: plan, error: planError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (planError || !plan) throw planError || new Error('Plan not found');

      const now = new Date();
      const trialDays = plan.trial_days || 0;
      const isTrial = trialDays > 0;

      // Cancel any existing active/trial subscriptions
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', cancel_at_period_end: true })
        .eq('user_id', userId)
        .in('status', ['active', 'trial']);

      const subscriptionData: any = {
        user_id: userId,
        plan_id: planId,
        status: isTrial ? 'trial' : 'active',
        start_date: now.toISOString(),
        trial_start_date: isTrial ? now.toISOString() : null,
        trial_end_date: isTrial
          ? new Date(now.getTime() + trialDays * 86400000).toISOString()
          : null,
        payment_provider: paymentProvider || null,
        payment_subscription_id: paymentSubscriptionId || null,
      };

      if (!isTrial && paymentProvider) {
        // Paid plan - set expiry to 1 month/year from now
        const interval = plan.interval || 'month';
        const expiryDate = new Date(now);
        if (interval === 'year') {
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        } else {
          expiryDate.setMonth(expiryDate.getMonth() + 1);
        }
        subscriptionData.subscription_end_date = expiryDate.toISOString();
        subscriptionData.expiry_date = expiryDate.toISOString();
      }

      const { data, error } = await supabase
        .from('subscriptions')
        .insert(subscriptionData)
        .select('*, subscription_plans(*)')
        .single();

      if (error) throw error;

      // Update profile is_pro flag
      await supabase
        .from('profiles')
        .update({ is_pro: true })
        .eq('id', userId);

      return { success: true, subscription: data as unknown as SubscriptionWithPlan };
    } catch (error) {
      console.error('Error subscribing to plan:', error);
      return { success: false, error: 'Failed to subscribe to plan.' };
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

      const { data: usageData, error: usageError } = await supabase
        .from('usage_logs')
        .select('usage_count')
        .eq('user_id', userId)
        .eq('feature_type', 'ai_message')
        .gte('created_at', startOfMonth.toISOString())
        .maybeSingle();

      if (usageError) throw usageError;

      const messagesUsed = usageData?.usage_count ?? 0;
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
    const channel = supabase
      .channel(`subscription-changes-${userId}`)
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
      void channel.unsubscribe();
    };
  },
};

export { subscriptionService };
export default subscriptionService;