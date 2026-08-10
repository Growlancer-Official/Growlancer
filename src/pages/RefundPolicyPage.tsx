import { Link } from 'react-router-dom';
import { ArrowRight, Clock, LifeBuoy, Lock, RefreshCcw, Scale, ShieldCheck, } from 'lucide-react';

export function RefundPolicyPage() {
  const scenarios = [
    {
      icon: Lock,
      title: 'Escrow Not Yet Funded',
      description:
        'If you cancel a project before funding the escrow, no money has moved. Nothing is charged, nothing needs to be refunded — the project is simply closed.',
    },
    {
      icon: ShieldCheck,
      title: 'Approved Milestone / Completed Work',
      description:
        'Once you approve a milestone or the final deliverable, escrow funds are released to the freelancer. Approved work is final and is not refundable, except in cases of verified fraud or clear violation of our Terms of Service.',
    },
    {
      icon: Clock,
      title: 'Project Canceled with Funded Escrow',
      description:
        'If the project is canceled after escrow is funded but before work begins, the full funded amount is returned to your Growlancer wallet (minus any platform fees already incurred), typically within 3–5 business days.',
    },
    {
      icon: Scale,
      title: 'Dispute Resolved in Your Favor',
      description:
        'If a dispute is raised and resolved in your favor, the disputed escrow portion is refunded to your wallet. Our dispute resolution team reviews the available evidence before releasing any funds.',
    },
    {
      icon: RefreshCcw,
      title: 'Duplicate or Erroneous Payment',
      description:
        'If you are charged twice for the same milestone or your payment was processed in error, we will refund the duplicate amount in full to your original payment method within 5–7 business days of confirmation.',
    },
    {
      icon: LifeBuoy,
      title: 'Subscription / Pro Plan',
      description:
        'Free trials are free — you are never charged during a trial. Paid Pro plans can be cancelled anytime; you keep Pro benefits until the end of the paid period. Refunds for paid periods are issued only if the service is unavailable due to a Growlancer fault.',
    },
  ];

  return (
    <div className="min-h-screen bg-cream font-sans pb-24 text-slate-800">
      {/* Symmetrical Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105" />
            <span className="font-display font-black text-xl tracking-tight text-slate-900">Growlancer</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-emerald-600 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </header>

      {/* Hero section */}
      <section className="relative py-20 overflow-hidden bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 text-white border-b border-emerald-900/30">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-3xl -mr-40 -mt-40"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl -ml-40 -mb-40"></div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-full border border-emerald-500/30 text-xs uppercase tracking-wider">
            <RefreshCcw className="w-3.5 h-3.5" />
            Growlancer Refund Policy
          </span>
          <h1 className="font-display text-4xl sm:text-6xl font-black tracking-tight leading-none">
            Fair, transparent <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">refunds</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto font-medium">
            Every payment on Growlancer is protected by escrow. This policy explains when funds are returned, how long it
            takes, and the steps you can take if you believe a refund is due.
          </p>
        </div>
      </section>

      {/* General Principles */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <div className="bg-white rounded-3xl p-8 border border-slate-200/50 shadow-sm space-y-4">
          <h2 className="font-display text-2xl font-black text-slate-900">General Principles</h2>
          <p className="text-sm text-slate-600 leading-relaxed font-medium">
            Because Growlancer uses an escrow system, client funds never go directly to a freelancer. Money is held
            securely and only released when work is approved or a dispute is resolved. This structure means most refund
            questions are answered by the escrow status of the project:
          </p>
          <ul className="space-y-3">
            {[
              'Funds held in escrow have not been paid to the freelancer and can be returned to the client.',
              'Funds released after approval are considered payment for completed work and are generally non-refundable.',
              'Refunds are processed to the original payment method or to the Growlancer wallet, depending on how the funds were paid and whether the escrow pool is still open.',
            ].map((point, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-600 font-medium">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Refund Scenarios */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-8">
        <h2 className="font-display text-2xl font-black text-slate-900 mb-8 text-center">When Refunds Apply</h2>
        <div className="space-y-4">
          {scenarios.map((s, i) => (
            <div key={i} className="bg-white rounded-3xl p-6 border border-slate-200/50 shadow-sm flex flex-col sm:flex-row items-start gap-6 hover:border-emerald-500/20 transition-colors group">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform`}>
                <s.icon className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-slate-900">{s.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Timing & Process */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 rounded-[2.5rem] p-8 sm:p-10 text-white relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl -mr-20 -mt-20"></div>

          <div className="relative space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-500/30">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">Processing Timeline & How to Request</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              Approved escrow refunds are typically processed within <strong className="text-white">3–5 business days</strong>.
              Refunds to a card or bank via Razorpay may take <strong className="text-white">5–7 business days</strong> depending on
              your bank. Wallet refunds are instant. During dispute review, funds remain frozen until a decision is made — no
              refund or release happens without a resolution.
            </p>

            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              To request a refund: open the project workspace, raise a <strong className="text-white">refund request</strong> on the
              escrow, or contact our resolution desk with the project details. We review every request with the available evidence —
              workspace logs, chat archives, milestone history and payment records — before any funds move.
            </p>

            <div className="pt-4 flex flex-wrap gap-4">
              <Link
                to="/escrow-policy"
                className="inline-flex h-11 px-5 items-center justify-center font-bold bg-white text-indigo-950 rounded-xl hover:bg-slate-50 transition-colors text-xs shadow-md"
              >
                Read Escrow Policy
              </Link>
              <Link
                to="/contact"
                className="inline-flex h-11 px-5 items-center justify-center font-bold bg-indigo-800 text-white border border-indigo-500/30 rounded-xl hover:bg-indigo-900 transition-colors text-xs"
              >
                Contact Resolution Desk
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
