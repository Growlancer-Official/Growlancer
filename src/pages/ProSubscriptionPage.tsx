import { useState, useEffect } from 'react';
import {
  ArrowRight,
  CheckCircle,
  ChevronDown,
  CreditCard,
  Crown,
  Gem,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { safeFormatDate } from '../utils/date';
import { formatCurrency } from '../lib/currency';
import { SubscriptionPayPalPayment } from '../components/SubscriptionPayPalPayment';
import { ProBadge } from '../components/ProBadge';
import { useToast } from '../components/Toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageSkeleton } from '../components/PageSkeleton';
import { InfoTip } from '../components/InfoTip';
import {
  isProSubscription,
  subscriptionService,
  type SubscriptionWithPlan,
  type AIPlan,
} from '../lib/subscriptionHelpers';

const FAQ_ITEMS = [
  {
    q: 'What do the paid tiers include?',
    a: 'Pro (₹299/month) removes the monthly cap on AI assistant messages, raises AI writing to 100 generations per day (free users get 5 per day) and adds a Pro badge. Premium (₹499/month) includes all of Pro plus advanced analytics. Both are purely extra AI and analytics tools — your packages, proposals, visibility and matching score stay exactly the same.',
  },
  {
    q: 'What is the difference between Pro and Premium?',
    a: 'Advanced analytics. Pro keeps the analytics every freelancer already gets and raises AI capacity; Premium adds earnings and profile-view trends against the previous period, the complete proposal funnel with average and accepted bid values, your star-rating split and your top paying categories. Ranking and matching are identical on every tier.',
  },
  {
    q: 'Can I start on Pro and move to Premium later?',
    a: 'Yes — that is the intended path. Upgrade from this page whenever you want; your Pro time is not lost and you keep every feature you already had.',
  },
  {
    q: 'Does Premium boost my ranking or visibility?',
    a: 'No — never. Ranking, matching and visibility are 100% merit-based and identical for free and Premium freelancers. Premium only adds AI and analytics tools; it is never a pay-to-win boost.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes — cancel from this page with one click. No contracts, no lock-in. You keep Premium access until the end of your current billing period, and you can renew whenever you like.',
  },
  {
    q: 'How does the free trial work?',
    a: 'New freelancers get one free trial of Pro — no payment needed to start. After the trial ends (or if you have already used it), upgrading to Pro or Premium is handled securely via Razorpay.',
  },
  {
    q: 'Are there any hidden fees?',
    a: 'No. Premium is a flat monthly price — what you see is what you pay. The 5% platform commission on contracts and the payout processing fee are separate, transparent costs that apply to everyone equally.',
  },
];

// Every card here must describe something the product actually does. Anything that
// is free for everyone (analytics, matching, packages) must NOT appear as an unlock.
const UNLOCKS = [
  {
    icon: Gem,
    title: 'Advanced Analytics (Premium)',
    text: 'Earnings and profile-view trends against the previous period, the full proposal funnel, your rating split and your top paying categories — updated live. The simple dashboard stays free for every freelancer.',
  },
  {
    icon: MessageSquare,
    title: 'Unlimited AI Assistant',
    text: 'No monthly cap on AI assistant messages. Standard fair-use rate limits still protect the service for everyone.',
  },
  {
    icon: Sparkles,
    title: 'AI Writing — 100 generations/day',
    text: 'AI-generated titles, descriptions and cover letters, raised to 100 generations per day. Free users get 5 per day.',
  },
  {
    icon: CheckCircle,
    title: 'Premium Badge',
    text: 'A visible Premium badge on your profile. A signal of support — never a ranking boost.',
  },
  {
    icon: RefreshCw,
    title: 'One free trial',
    text: 'Every new freelancer gets one free trial of Pro — no payment needed to start. Premium can be chosen straight away.',
  },
];

export function ProSubscriptionPage() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionWithPlan | null>(null);
  const [plans, setPlans] = useState<AIPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPayPal, setShowPayPal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
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

  // Two paid tiers, in ladder order: Pro (premium_monthly) then Premium
  // (premium_advanced_monthly, Pro + advanced analytics). Explicit ID checks +
  // is_active guards so stray seed rows never leak into the UI.
  const TIER_IDS = ['premium_monthly', 'premium_advanced_monthly'] as const;
  const tierPlans = TIER_IDS.map((id) => plans.find((p) => p.id === id && p.price > 0 && p.is_active)).filter(
    (p): p is AIPlan => Boolean(p),
  );
  // Defensive fallback: if neither canonical row exists (unreachable backend,
  // fresh environment) show the single active paid plan rather than nothing.
  const displayPlans = tierPlans.length > 0 ? tierPlans : plans.filter((p) => p.price > 0 && p.is_active).slice(0, 1);
  const proPlan = tierPlans[0] ?? displayPlans[0];
  const premiumPlan = tierPlans[1] ?? null;
  // For comparison table: Free vs Pro vs Premium
  const freePlan = plans.find((p) => p.price === 0);
  const isPremiumTier = (plan?: AIPlan | null) => plan?.id === 'premium_advanced_monthly';

  // Build comparison rows from plan features.
  // RANKING/MATCHING/VISIBILITY ARE NEVER TIERED — merit-based for everyone.
  // Writing has its own cap (ai-writer PRO_DAILY_LIMIT = 100/day vs FREE 5/day) —
  // it must never be inferred from ai_messages_limit, and the assistant cap is a
  // message quota, not a writing quota. Analytics is NOT tiered: the dashboard is
  // free for every freelancer, so it can never appear as a Premium unlock.
  const allFeatures = [
    { key: 'ai_writing', label: 'AI Writing', getValue: (p: AIPlan) => (p.price > 0 ? '100/day' : '5/day') },
    { key: 'ai_messages', label: 'AI Assistant', getValue: (p: AIPlan) => (p.ai_messages_limit >= 1000 ? 'Unlimited' : `${p.ai_messages_limit}/mo`) },
    { key: 'packages', label: '3-Tier Service Packages', getValue: () => 'Included — free for everyone' },
    { key: 'matching', label: 'AI Matching & Ranking', getValue: () => 'Merit-based — same for all' },
    { key: 'analytics', label: 'Analytics', getValue: () => 'Included — free for everyone' },
    { key: 'advanced_analytics', label: 'Advanced Analytics', getValue: (p: AIPlan) => (isPremiumTier(p) ? 'Trends, funnel & categories' : 'Not included') },
    { key: 'badge', label: 'Profile Badge', getValue: (p: AIPlan) => (p.price > 0 ? 'Pro badge' : '—') },
    { key: 'support', label: 'Support', getValue: () => 'In-app AI support & email' },
  ];

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
          <Crown className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
            Premium
            <InfoTip title="Growlanzo paid tiers" text="There are two paid tiers, one above the other. Pro (₹299/month) removes the monthly cap on AI assistant messages, raises AI writing to 100 generations per day and adds a Pro badge. Premium (₹499/month) includes everything in Pro plus advanced analytics: earnings and view trends, the full proposal funnel, your rating split and your top paying categories. Neither tier affects your packages, visibility, ranking or matching — those stay merit-based and free for everyone." />
          </h1>
          <p className="text-slate-500 mt-0.5 text-sm">Free to start — Pro and Premium add AI tools and analytics on top</p>
        </div>
      </div>

      {/* Subscription Status Banner */}
      {isPro && subscription && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start sm:items-center gap-3">
          <CheckCircle className="text-emerald-600 w-6 h-6 flex-shrink-0 mt-0.5 sm:mt-0" />
          <div className="min-w-0">
            <p className="text-emerald-900 font-bold text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>You are on {subscription.subscription_plans?.name || 'Pro'} plan</span>
              <ProBadge size="xs" />
            </p>
            <p className="text-emerald-700 text-xs mt-0.5">
              {subscription.cancel_at_period_end
                ? 'Cancels at period end — renew below to keep Premium active.'
                : `Next renewal: ${
                    subscription.subscription_end_date
                      ? (safeFormatDate(subscription.subscription_end_date) || '—')
                      : subscription.trial_end_date
                      ? `Trial ends ${safeFormatDate(subscription.trial_end_date) || '—'}`
                      : 'N/A'
                  }`}
            </p>
          </div>
        </div>
      )}

      {/* Plan + Benefits: 2-col dashboard layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Plan Card */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          {displayPlans.map((plan) => {
            const isCurrentPlan = subscription?.plan_id === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-6 border bg-white transition-all ${
                  isCurrentPlan ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'
                }`}
              >
                {isCurrentPlan && (
                  <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold uppercase tracking-wider">
                    Current Plan
                  </div>
                )}

                <div className={`p-2.5 rounded-xl w-fit mb-4 ${isPremiumTier(plan) ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                  <Crown className={`w-5 h-5 ${isPremiumTier(plan) ? 'text-amber-600' : 'text-emerald-600'}`} />
                </div>

                <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                  {plan.name}
                  {isPremiumTier(plan) && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      Advanced analytics
                    </span>
                  )}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">{plan.description}</p>

                <div className="flex items-baseline gap-1 mt-4">
                  <span className="font-display text-4xl font-extrabold text-slate-900">
                    {formatCurrency(plan.price)}
                  </span>
                  <span className="text-slate-400 font-semibold text-sm">/month</span>
                </div>
                {plan.trial_days > 0 && !isCurrentPlan && (
                  <p className="text-xs text-emerald-600 font-semibold mt-1.5">
                    {plan.trial_days}-day free trial for new freelancers
                  </p>
                )}

                {/* Action Button */}
                <div className="mt-6">
                  {isCurrentPlan ? (
                    subscription?.cancel_at_period_end ? (
                      <div className="space-y-2">
                        <button
                          onClick={() => void handleRenew()}
                          disabled={cancelling}
                          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all text-sm disabled:opacity-50"
                        >
                          {cancelling ? 'Renewing...' : 'Renew Now'}
                        </button>
                        <p className="text-xs text-amber-600 text-center font-medium">
                          Your {plan.name} plan ends at period end — renew to keep it active.
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="w-full py-2.5 rounded-xl font-bold transition-all text-sm bg-slate-100 text-slate-700 hover:bg-slate-200"
                      >
                        Cancel Subscription
                      </button>
                    )
                  ) : plan.trial_days > 0 && !trialUsed ? (
                    <button
                      onClick={() => handleUpgrade(plan.id, true)}
                      disabled={upgrading === plan.id}
                      className="w-full py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
                      className="w-full py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
                </div>

                {/* Trust Badges */}
                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    <ShieldCheck className="text-emerald-500 w-3.5 h-3.5" />
                    Secure Payment
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    <RefreshCw className="text-emerald-500 w-3.5 h-3.5" />
                    Cancel Anytime
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    <CreditCard className="text-emerald-500 w-3.5 h-3.5" />
                    UPI / Cards
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* What Premium Unlocks */}
        <div className="lg:col-span-3">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-1">What the paid tiers unlock</h2>
          <p className="text-sm text-slate-500 mb-4">
            Honest and fair: paid tiers are purely AI + analytics tools. Your packages, proposals,
            visibility and matching score are <strong>identical</strong> with or without them — everything
            on this platform is merit-based.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {UNLOCKS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="p-4 rounded-xl bg-white border border-slate-200">
                <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 mb-1">{title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plan Comparison Table */}
      <section>
        <h2 className="font-display text-lg font-bold text-slate-900 mb-3">Compare Free, Pro and Premium</h2>
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
          <table className="w-full min-w-[420px] border-collapse text-left">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-100 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
                <th className="px-2.5 sm:px-4 py-3">Feature</th>
                <th className="px-2.5 sm:px-4 py-3">Free</th>
                <th className="px-2.5 sm:px-4 py-3 text-emerald-600">Pro</th>
                <th className="px-2.5 sm:px-4 py-3 text-amber-600">Premium</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allFeatures.map((feature) => (
                <tr key={feature.key} className="text-xs sm:text-sm">
                  <td className="px-2.5 sm:px-4 py-3 font-medium text-slate-700">{feature.label}</td>
                  <td className="px-2.5 sm:px-4 py-3 text-slate-500">
                    {freePlan ? feature.getValue(freePlan) : '—'}
                  </td>
                  <td className="px-2.5 sm:px-4 py-3 font-semibold text-emerald-700">
                    {proPlan ? feature.getValue(proPlan) : '—'}
                  </td>
                  <td className="px-2.5 sm:px-4 py-3 font-semibold text-amber-700">
                    {premiumPlan ? feature.getValue(premiumPlan) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-400 sm:hidden">
          Swipe the table sideways to see the Pro and Premium columns.
        </p>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="font-display text-lg font-bold text-slate-900 mb-1">Common questions</h2>
        <p className="text-sm text-slate-500 mb-4">
          Everything you need to know about Growlanzo Premium — honest answers, no fine print.
        </p>
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="font-semibold text-sm text-slate-900">{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="px-4 pb-4 text-sm text-slate-600 leading-relaxed">{item.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

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
