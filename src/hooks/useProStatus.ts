import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  isProSubscription,
  subscriptionService,
  type SubscriptionWithPlan,
} from '../lib/subscriptionHelpers';

interface ProStatus {
  isPro: boolean;
  subscription: SubscriptionWithPlan | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Real-time Pro subscription status for the authenticated user.
 * - Fetches the current active/trial subscription with plan details
 * - Subscribes to realtime `subscriptions` changes so the PRO badge
 *   appears/disappears instantly after payment, cancellation or renewal
 * - Falls back to the auth profile flag (profiles.is_pro) for the first render
 */
export function useProStatus(): ProStatus {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    try {
      const result = await subscriptionService.getCurrentSubscription(user.id);
      if (result.success) {
        setSubscription(result.subscription ?? null);
      }
    } catch {
      // Keep last known state on transient errors
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    void refresh();

    const unsubscribe = subscriptionService.subscribeToChanges(user.id, () => {
      void refresh();
    });
    return unsubscribe;
  }, [user, refresh]);

  // Fallback: auth profile flag gives an instant initial value while the
  // subscription query is in flight.
  const isPro = isProSubscription(subscription) || (user?.isPro ?? false);

  return { isPro, subscription, loading, refresh };
}

export default useProStatus;
