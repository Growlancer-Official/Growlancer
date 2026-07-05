import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowRight,
  BarChart3,
  Check,
  Clock,
  Crown,
  Loader2,
  MessageSquare,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
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
  { feature: 'Withdrawal Limits', free: 'Up to $500/mo', pro: 'Up to $10,000/mo', proHighlight: true },
  { feature: 'Early Access to Features', free: '—', pro: '✓', proHighlight: true },
];

export function AISubscriptionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plans, setPlans] = useState<AIPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<AIUsageStats | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  const fetchData = async () => {
    if (!user) return;
    try {
      const [plansResult, subResult] = await Promise.all([
        subscriptionService.getPlans('freelancer'),
        subscriptionService.getCurrentSubscription(user.id),
      ]);

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
      console.error('Error fetching subscription data:', error);
    } finally {
      setLoading(false);
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void fetchData();
  }, [user]);

  // Real-time subscription changes
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscriptionService.subscribeToChanges(user.id, () => {
      void fetchData();
    });
    return unsubscribe;
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
      alert(result.error || 'Failed to start subscription. Please try again.');
    }

    setUpgrading(null);
  };

  const handleCancel = async () => {
    if (!currentSubscription?.id || !user) return;
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access to Pro features at the end of your billing period.')) return;

    const result = await subscriptionService.cancelSubscription(currentSubscription.id, user.id);
    if (result.success) {
      alert('Subscription will be cancelled at the end of your billing period.');
      const subResult = await subscriptionService.getCurrentSubscription(user.id);
      if (subResult.success) setCurrentSubscription(subResult.subscription ?? null);
    } else {
      alert(result.error || 'Failed to cancel subscription. Please try again.');
    }
  };

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
        <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">Freelancer Subscription</h1>
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
              onClick={() => navigate('/dashboard/settings')}
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
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-white text-red-600 font-bold rounded-xl hover:bg-red-50 transition-colors border border-red-200 text-sm"
            >
              Cancel
            </button>
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
                <span className="text-4xl font-bold text-slate-900">$0</span>
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

        {/* Pro Plan — $10 */}
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
                <span className="text-4xl font-bold text-slate-900">${proPlan.price}</span>
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

            {/* Trust badges */}
            <div className="mt-4 flex items-center justify-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-500" />
                Secure PayPal
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
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Feature</th>
                <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Free</th>
                <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50/50">Pro $10/mo</th>
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
    </div>
  );
}