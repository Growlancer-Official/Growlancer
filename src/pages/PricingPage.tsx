import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Crown, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { TipNote } from '../components/TipNote';
import { subscriptionService, type AIPlan } from '../lib/subscriptionHelpers';

export function PricingPage() {
  const [plans, setPlans] = useState<AIPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchPlans = async () => {
      const result = await subscriptionService.getPlans('freelancer');
      if (mounted) {
        if (result.success && result.plans) setPlans(result.plans);
        setLoadingPlans(false);
      }
    };
    void fetchPlans();
    return () => {
      mounted = false;
    };
  }, []);

  const clientFeatures = [
    '5% flat platform fee on every successful payment — no hidden charges',
    'Your money sits in Growlancer Escrow until you approve the work',
    'AI-powered freelancer matching, tailored to your project',
    'Milestone-based payments — pay as the work progresses',
    'Free cancellation & full refund before work is delivered',
    'Fair dispute resolution with a neutral admin review',
  ];

  return (
    <div className="min-h-screen bg-cream">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105" />
            <span className="font-display font-black text-xl tracking-tight text-slate-900">Growlancer</span>
          </Link>
          <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
            Back to Home
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-10 sm:py-14">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12 text-center">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-slate-900 mb-6">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            One flat fee for clients. Free forever for freelancers, with an optional Pro
            upgrade for more opportunities.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto mt-8">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-left">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-1">
                For Clients
              </p>
              <p className="text-sm text-slate-700">
                <strong className="text-emerald-700">5% platform fee</strong> — one flat rate on
                every successful payment. The freelancer receives <strong>100%</strong> of the
                project amount.
              </p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-left">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                For Freelancers
              </p>
              <p className="text-sm text-slate-300">
                <strong className="text-white">₹0 to start</strong> — no commission, no fees on
                your earnings. Optional Pro subscription boosts visibility & AI tools.
              </p>
            </div>
          </div>

          <TipNote tone="protection" className="mt-8 max-w-3xl mx-auto text-left">
            <strong>How the platform fee works:</strong> the 5% fee is paid by the client and
            deducted <em>only</em> when a payment succeeds — never upfront. Your money is held in
            Growlancer Escrow until the work is delivered and approved, and it is auto-released to
            the freelancer only after that approval (or after the review window passes). Refunds on
            unapproved work are processed through our fair dispute process.
          </TipNote>
        </div>
      </section>

      {/* For Clients — Platform Fee */}
      <section className="pb-14 sm:pb-20">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12">
          <div className="text-center mb-8">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
              For Clients — One Flat Fee
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto text-sm sm:text-base">
              No tiers, no surprises. Every client pays the same simple rate, and your freelancer
              always gets the full project amount.
            </p>
          </div>

          <div className="max-w-md mx-auto">
            <div className="rounded-3xl p-8 bg-slate-900 text-white shadow-xl">
              <div className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500 text-slate-900 px-3 py-1 rounded-full mb-4">
                <ShieldCheck className="w-3 h-3" />
                ONE FLAT RATE FOR EVERYONE
              </div>
              <h3 className="font-display text-2xl font-bold mb-2">Platform Fee</h3>
              <p className="text-sm text-slate-400 mb-6">
                Paid by the client on successful payments only
              </p>
              <div className="mb-6">
                <span className="font-display text-5xl font-bold">5%</span>
                <p className="text-sm mt-1 text-slate-400">of the project amount, per payment</p>
              </div>
              <ul className="space-y-3 mb-8">
                {clientFeatures.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start gap-3">
                    <Check className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                    <span className="text-sm text-slate-300">{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                className="block w-full py-3 rounded-xl font-bold text-center transition-colors bg-emerald-500 text-slate-900 hover:bg-emerald-400"
              >
                Post a Project — It's Free
              </Link>
              <p className="text-[11px] text-slate-500 text-center mt-3">
                Posting a project and inviting freelancers costs ₹0. You only pay when you hire.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* For Freelancers — Pro Subscription */}
      <section className="pb-14 sm:pb-20">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-4">
              <Sparkles className="w-4 h-4" />
              FOR FREELANCERS
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
              Growlancer Pro — Optional Upgrade
            </h2>
            <p className="text-slate-600 max-w-xl mx-auto text-sm sm:text-base">
              Join free, earn 100% of every payment. Upgrade to Pro for more visibility, more AI
              power, and more projects — <strong>never a commission on your earnings</strong>.
            </p>
          </div>

          {loadingPlans ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <p>Pro plans are being prepared — check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {plans.map((plan) => {
                const isFree = plan.price === 0;
                const isPopular = plan.ai_priority && !isFree;
                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-3xl p-8 ${
                      isPopular
                        ? 'bg-slate-900 text-white shadow-xl md:scale-105'
                        : 'bg-white border border-slate-200 shadow-sm'
                    }`}
                  >
                    {isPopular && (
                      <div className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500 text-slate-900 px-3 py-1 rounded-full mb-4 w-fit">
                        <Crown className="w-3 h-3" />
                        MOST POPULAR
                      </div>
                    )}
                    {isFree && (
                      <div className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-600 px-3 py-1 rounded-full mb-4 w-fit">
                        <Zap className="w-3 h-3" />
                        START FREE
                      </div>
                    )}
                    <h3 className="font-display text-2xl font-bold mb-2">{plan.name}</h3>
                    <p className={`text-sm mb-6 ${isPopular ? 'text-slate-400' : 'text-slate-600'}`}>
                      {plan.description}
                    </p>
                    <div className="mb-6">
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-4xl font-bold">
                          ₹{plan.price.toLocaleString('en-IN')}
                        </span>
                        <span className={`text-sm font-bold ${isPopular ? 'text-slate-400' : 'text-slate-400'}`}>
                          /{plan.interval}
                        </span>
                      </div>
                      {plan.trial_days > 0 && (
                        <p className="text-sm text-emerald-600 font-medium mt-1">
                          {plan.trial_days}-day free trial
                        </p>
                      )}
                      {isFree && (
                        <p className="text-sm text-emerald-600 font-medium mt-1">
                          No card required
                        </p>
                      )}
                    </div>
                    <ul className="space-y-3 mb-8 flex-1">
                      <li className="flex items-start gap-3">
                        <Check className={`w-5 h-5 flex-shrink-0 ${isPopular ? 'text-emerald-400' : 'text-emerald-500'}`} />
                        <span className={`text-sm ${isPopular ? 'text-slate-300' : 'text-slate-600'}`}>
                          {plan.ai_messages_limit >= 1000
                            ? 'Unlimited AI messages'
                            : `${plan.ai_messages_limit} AI messages/month`}
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <Check className={`w-5 h-5 flex-shrink-0 ${isPopular ? 'text-emerald-400' : 'text-emerald-500'}`} />
                        <span className={`text-sm ${isPopular ? 'text-slate-300' : 'text-slate-600'}`}>
                          AI-powered project matching
                        </span>
                      </li>
                      <li className="flex items-start gap-3">
                        <Check className={`w-5 h-5 flex-shrink-0 ${isPopular ? 'text-emerald-400' : 'text-emerald-500'}`} />
                        <span className={`text-sm ${isPopular ? 'text-slate-300' : 'text-slate-600'}`}>
                          Personalized AI assistant
                        </span>
                      </li>
                      {plan.price > 0 ? (
                        <>
                          <li className="flex items-start gap-3">
                            <Check className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                            <span className="text-sm text-slate-300">Priority AI responses</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <Check className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                            <span className="text-sm text-slate-300">Advanced earnings analytics</span>
                          </li>
                          <li className="flex items-start gap-3">
                            <Check className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                            <span className="text-sm text-slate-300">Priority support 24/7</span>
                          </li>
                        </>
                      ) : (
                        <li className="flex items-start gap-3">
                          <span className={`text-sm ${isPopular ? 'text-slate-500' : 'text-slate-400'}`}>
                            Premium features with Pro
                          </span>
                        </li>
                      )}
                    </ul>
                    <Link
                      to="/dashboard/pro"
                      className={`block w-full py-3 rounded-xl font-bold text-center transition-colors ${
                        isPopular
                          ? 'bg-emerald-500 text-slate-900 hover:bg-emerald-400'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {isFree ? 'Start Free — No Card' : `Try ${plan.name} Free`}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-center mt-8">
            <Link
              to="/dashboard/pro"
              className="inline-flex items-center gap-2 text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              See full plan comparison & features
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ — removes the fee confusion */}
      <section className="pb-16 sm:pb-20 pt-8 border-t border-slate-100">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 2xl:px-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-10">
            Pricing Questions, Answered
          </h2>
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <h3 className="font-bold text-slate-900 mb-1">Who pays the platform fee?</h3>
              <p className="text-sm text-slate-600">
                The <strong>client</strong>. A flat 5% fee is charged on each successful payment.
                The freelancer receives <strong>100% of the project amount</strong> — commission is
                never deducted from freelancer earnings.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <h3 className="font-bold text-slate-900 mb-1">Do freelancers pay anything to use Growlancer?</h3>
              <p className="text-sm text-slate-600">
                No. Creating a profile, applying to projects, and receiving payments are completely
                free. The optional <strong>Pro subscription</strong> is a separate monthly/yearly
                plan that boosts visibility and adds AI tools — it is <strong>not</strong> a
                commission and never touches your earnings.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <h3 className="font-bold text-slate-900 mb-1">What does the 5% fee include?</h3>
              <p className="text-sm text-slate-600">
                Escrow protection, secure payments (Razorpay & PayPal), AI-powered matching,
                milestone management, dispute resolution, and customer support. The fee is only
                charged when a payment succeeds — posting, inviting, and browsing are free.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-slate-200">
              <h3 className="font-bold text-slate-900 mb-1">Is the Pro plan worth it for me?</h3>
              <p className="text-sm text-slate-600">
                Pro is optional and aimed at freelancers who want more visibility: priority
                placement in client searches, priority AI matching, unlimited AI assistance, and
                advanced analytics. Start with a free trial — if it doesn't bring more
                opportunities, cancel anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 2xl:px-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex items-center gap-4 bg-white rounded-2xl p-6 border border-slate-200">
              <ShieldCheck className="w-8 h-8 text-emerald-500" />
              <div>
                <p className="font-bold text-slate-900">100% Secure</p>
                <p className="text-sm text-slate-600">Escrow protected</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-white rounded-2xl p-6 border border-slate-200">
              <Zap className="w-8 h-8 text-orange-500" />
              <div>
                <p className="font-bold text-slate-900">Instant Match</p>
                <p className="text-sm text-slate-600">AI-powered in seconds</p>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-white rounded-2xl p-6 border border-slate-200">
              <Check className="w-8 h-8 text-blue-500" />
              <div>
                <p className="font-bold text-slate-900">No Hidden Fees</p>
                <p className="text-sm text-slate-600">Transparent pricing</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
