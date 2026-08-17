import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Check, CheckCircle, CreditCard, Crown, Loader2, Lock, MessageSquare, RefreshCw, ShieldCheck, Sparkles, TrendingUp, X, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { safeFormatDate } from '../utils/date';
import { formatCurrency } from '../lib/currency';
import { SubscriptionPayPalPayment } from '../components/SubscriptionPayPalPayment';
import { ProBadge } from '../components/ProBadge';
import { TipNote } from '../components/TipNote';
import { useToast } from '../components/Toast';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  isProSubscription,
  subscriptionService,
  type SubscriptionWithPlan,
  type AIPlan,
} from '../lib/subscriptionHelpers';

// Testimonials removed - Growlancer is currently in pre-launch phase
// Real user testimonials will be added after platform launch

export function ProSubscriptionPage() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [plans, setPlans] = useState<AIPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPayPal, setShowPayPal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // One free trial per user — fresh freelancers see ONLY "Start Free Trial";
  // after the trial is used, the same CTA becomes "Upgrade" (wallet/Razorpay).
  const [trialUsed, setTrialUsed] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [plansResult, subResult] = await Promise.all([
          subscriptionService.getPlans('freelancer'),
          subscriptionService.getCurrentSubscription(user.id),
        ]);

        if (plansResult.success && plansResult.plans) {
          setPlans(plansResult.plans);
          // Auto-detect billing interval from current subscription
          const currentPlan = plansResult.plans.find(
            (p) => p.id === subResult.subscription?.plan_id
          );
          if (currentPlan) {
            setBillingInterval(currentPlan.interval as 'month' | 'year');
          }
        }
        if (subResult.success) {
          setSubscription(subResult.subscription ?? null);
        }
        setTrialUsed(await subscriptionService.hasUsedFreeTrial(user.id));
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };

    void fetchData();

    const unsubscribe = subscriptionService.subscribeToChanges(user.id, () => {
      void fetchData();
    });

    return unsubscribe;
  }, [user]);

  const isPro = isProSubscription(subscription);

  const handleUpgrade = (planId: string, startTrial = false) => {
    setSelectedPlanId(planId);
    if (startTrial) {
      // Fresh freelancer — start the free trial directly (no payment needed)
      void (async () => {
        if (!user) return;
        setUpgrading(planId);
        try {
          const result = await subscriptionService.subscribeToPlan(user.id, planId);
          if (result.success) {
            toast.success('Trial started', 'Your free Pro trial is now active. Enjoy Pro features!');
            setSubscription(result.subscription ?? null);
            setTrialUsed(true);
          } else {
            toast.error('Failed', result.error || 'Failed to start free trial.');
          }
        } finally {
          setUpgrading(null);
        }
      })();
      return;
    }
    setShowPayPal(true);
  };

  const handleCancel = async () => {
    if (!subscription?.id || !user) return;
    setCancelling(true);

    const result = await subscriptionService.cancelSubscription(subscription.id, user.id);
    if (result.success) {
      toast.success('Subscription will be cancelled at the end of your billing period.');
      // Refresh
      const subResult = await subscriptionService.getCurrentSubscription(user.id);
      if (subResult.success) setSubscription(subResult.subscription ?? null);
    } else {
      toast.error(result.error || 'Failed to cancel subscription.');
    }

    setCancelling(false);
    setShowCancelConfirm(false);
  };

  const handleRenew = async () => {
    if (!subscription?.id || !user) return;
    setCancelling(true);

    const result = await subscriptionService.renewSubscription(subscription.id, user.id);
    if (result.success) {
      toast.success('Subscription renewed — auto-renewal re-enabled.');
      const subResult = await subscriptionService.getCurrentSubscription(user.id);
      if (subResult.success) setSubscription(subResult.subscription ?? null);
    } else {
      toast.error(result.error || 'Failed to renew subscription.');
    }

    setCancelling(false);
  };

  const refreshSubscription = async () => {
    if (!user) return;
    const result = await subscriptionService.getCurrentSubscription(user.id);
    if (result.success) setSubscription(result.subscription ?? null);
    setShowPayPal(false);
    setLoading(false);
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  // Separate plans by interval for the toggle
  const monthlyPlans = plans.filter((p) => p.interval === 'month');
  const yearlyPlans = plans.filter((p) => p.interval === 'year');
  const displayPlans = billingInterval === 'month' ? monthlyPlans : yearlyPlans;

  // Build comparison rows from plan features.
  // ⚠️ RANKING/MATCHING/VISIBILITY ARE NEVER TIERED — merit-based for everyone.
  const allFeatures = [
    { key: 'ai_writing', label: 'AI Writing', getValue: (p: AIPlan) => (p.ai_messages_limit >= 1000 ? 'Unlimited' : '5/day') },
    { key: 'ai_messages', label: 'AI Assistant', getValue: (p: AIPlan) => (p.ai_messages_limit >= 1000 ? 'Unlimited' : `${p.ai_messages_limit}/mo`) },
    { key: 'packages', label: '3-Tier Service Packages', getValue: () => '✓ Free for everyone' },
    { key: 'matching', label: 'AI Matching & Ranking', getValue: () => 'Merit-based — same for all' },
    { key: 'analytics', label: 'Analytics', getValue: (p: AIPlan) => (p.price > 0 ? 'Advanced' : 'Basic') },
    { key: 'support', label: 'Support', getValue: (p: AIPlan) => (p.price > 0 ? '24/7 Priority' : 'Email') },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Header */}
      <header className="backdrop-blur-xl bg-white/80 sticky top-0 z-50 border-b border-slate-200/60">
        <div className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-10 w-10 rounded-xl" />
            <span className="font-display text-xl font-bold tracking-tight">Growlancer</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <Link
              to="/dashboard"
              className="text-sm font-semibold text-slate-600 hover:text-emerald-600 transition-colors"
            >
              Back to Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="pt-16 pb-24 px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-6">
              <Sparkles className="w-4 h-4" />
              FREELANCER PREMIUM
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
              One Simple Plan. <span className="text-emerald-600">{formatCurrency(299)}/month.</span>
            </h1>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              Premium unlocks our <strong>AI writing tools, AI assistant, profile optimization and advanced analytics</strong>.
              It never affects your packages, visibility, ranking or matching — those are always merit-based and free for everyone.
            </p>

            {/* Subscription Status Banner */}
            {isPro && subscription && (
              <div className="mt-8 mx-auto max-w-md p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
                <CheckCircle className="text-emerald-600 text-2xl w-6 h-6 flex-shrink-0" />
                <div className="text-left">
                  <p className="text-emerald-900 font-bold text-sm flex items-center gap-2">
                    You are on{' '}
                    {subscription.subscription_plans?.name || 'Pro'} plan
                    <ProBadge size="xs" />
                  </p>
                  <p className="text-emerald-700 text-xs">
                    {subscription.cancel_at_period_end
                      ? 'Cancels at period end'
                      : `Next renewal: ${
                          subscription.subscription_end_date
                            ? new Date(subscription.subscription_end_date).toLocaleDateString()
                            : subscription.trial_end_date
                            ? `Trial ends ${safeFormatDate(subscription.trial_end_date) || '—'}`
                            : 'N/A'
                        }`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Single flat plan — no billing-interval toggle (one plan only) */}
          <div className="flex items-center justify-center mb-12">
            <span className="px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-900 text-white shadow-lg">
              Monthly · {formatCurrency(299)}
            </span>
            <span className="ml-3 text-xs text-slate-500 font-medium">
              One plan only — no tiers, no annual commitment
            </span>
          </div>

          {/* No lock-in note — one flat plan, cancel anytime */}
          <div className="max-w-5xl mx-auto px-4 mb-8">
            <TipNote tone="tip" title="No lock-in — cancel anytime" compact>
              Premium is <strong>{formatCurrency(299)}/month, flat</strong> — one simple plan, no tiers, no teams, no annual
              commitment. Pay with wallet balance or Razorpay (UPI, cards, net banking). Your Pro badge stays
              active the whole time and billing is managed right here in real time. Your packages, proposals and
              visibility stay exactly the same before and after — Premium is purely extra AI + productivity tools.
            </TipNote>
          </div>

          {/* Plan Cards — responsive: 1-2 plans stay centered & tidy, 3+ go full width */}
          <div
            className={`mx-auto grid grid-cols-1 gap-6 px-4 ${
              displayPlans.length <= 2
                ? 'max-w-3xl md:grid-cols-2'
                : 'max-w-5xl md:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {displayPlans.map((plan) => {
              const isCurrentPlan = subscription?.plan_id === plan.id;
              const isPopular = plan.ai_priority && billingInterval === 'month';
              const isFree = plan.price === 0;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-[32px] p-8 border-2 transition-all duration-300 bg-white ${
                    isPopular
                      ? 'border-emerald-500 shadow-[0_20px_50px_-12px_rgba(16,185,129,0.25)] md:scale-105 lg:scale-110'
                      : 'border-slate-200 hover:border-slate-300'
                  } ${isCurrentPlan ? 'ring-2 ring-emerald-400' : ''}`}
                >
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-1 rounded-full bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest shadow-xl">
                      Most Popular
                    </div>
                  )}

                  {isCurrentPlan && (
                    <div className="absolute top-4 right-4 z-20 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-widest">
                      Current Plan
                    </div>
                  )}

                  {/* Plan Icon */}
                  <div
                    className={`p-3 rounded-2xl w-fit mb-6 ${
                      isFree ? 'bg-slate-100' : 'bg-emerald-100'
                    }`}
                  >
                    {isFree ? (
                      <Zap className="w-6 h-6 text-slate-600" />
                    ) : (
                      <Crown className="w-6 h-6 text-emerald-600" />
                    )}
                  </div>

                  {/* Plan Name & Description */}
                  <h3 className="font-display text-xl font-bold mb-1">{plan.name}</h3>
                  <p className="text-sm text-slate-500 mb-6">{plan.description}</p>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-extrabold">
                        {formatCurrency(plan.price)}
                      </span>
                      <span className="text-slate-400 font-bold text-sm">
                        /{plan.interval}
                      </span>
                    </div>
                    {plan.trial_days > 0 && (
                      <p className="text-sm text-emerald-600 font-medium mt-1">
                        {plan.trial_days}-day free trial
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <div className="space-y-3 mb-8 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-slate-700">
                        {plan.ai_messages_limit >= 1000
                          ? 'Unlimited AI messages'
                          : `${plan.ai_messages_limit} AI messages/month`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-slate-700">
                        {plan.ai_messages_limit >= 1000
                          ? 'Unlimited AI writing (titles, descriptions, cover letters)'
                          : 'AI writing — 5 generations per day'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-slate-700">AI-powered project matching</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-slate-700">Personalized AI assistant</span>
                    </div>
                    {plan.price > 0 ? (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span className="text-slate-700">Priority AI responses</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span className="text-slate-700">Advanced analytics</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span className="text-slate-700">Priority support 24/7</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-sm">
                        <X className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="text-slate-400">Premium features</span>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  {isCurrentPlan ? (
                    <div className="space-y-2">
                      {subscription?.cancel_at_period_end ? (
                        <>
                          <button
                            onClick={() => void handleRenew()}
                            disabled={cancelling}
                            className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all text-sm disabled:opacity-50"
                          >
                            {cancelling ? 'Renewing...' : 'Renew Now'}
                          </button>
                          <p className="text-[11px] text-amber-600 text-center font-medium">
                            Your Pro ends at period end — renew to keep it active.
                          </p>
                        </>
                      ) : (
                        <button
                          onClick={() => setShowCancelConfirm(true)}
                          className="w-full py-3 rounded-2xl font-bold transition-all text-sm bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          Cancel Subscription
                        </button>
                      )}
                    </div>
                  ) : isFree ? (
                    <button
                      disabled
                      className="w-full py-3 rounded-2xl bg-slate-100 text-slate-400 font-bold cursor-not-allowed text-sm"
                    >
                      Current Plan
                    </button>
                  ) : plan.trial_days > 0 && !trialUsed ? (
                    <button
                      onClick={() => handleUpgrade(plan.id, true)}
                      disabled={upgrading === plan.id}
                      className={`w-full py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 text-sm ${
                        isPopular
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {upgrading === plan.id ? (
                        <>
                          <Loader2 className="animate-spin w-4 h-4" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Start Free Trial
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={upgrading === plan.id}
                      className={`w-full py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 text-sm ${
                        isPopular
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {upgrading === plan.id ? (
                        <>
                          <Loader2 className="animate-spin w-4 h-4" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Upgrade to {plan.name}
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  )}

                  {isCurrentPlan && !subscription?.cancel_at_period_end && (
                    <div className="mt-4 flex items-center justify-center gap-6">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <ShieldCheck className="text-emerald-500 w-4 h-4" />
                        Active
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Trust Badges */}
          <div className="max-w-md mx-auto mt-8 flex items-center justify-center gap-6">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <ShieldCheck className="text-emerald-500 w-4 h-4" />
              Secure Payment
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <RefreshCw className="text-emerald-500 w-4 h-4" />
              Cancel Anytime
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <CreditCard className="text-emerald-500 w-4 h-4" />
              UPI / Cards / NetBanking
            </div>
          </div>
        </section>

        {/* Why Upgrade Section */}
        <section className="bg-white py-24 border-y border-slate-100">
          <div className="max-w-[100rem] mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl font-extrabold mb-4">What Premium Unlocks</h2>
              <p className="text-slate-500">
                Fair and honest: Premium is purely AI + productivity tools. Your packages, proposals,
                visibility and matching score are <strong>identical</strong> with or without it — everything on this
                platform is merit-based.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 text-center">
                <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg mb-3">Unlimited AI Writing</h3>
                <p className="text-sm text-slate-500">
                  Unlimited AI-generated titles, descriptions and cover letters (free users get 5/day).
                </p>
              </div>
              <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 text-center">
                <div className="h-12 w-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-6">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg mb-3">AI Assistant & Support</h3>
                <p className="text-sm text-slate-500">
                  Priority AI assistant responses and 24/7 priority support — human help when you need it.
                </p>
              </div>
              <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 text-center">
                <div className="h-12 w-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-6">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg mb-3">Advanced Analytics</h3>
                <p className="text-sm text-slate-500">
                  Deeper performance insights for your profile, services and proposals.
                </p>
              </div>
              <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 text-center">
                <div className="h-12 w-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg mb-3">Verified Badge</h3>
                <p className="text-sm text-slate-500">
                  A visible Premium badge on your profile — a signal of commitment, never a ranking boost.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Plan Comparison Table */}
        <section className="py-24">
          <div className="max-w-5xl mx-auto px-4">
            <h2 className="font-display text-3xl font-extrabold text-center mb-16">
              Compare Plans
            </h2>
            <div className="bg-white rounded-3xl border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-widest text-slate-400">
                    <th className="p-6">Feature</th>
                    {displayPlans.map((plan) => (
                      <th
                        key={plan.id}
                        className={`p-6 ${
                          plan.ai_priority ? 'text-emerald-600' : ''
                        }`}
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allFeatures.map((feature) => (
                    <tr key={feature.key} className="text-sm">
                      <td className="p-6 font-medium text-slate-700">
                        {feature.label}
                      </td>
                      {displayPlans.map((plan) => {
                        const value = feature.getValue(plan);
                        const isHighlighted =
                          plan.ai_priority &&
                          (feature.key === 'ai_priority' || feature.key === 'matching');
                        return (
                          <td
                            key={plan.id}
                            className={`p-6 ${
                              isHighlighted ? 'font-bold text-emerald-600' : ''
                            } ${
                              value === '—' ? 'text-slate-400' : ''
                            }`}
                          >
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Testimonials Section */}
        <section className="py-24 bg-slate-50">
          <div className="max-w-[100rem] mx-auto px-4">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 font-semibold rounded-full text-sm mb-6">
                <Sparkles className="w-4 h-4" />
                Pre-Launch Phase
              </div>
              <h2 className="font-display text-3xl font-extrabold mb-4">
                Be Among the First
              </h2>
              <p className="text-slate-500 max-w-2xl mx-auto">
                Growlancer is currently in pre-launch. We're building the AI-powered freelancing platform of the future. 
                User testimonials and success stories will be featured here after our official launch.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-24 bg-slate-50">
          <div className="max-w-[100rem] mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900">Common Questions</h2>
              <p className="text-slate-500 mt-3 max-w-2xl mx-auto">
                Everything you need to know about Growlancer Premium — honest answers, no fine print.
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
              <div className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="text-emerald-600 mb-2">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-sm uppercase tracking-widest text-slate-900 mb-2">
                      Secure Payment
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      All subscription payments are processed securely via Razorpay — UPI, cards and net banking.
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="text-emerald-600 mb-2">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-sm uppercase tracking-widest text-slate-900 mb-2">
                      No Hidden Fees
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      What you see is what you pay — {formatCurrency(299)}/month, flat. No tiers, no setup fees, no surprises.
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="text-emerald-600 mb-2">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-sm uppercase tracking-widest text-slate-900 mb-2">
                      Cancel Anytime
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      No lock-in, no long-term contract. Cancel whenever you want — your access stays until the period ends.
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="text-emerald-600 mb-2">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-sm uppercase tracking-widest text-slate-900 mb-2">
                      Always Merit-Based
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Premium never boosts your ranking, visibility or matching — those stay merit-based and free for everyone.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <h4 className="font-bold mb-3 text-lg text-slate-900">What do I get in Premium?</h4>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Premium unlocks our <strong>AI writing tools, AI assistant, profile optimization and advanced analytics</strong>.
                    It is purely extra AI + productivity tools — it never affects your packages, proposals,
                    visibility or matching score. Everything on the platform stays merit-based for everyone.
                  </p>
                </div>
                <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <h4 className="font-bold mb-3 text-lg text-slate-900">Can I cancel anytime?</h4>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Yes — cancel from the Premium page with one click, any time. No contracts, no commitments.
                    You keep access until the end of your billing period, and you can renew again whenever you like.
                  </p>
                </div>
                <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <h4 className="font-bold mb-3 text-lg text-slate-900">Does Premium boost my ranking or visibility?</h4>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    <strong>No — never.</strong> Ranking, matching and visibility are always merit-based and identical for
                    free and Premium freelancers alike. Premium only unlocks AI and analytics tools; it is never a
                    pay-to-win boost.
                  </p>
                </div>
                <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <h4 className="font-bold mb-3 text-lg text-slate-900">What's the difference between Free and Premium?</h4>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    Free gives you the full marketplace: 3-tier packages, unlimited proposals (fair-use), escrow,
                    messaging and reviews. Premium ({formatCurrency(299)}/month) adds unlimited AI writing, a personalized
                    AI assistant, profile optimization and advanced analytics. Same access to work either way.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-slate-100">
        <div className="max-w-[100rem] mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-8 w-8 rounded-lg" />
            <span className="font-display font-bold text-slate-900">Growlancer</span>
          </div>
          <p className="text-slate-400 text-sm">
            &copy; {new Date().getFullYear()} Growlancer AI. Empowering India's freelance workforce.
          </p>
        </div>
      </footer>

      {/* Cancel Confirmation Modal */}
      <ConfirmModal
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleCancel}
        title="Cancel Subscription"
        message="Are you sure you want to cancel your subscription? You will lose access to Pro features at the end of your billing period."
        confirmLabel={cancelling ? 'Cancelling...' : 'Cancel Subscription'}
        variant="warning"
        loading={cancelling}
      />

      {/* PayPal Modal */}
      {showPayPal && selectedPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg my-auto">
            <button
              type="button"
              onClick={() => setShowPayPal(false)}
              className="absolute top-3 right-3 z-20 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <SubscriptionPayPalPayment
              planId={selectedPlan.id}
              planName={selectedPlan.name}
              planPrice={selectedPlan.price}
              role="freelancer"
              onSuccess={() => void refreshSubscription()}
              onCancel={() => setShowPayPal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}