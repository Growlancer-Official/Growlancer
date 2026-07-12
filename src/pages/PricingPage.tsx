import { Link } from 'react-router-dom';
import { Check, ShieldCheck, Sparkles, Zap } from 'lucide-react';

export function PricingPage() {
  const plans = [
    {
      name: 'Basic',
      description: 'For individuals and small projects',
      price: '5%',
      priceLabel: 'Platform fee per transaction',
      features: [
        'Post up to 5 active projects',
        'AI-powered freelancer matching',
        'Escrow payment protection',
        'Standard support (24-48h)',
        'Basic analytics dashboard',
      ],
      cta: 'Get Started',
      popular: false,
    },
    {
      name: 'Pro',
      description: 'For growing businesses',
      price: '3%',
      priceLabel: 'Platform fee per transaction',
      features: [
        'Unlimited active projects',
        'Priority AI matching algorithm',
        'Escrow + Instant payouts',
        'Priority support (4-8h)',
        'Advanced analytics & reports',
        'Custom contract templates',
        'Team collaboration tools',
      ],
      cta: 'Start Pro Trial',
      popular: true,
    },
    {
      name: 'Enterprise',
      description: 'For large organizations',
      price: 'Custom',
      priceLabel: 'Tailored for your needs',
      features: [
        'Everything in Pro',
        'Dedicated account manager',
        'Custom integrations',
        'White-label options',
        'SLA guarantees',
        'Volume discounts',
        'On-premise deployment option',
      ],
      cta: 'Contact Sales',
      popular: false,
    },
  ];

  return (
    <div className="min-h-screen bg-cream">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-slate-900 mb-6">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            No hidden fees. No surprises. Pay only when you hire, with industry-leading escrow protection.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-14 sm:pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`rounded-3xl p-8 ${
                  plan.popular
                    ? 'bg-slate-900 text-white shadow-xl md:scale-105'
                    : 'bg-white border border-slate-200 shadow-sm'
                }`}
              >
                {plan.popular && (
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500 text-slate-900 px-3 py-1 rounded-full mb-4">
                    <Sparkles className="w-3 h-3" />
                    MOST POPULAR
                  </div>
                )}
                <h3 className="font-display text-2xl font-bold mb-2">{plan.name}</h3>
                <p className={`text-sm mb-6 ${plan.popular ? 'text-slate-400' : 'text-slate-600'}`}>
                  {plan.description}
                </p>
                <div className="mb-6">
                  <span className="font-display text-4xl font-bold">{plan.price}</span>
                  <p className={`text-sm mt-1 ${plan.popular ? 'text-slate-400' : 'text-slate-600'}`}>
                    {plan.priceLabel}
                  </p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-start gap-3">
                      <Check className={`w-5 h-5 flex-shrink-0 ${plan.popular ? 'text-emerald-400' : 'text-emerald-500'}`} />
                      <span className={`text-sm ${plan.popular ? 'text-slate-300' : 'text-slate-600'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/signup"
                  className={`block w-full py-3 rounded-xl font-bold text-center transition-colors ${
                    plan.popular
                      ? 'bg-emerald-500 text-slate-900 hover:bg-emerald-400'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="pb-16 sm:pb-20 pt-8 border-t border-slate-100">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
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
