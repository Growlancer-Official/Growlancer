import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  CreditCard,
  Crown,
  IndianRupee,
  Loader2,
  MessageSquare,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useToast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ProBadge } from '../../components/ProBadge';
import { SubscriptionPayPalPayment } from '../../components/SubscriptionPayPalPayment';
import { withdrawalService } from '../../lib/withdrawal';
import {
  subscriptionService,
  type AIPlan,
  type AIUsageStats,
  type SubscriptionWithPlan,
} from '../../lib/subscriptionHelpers';

const FEATURE_COMPARISON = [
  { feature: 'AI Messages / Month', free: '10 messages', pro: 'Unlimited', proHighlight: true },
  { feature: 'AI-Powered Matching', free: 'Basic', pro: 'Priority AI', proHighlight: true },
  { feature: 'AI Assistant', free: 'Basic', pro: 'Advanced + Priority', proHighlight: true },
  { feature: 'Profile Visibility', free: 'Standard', pro: 'Featured Priority', proHighlight: true },
  { feature: 'Project Feed Access', free: 'Standard', pro: 'Early Access', proHighlight: true },
  { feature: 'Analytics Dashboard', free: 'Basic', pro: 'Advanced + Insights', proHighlight: true },
  { feature: 'Support', free: 'AI Assistant', pro: 'Priority AI Support', proHighlight: true },
  { feature: 'Withdrawal Limits', free: 'Up to ₹40,000/mo', pro: 'Up to ₹8,00,000/mo', proHighlight: true },
  { feature: 'Early Access to Features', free: '—', pro: '✓', proHighlight: true },
];

export function AISubscriptionPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<AIPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<AIUsageStats | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info';
    confirmLabel?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const toast = useToast();
  const [manageOpen, setManageOpen] = useState(false);
  const [manageSubscription, setManageSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [walletPaying, setWalletPaying] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    try {
      const [plansResult, subResult] = await Promise.all([
        subscriptionService.getPlans('freelancer'),
        subscriptionService.getCurrentSubscription(user.id),
      ]);

      // Fetch wallet balance for the Pay-with-Wallet option
      const balResult = await withdrawalService.getWalletBalance();
      if (balResult.success && balResult.balance) {
        setWalletBalance(Number(balResult.balance.balance) || 0);
      }

      // Latest subscription (ANY status) for the Manage panel so renew works
      // for past_due / cancelled rows, not just active / trial.
      const latestSub = await subscriptionService.getLatestSubscription(user.id);
      if (latestSub.success) {
        setManageSubscription(latestSub.subscription ?? null);
      }

      if (plansResult.success && plansResult.plans) {
        setPlans(plansResult.plans);
      }
      if (subResult.success) {
        setCurrentSubscription(subResult.subscription ?? null);

        // Fetch AI usage stats if we have a subscription
        if (subResult.subscription) {
          const usageResult = await subscriptionService.getAIMessageUsage(
            user.id,
            subResult.subscription.plan_id
          );
          if (usageResult.success && usageResult.stats) {
            setUsageStats(usageResult.stats);
          }
        }
      }
    } catch (error) {
      toast.error('Error', 'Failed to load subscription data.');
    } finally {
      setLoading(false);
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Real-time subscription changes
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscriptionService.subscribeToChanges(user.id, () => {
      void fetchData();
    });
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSubscribe = async (planId: string) => {
    if (!user) return;
    setUpgrading(planId);

    const result = await subscriptionService.subscribeToPlan(user.id, planId);
    if (result.success && result.subscription) {
      setCurrentSubscription(result.subscription);
      const usageResult = await subscriptionService.getAIMessageUsage(user.id, planId);
      if (usageResult.success && usageResult.stats) {
        setUsageStats(usageResult.stats);
      }
    } else {
      toast.error('Failed', result.error || 'Failed to start subscription.');
    }

    setUpgrading(null);
  };

  const handleCancel = async () => {
    if (!currentSubscription?.id || !user) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Cancel Subscription',
      message: 'Are you sure you want to cancel your subscription? You will lose access to Pro features at the end of your billing period.',
      variant: 'warning',
      confirmLabel: 'Cancel',
      onConfirm: async () => {
        const result = await subscriptionService.cancelSubscription(currentSubscription.id, user.id);
        if (result.success) {
          toast.success('Cancelled', 'Subscription will be cancelled at the end of your billing period.');
          const subResult = await subscriptionService.getCurrentSubscription(user.id);
          if (subResult.success) setCurrentSubscription(subResult.subscription ?? null);
        } else {
          toast.error('Failed', result.error || 'Failed to cancel subscription.');
        }
        setConfirmDialog(null);
      },
    });
  };

  /** Pay for the selected plan with the Growlancer wallet (server-validated). */
  const handleWalletPay = async (planId: string) => {
    if (!user) return;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    setWalletPaying(true);
    try {
      // Fresh balance check BEFORE mutating anything, so an insufficient wallet
      // never cancels an existing subscription (subscribeToPlan cancels first).
      const freshBal = await withdrawalService.getWalletBalance();
      const balance = freshBal.success && freshBal.balance ? Number(freshBal.balance.balance) || 0 : 0;
      if (balance < plan.price) {
        toast.error('Insufficient balance', `Wallet balance ₹${balance.toLocaleString('en-IN')} is less than ₹${plan.price.toLocaleString('en-IN')}. Add funds or pay with Razorpay.`);
        return;
      }
      setWalletBalance(balance);

      // Create (or restore) the subscription row, then pay from wallet
      const result = await subscriptionService.subscribeToPlan(user.id, planId);
      if (result.success && result.subscription) {
        const pay = await subscriptionService.payWithWallet(result.subscription.id);
        if (pay.success) {
          toast.success('Paid', 'Pro activated — paid from wallet balance.');
          setShowPayment(false);
          setManageOpen(false);
          await fetchData();
        } else {
          toast.error('Failed', pay.error || 'Wallet payment failed.');
        }
      } else {
        toast.error('Failed', result.error || 'Failed to start subscription.');
      }
    } catch {
      toast.error('Failed', 'Unexpected error while paying with wallet.');
    } finally {
      setWalletPaying(false);
    }
  };

  /** Re-enable auto-renewal for a cancelled / past-due subscription. */
  const handleRenew = async () => {
    if (!currentSubscription?.id || !user) return;
    const result = await subscriptionService.renewSubscription(currentSubscription.id, user.id);
    if (result.success) {
      toast.success('Renewed', 'Auto-renewal re-enabled.');
      const subResult = await subscriptionService.getCurrentSubscription(user.id);
      if (subResult.success) setCurrentSubscription(subResult.subscription ?? null);
    } else {
      toast.error('Failed', result.error || 'Failed to renew subscription.');
    }
  };

  const formatDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  const isTrialActive = currentSubscription?.status === 'trial' && new Date(currentSubscription.trial_end_date) > new Date();
  const trialDaysLeft = isTrialActive
    ? Math.ceil((new Date(currentSubscription.trial_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const isSubscribed = currentSubscription && (currentSubscription.status === 'active' || currentSubscription.status === 'trial');
  const isPro = currentSubscription?.subscription_plans?.price ? currentSubscription.subscription_plans.price > 0 : false;

  // Separate free and pro plans
  const freePlan = plans.find(p => p.price === 0);
  const proPlan = plans.find(p => (p.price ?? 0) > 0);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-slate-900 mb-2 flex items-center gap-2.5">
          Freelancer Subscription
          {isPro && <ProBadge size="md" showLabel />}
        </h1>
        <p className="text-slate-500">Choose the plan that fits your freelance career. Upgrade anytime.</p>
      </div>

      {/* Live Status Badge */}
      <div className="mb-6 flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full border border-slate-200 w-fit">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="text-xs font-semibold text-slate-600">
          {isSubscribed
            ? isPro
              ? `Pro Plan Active — ${currentSubscription?.cancel_at_period_end ? 'Cancels at period end' : 'Auto-renewing'}`
              : isTrialActive
              ? `Trial Active — ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} remaining`
              : 'Subscription Active'
            : 'Free Plan — Upgrade to unlock Pro features'}
        </span>
      </div>

      {/* Banners */}
      {isTrialActive && (
        <div className="mb-8 p-6 bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-xl">
                <Clock className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Free Trial Active</h3>
                <p className="text-sm text-slate-600">
                  {trialDaysLeft} days remaining in your {currentSubscription?.subscription_plans?.name} trial
                </p>
              </div>
            </div>
            <button
              onClick={() => setManageOpen(true)}
              className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Manage
            </button>
          </div>
        </div>
      )}

      {isSubscribed && !isTrialActive && (
        <div className="mb-8 p-6 bg-gradient-to-r from-emerald-50 to-emerald-100/60 border border-emerald-200 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-xl">
                <Crown className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">
                  {currentSubscription?.subscription_plans?.name || 'Pro'} Plan Active
                </h3>
                <p className="text-sm text-slate-600">
                  {currentSubscription?.cancel_at_period_end
                    ? 'Cancels at end of billing period'
                    : currentSubscription?.subscription_end_date
                    ? `Renews ${new Date(currentSubscription.subscription_end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                    : 'Active'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setManageOpen(true)}
                className="px-4 py-2 bg-white text-emerald-700 font-bold rounded-xl hover:bg-emerald-50 transition-colors border border-emerald-200 text-sm"
              >
                Manage
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-white text-red-600 font-bold rounded-xl hover:bg-red-50 transition-colors border border-red-200 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {/* Free Plan */}
        {freePlan && (
          <div className={`relative p-6 rounded-2xl border-2 transition-all bg-white border-slate-200 ${!isSubscribed || !isPro ? 'ring-1 ring-slate-300' : ''}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-slate-100">
                <Zap className="w-6 h-6 text-slate-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{freePlan.name}</h3>
                <p className="text-sm text-slate-500">{freePlan.description}</p>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-slate-900">₹0</span>
                <span className="text-slate-500">/{freePlan.interval}</span>
              </div>
              <p className="text-sm text-slate-500 mt-1">No credit card required</p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">{freePlan.ai_messages_limit} AI messages/month</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">Basic AI matching</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">Standard profile visibility</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <X className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-400">Priority AI responses</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <X className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-400">Advanced analytics</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <X className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-400">Priority AI support</span>
              </div>
            </div>

            <button
              disabled
              className="w-full py-3 font-bold rounded-xl bg-slate-100 text-slate-400 cursor-not-allowed text-sm"
            >
              {isSubscribed && !isPro ? 'Current Plan' : 'Free'}
            </button>
          </div>
        )}

        {/* Pro Plan — ₹499 */}
        {proPlan && (
          <div className={`relative p-6 rounded-2xl border-2 transition-all bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 shadow-xl shadow-emerald-600/10 ${
            isPro ? 'border-emerald-600 ring-2 ring-emerald-400' : 'border-emerald-500'
          }`}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-5 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full whitespace-nowrap shadow-lg">
              RECOMMENDED — BEST VALUE
            </div>
            {isPro && (
              <div className="absolute top-4 right-4 px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">
                ACTIVE
              </div>
            )}

            <div className="flex items-center gap-3 mb-4 mt-3">
              <div className="p-3 rounded-xl bg-emerald-100">
                <Crown className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{proPlan.name}</h3>
                <p className="text-sm text-slate-500">{proPlan.description}</p>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-slate-900">₹{proPlan.price.toLocaleString('en-IN')}</span>
                <span className="text-slate-500">/{proPlan.interval}</span>
                <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Save 17% yearly</span>
              </div>
              {proPlan.trial_days > 0 && (
                <p className="text-sm text-emerald-600 font-medium mt-1">
                  <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                  {proPlan.trial_days}-day free trial — cancel anytime
                </p>
              )}
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">
                  {proPlan.ai_messages_limit >= 1000 ? 'Unlimited AI messages' : `${proPlan.ai_messages_limit} AI messages/month`}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">Priority AI matching</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">Featured profile placement</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">Priority AI responses</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">Advanced analytics dashboard</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">24/7 priority support</span>
              </div>
            </div>

            <button
              onClick={() => isPro ? handleCancel() : handleSubscribe(proPlan.id)}
              disabled={upgrading === proPlan.id}
              className={`w-full py-3 font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2 ${
                isPro
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/25 active:scale-[0.98]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {upgrading === proPlan.id ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="animate-spin w-4 h-4" />
                  Processing...
                </span>
              ) : isPro ? (
                'Cancel Subscription'
              ) : isTrialActive ? (
                'Upgrade to Pro'
              ) : proPlan.trial_days > 0 ? (
                <>
                  Start Free Trial
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Subscribe to Pro
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Quick payment options when not yet Pro */}
            {!isPro && (
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => handleWalletPay(proPlan.id)}
                  disabled={walletPaying || (walletBalance !== null && walletBalance < proPlan.price)}
                  className="w-full py-2.5 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {walletPaying ? (
                    <>
                      <Loader2 className="animate-spin w-4 h-4" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4" />
                      Pay with Wallet
                      {walletBalance !== null && ` — ₹${walletBalance.toLocaleString('en-IN')}`}
                      {walletBalance !== null && walletBalance < proPlan.price ? ' (insufficient)' : ''}
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowPayment(true)}
                  className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  Pay with Razorpay (UPI / Card / NetBanking)
                </button>
              </div>
            )}

            {/* Trust badges */}
            <div className="mt-4 flex items-center justify-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-500" />
                Secure Razorpay UPI
              </span>
              <span className="flex items-center gap-1">
                <RefreshCw className="w-3 h-3 text-emerald-500" />
                Cancel Anytime
              </span>
            </div>
          </div>
        )}
      </div>

      {/* AI Usage Stats — only visible on Pro */}
      {isPro && usageStats && (
        <div className="mb-10 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              Your Usage This Month
            </h2>
            {usageStats?.isPriority && (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Priority Access
              </span>
            )}
          </div>

          {usageLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-emerald-600 w-6 h-6" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-600">AI Messages</span>
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-2xl font-bold text-slate-900">{usageStats.messagesUsed}</span>
                  <span className="text-slate-400 text-sm">/ {usageStats.isUnlimited ? '∞' : usageStats.messagesLimit}</span>
                </div>
                {!usageStats.isUnlimited && (
                  <div className="relative pt-1">
                    <div className="overflow-hidden h-2 rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          usageStats.percentageUsed >= 80 ? 'bg-red-500' : usageStats.percentageUsed >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, usageStats.percentageUsed)}%` }}
                      />
                    </div>
                  </div>
                )}
                {usageStats.isUnlimited && <p className="text-xs text-emerald-600 font-medium">Unlimited</p>}
              </div>

              <div className="p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-600">Resets On</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {usageStats.resetDate
                    ? new Date(usageStats.resetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'N/A'}
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-600">AI Priority</span>
                </div>
                <div className="flex items-center gap-2">
                  {usageStats.isPriority ? (
                    <span className="text-2xl font-bold text-emerald-600">Active</span>
                  ) : (
                    <span className="text-2xl font-bold text-slate-400">Standard</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Free vs Pro Feature Comparison Table */}
      <div className="mb-10">
        <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-600" />
          Free vs Pro — Full Comparison
        </h2>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
          <table className="w-full min-w-[560px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Feature</th>
                <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Free</th>
                <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50/50">Pro ₹499/mo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {FEATURE_COMPARISON.map((row, i) => (
                <tr key={i} className={`text-sm ${row.proHighlight ? 'bg-emerald-50/30' : ''}`}>
                  <td className="p-4 font-medium text-slate-700">{row.feature}</td>
                  <td className="p-4 text-center text-slate-500">{row.free}</td>
                  <td className={`p-4 text-center font-semibold ${row.proHighlight ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {row.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Why Upgrade */}
      <div className="mb-10 p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl text-white">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-500/20 rounded-xl">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Why Go Pro?</h3>
            <p className="text-sm text-slate-400">The numbers speak for themselves</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-2xl font-bold text-emerald-400 mb-1">5x</div>
            <p className="text-xs text-slate-400">More profile views with featured placement</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-2xl font-bold text-emerald-400 mb-1">3x</div>
            <p className="text-xs text-slate-400">Faster project matching with priority AI</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="text-2xl font-bold text-emerald-400 mb-1">Unlimited</div>
            <p className="text-xs text-slate-400">AI messages to craft winning proposals</p>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div>
        <h3 className="font-bold text-slate-900 mb-4">Frequently Asked Questions</h3>
        <div className="space-y-3">
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-semibold text-slate-900 text-sm mb-1">What happens after the free trial?</h4>
            <p className="text-sm text-slate-600">After your trial ends, you'll be downgraded to the Free plan automatically. No charge unless you choose to subscribe.</p>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-semibold text-slate-900 text-sm mb-1">Can I cancel anytime?</h4>
            <p className="text-sm text-slate-600">Yes! Cancel with one click. You keep Pro access until the end of your billing period. No questions asked.</p>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-semibold text-slate-900 text-sm mb-1">What's the real difference between Free and Pro?</h4>
            <p className="text-sm text-slate-600">Free gives you 10 AI messages/month and standard matching. Pro gives you unlimited AI messages, priority matching, featured profile placement, advanced analytics, and 24/7 priority support.</p>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-semibold text-slate-900 text-sm mb-1">How does Pro help me earn more?</h4>
            <p className="text-sm text-slate-600">Pro profiles get 5x more views, 3x faster matching, and unlimited AI help for crafting better proposals — leading to higher win rates and larger projects.</p>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmDialog && (
        <ConfirmModal
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
        />
      )}

      {/* Confirm Modal */}
      {confirmDialog && (
        <ConfirmModal
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
        />
      )}

      {/* Subscription Management Panel */}
      {manageOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-auto max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-600" />
                Manage Subscription
              </h2>
              <button
                onClick={() => setManageOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                aria-label="Close manage panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {(manageSubscription ?? currentSubscription) ? (
                <>
                  <div className="p-4 bg-slate-50 rounded-xl space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Plan</span>
                      <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                        {(manageSubscription ?? currentSubscription).subscription_plans?.name || 'Pro'}
                        {isPro && <ProBadge size="xs" />}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Status</span>
                      <span className="font-semibold capitalize text-slate-900">{(manageSubscription ?? currentSubscription).status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        {(manageSubscription ?? currentSubscription).cancel_at_period_end ? 'Renewal' : 'Renews / ends'}
                      </span>
                      <span className={`font-semibold ${(manageSubscription ?? currentSubscription).cancel_at_period_end ? 'text-amber-600' : 'text-slate-900'}`}>
                        {(manageSubscription ?? currentSubscription).cancel_at_period_end
                          ? 'Cancels at period end'
                          : formatDate((manageSubscription ?? currentSubscription).subscription_end_date || (manageSubscription ?? currentSubscription).trial_end_date)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Payment method</span>
                      <span className="font-semibold capitalize text-slate-900">
                        {(manageSubscription ?? currentSubscription).payment_provider || 'Trial / Free'}
                      </span>
                    </div>
                    {walletBalance !== null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Wallet balance</span>
                        <span className="font-semibold text-emerald-700 flex items-center gap-1">
                          <IndianRupee className="w-3.5 h-3.5" />
                          {walletBalance.toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(manageSubscription ?? currentSubscription).cancel_at_period_end ||
                    (manageSubscription ?? currentSubscription).status === 'past_due' ||
                    (manageSubscription ?? currentSubscription).status === 'cancelled' ? (
                      <button
                        onClick={handleRenew}
                        className="py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-colors"
                      >
                        Renew Now
                      </button>
                    ) : (
                      <button
                        onClick={handleCancel}
                        className="py-3 rounded-xl bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition-colors"
                      >
                        Cancel Subscription
                      </button>
                    )}
                    <button
                      onClick={() => setShowPayment(true)}
                      className="py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-colors"
                    >
                      Payment Options
                    </button>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    {(manageSubscription ?? currentSubscription).cancel_at_period_end
                      ? 'Your Pro access continues until the end of your billing period, then you will be downgraded to the Free plan. You can renew anytime.'
                      : 'Cancel anytime — you keep Pro access until the end of your billing period. Renew or change payment anytime.'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500">No subscription found. Choose a plan to get started.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment modal — Razorpay external checkout */}
      {showPayment && proPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg my-auto">
            <button
              type="button"
              onClick={() => setShowPayment(false)}
              className="absolute top-3 right-3 z-20 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <SubscriptionPayPalPayment
              planId={proPlan.id}
              planName={proPlan.name}
              planPrice={proPlan.price}
              role="freelancer"
              trialDays={proPlan.trial_days}
              onSuccess={() => {
                setShowPayment(false);
                void fetchData();
              }}
              onCancel={() => setShowPayment(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}