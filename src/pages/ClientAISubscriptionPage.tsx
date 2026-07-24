import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  ArrowRight,
  Calendar,
  Check,
  Clock,
  Crown,
  Info,
  Loader2,
  RefreshCw,
  Shield,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  subscriptionService,
  type AIPlan,
  type SubscriptionWithPlan,
} from '../lib/subscriptionHelpers';

const FEATURE_COMPARISON = [
  { feature: 'AI Messages / Month', free: '10 messages', pro: 'Unlimited', proHighlight: true },
  { feature: 'Freelancer Matching', free: 'Basic', pro: 'Priority AI', proHighlight: true },
  { feature: 'AI Assistant', free: 'Basic', pro: 'Advanced', proHighlight: true },
  { feature: 'Candidate Insights', free: 'Basic', pro: 'Advanced + Analytics', proHighlight: true },
  { feature: 'Project Recommendations', free: 'Standard', pro: 'AI-Powered', proHighlight: true },
  { feature: 'Support', free: 'AI Assistant', pro: 'Priority AI Support', proHighlight: true },
];

export function ClientAISubscriptionPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<AIPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [plansResult, subResult] = await Promise.all([
        subscriptionService.getPlans('client'),
        subscriptionService.getCurrentSubscription(user.id),
      ]);

      if (plansResult.success && plansResult.plans) {
        setPlans(plansResult.plans);
      }
      if (subResult.success) {
        setCurrentSubscription(subResult.subscription ?? null);
      }
    } catch (error) {
      console.error('Error fetching subscription data:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchData();
  }, [user, fetchData]);

  // Real-time subscription changes
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscriptionService.subscribeToChanges(user.id, () => {
      void fetchData();
    });
    return unsubscribe;
  }, [user, fetchData]);

  const handleSubscribe = async (planId: string) => {
    if (!user) return;
    setUpgrading(planId);

    const result = await subscriptionService.subscribeToPlan(user.id, planId);
    if (result.success && result.subscription) {
      setCurrentSubscription(result.subscription);
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
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-emerald-600 w-8 h-8" />
      </div>
    );
  }

  const isTrialActive = currentSubscription?.status === 'trial' && currentSubscription.trial_end_date && new Date(currentSubscription.trial_end_date) > new Date();
  const trialDaysLeft = isTrialActive
    ? Math.ceil((new Date(currentSubscription!.trial_end_date!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const isSubscribed = currentSubscription && (currentSubscription.status === 'active' || currentSubscription.status === 'trial');
  const isPro = currentSubscription?.subscription_plans?.price ? currentSubscription.subscription_plans.price > 0 : false;

  const freePlan = plans.find(p => p.price === 0);
  const proPlan = plans.find(p => (p.price ?? 0) > 0);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">AI Subscription</h1>
        <p className="text-slate-500">Unlock AI-powered hiring tools to find better freelancers faster</p>
      </div>

      {/* Live Status Badge */}
      <div className="mb-6 flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full border border-slate-200 w-fit">
        <span className={`h-2 w-2 rounded-full ${isSubscribed ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'} `}></span>
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

      {/* Trial Banner */}
      {isTrialActive && (
        <div className="mb-8 p-6 bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl">
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
          </div>
        </div>
      )}

      {isSubscribed && !isTrialActive && isPro && (
        <div className="mb-8 p-6 bg-gradient-to-r from-emerald-50 to-emerald-100/60 border border-emerald-200 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-xl">
                <Crown className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{currentSubscription?.subscription_plans?.name || 'Pro'} Plan Active</h3>
                <p className="text-sm text-slate-600">
                  {currentSubscription?.cancel_at_period_end
                    ? 'Cancels at end of billing period'
                    : currentSubscription?.subscription_end_date
                    ? `Renews ${new Date(currentSubscription.subscription_end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                    : 'Active'}
                </p>
              </div>
            </div>
            <button onClick={handleCancel} className="px-4 py-2 bg-white text-red-600 font-bold rounded-xl hover:bg-red-50 transition-colors border border-red-200 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="mb-8 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-emerald-100 rounded-xl flex-shrink-0">
            <Info className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm mb-1">AI Features Only — Post Projects Free</h3>
            <p className="text-sm text-slate-600">
              This subscription is for AI-powered hiring tools. You can always post projects and hire freelancers for free.
              The AI features help you find better matches faster.
            </p>
          </div>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {/* Free Plan */}
        {freePlan && (
          <div className="relative p-6 rounded-2xl border-2 border-slate-200 bg-white">
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
                <span className="text-slate-700">Basic freelancer matching</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">Post projects for free</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <X className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-400">Priority AI matching</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <X className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-400">Advanced candidate insights</span>
              </div>
            </div>
            <button disabled className="w-full py-3 font-bold rounded-xl bg-slate-100 text-slate-400 cursor-not-allowed text-sm">
              {isSubscribed && !isPro ? 'Current Plan' : 'Free'}
            </button>
          </div>
        )}

        {/* Pro Plan */}
        {proPlan && (
          <div className={`relative p-6 rounded-2xl border-2 transition-all bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 shadow-xl shadow-emerald-600/10 ${
            isPro ? 'border-emerald-600 ring-2 ring-emerald-400' : 'border-emerald-500'
          }`}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-5 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full whitespace-nowrap shadow-lg">
              7-DAY FREE TRIAL
            </div>
            {isPro && (
              <div className="absolute top-4 right-4 px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">ACTIVE</div>
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
              </div>
              <p className="text-sm text-emerald-600 font-medium mt-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                7-day free trial — cancel anytime, no charge
              </p>
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
                <span className="text-slate-700">Priority AI freelancer matching</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">Advanced candidate insights</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">AI-powered project recommendations</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-slate-700">24/7 priority support</span>
              </div>
            </div>

            {isPro ? (
              <button onClick={handleCancel} className="w-full py-3 font-bold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all text-sm">
                Cancel Subscription
              </button>
            ) : (
              <button
                onClick={() => handleSubscribe(proPlan.id)}
                disabled={upgrading === proPlan.id}
                className="w-full py-3 font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 active:scale-[0.98] text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {upgrading === proPlan.id ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin w-4 h-4" />
                    Starting Trial...
                  </span>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Start 7-Day Free Trial
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}

            <div className="mt-4 flex items-center justify-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-emerald-500" />
                No Payment Needed
              </span>
              <span className="flex items-center gap-1">
                <RefreshCw className="w-3 h-3 text-emerald-500" />
                Cancel Anytime
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Free vs Pro Comparison */}
      <div className="mb-10">
        <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          Free vs Pro — Full Comparison
        </h2>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Feature</th>
                <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Free</th>
                <th className="text-center p-4 text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50/50">Pro</th>
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

      {/* FAQ */}
      <div>
        <h3 className="font-bold text-slate-900 mb-4">Frequently Asked Questions</h3>
        <div className="space-y-3">
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-semibold text-slate-900 text-sm mb-1">Is this required to hire freelancers?</h4>
            <p className="text-sm text-slate-600">No! You can always post projects and hire freelancers for free. The AI features just help you find better matches faster with smart recommendations.</p>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-semibold text-slate-900 text-sm mb-1">What happens after the 7-day free trial?</h4>
            <p className="text-sm text-slate-600">After your free trial ends, you'll be downgraded to the Free plan automatically. No charge — we'll never bill you without your explicit consent after the trial.</p>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-semibold text-slate-900 text-sm mb-1">How does payment work when I subscribe?</h4>
            <p className="text-sm text-slate-600">Payments are handled securely via PayPal. You'll only be charged after your trial period ends. You can cancel anytime before the trial ends — no questions asked.</p>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <h4 className="font-semibold text-slate-900 text-sm mb-1">Can I cancel during the trial?</h4>
            <p className="text-sm text-slate-600">Yes! Cancel with one click anytime during your trial. You'll keep Pro access until the trial ends, then automatically switch to Free with no charge.</p>
          </div>
        </div>
      </div>

    </div>
  );
}


