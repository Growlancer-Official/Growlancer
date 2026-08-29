import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, Clock, Lock, RefreshCcw, Scale,  } from 'lucide-react';
import { formatCurrency } from '../lib/currency';

export function EscrowPolicyPage() {
  const steps = [
    {
      icon: Lock,
      title: '1. Secure Funding Lock',
      description: 'The client funds the full contract amount (plus the 5% platform fee) into Growlancer Escrow. Freelancers receive instant alerts confirming that funds are secured before any work begins.',
      color: 'from-emerald-500 to-emerald-600'
    },
    {
      icon: Clock,
      title: '2. Synchronized Building',
      description: 'The freelancer works on the milestones using the live Synced Canvas. Progress is tracked via live task boards, making deliverables fully transparent.',
      color: 'from-indigo-500 to-indigo-600'
    },
    {
      icon: CheckCircle,
      title: '3. Verification & Release',
      description: 'Once deliverables are submitted, the client reviews them. Releasing the work moves escrow funds directly into the freelancer\'s wallet. A released payment is final — it is not refundable except in cases of verified fraud or a clear Terms violation. Work that has been delivered or approved but not yet released remains held in escrow and can still be disputed.',
      color: 'from-pink-500 to-pink-600'
    },
    {
      icon: RefreshCcw,
      title: '4. Revisions & Review Window',
      description: 'Services include a stated number of free revisions (shown on the service page). Clients may request extra revisions beyond the included amount, and freelancers may charge their published extra-revision rate or a mutually agreed price — always with the client\'s consent before extra work begins.',
      color: 'from-amber-500 to-orange-600'
    },
    {
      icon: Clock,
      title: '5. Delivery-Based Auto-Release',
      description: 'The auto-release timer starts only when the freelancer delivers the work — how many days the work took is up to you and the freelancer, never a deadline. After delivery you get a review window (default 72h, adjustable 24h–7 days). If you do not respond in time, the escrow releases to the freelancer automatically. A client can never hold a payment hostage, and a freelancer can never be paid before delivering.',
      color: 'from-violet-500 to-purple-600'
    },
  ];

  return (
    <div className="min-h-screen bg-cream font-sans pb-24 text-slate-800">
      {/* Symmetrical Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
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
      <section className="relative py-20 overflow-hidden bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 text-white border-b border-emerald-900/30">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-3xl -mr-40 -mt-40"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -ml-40 -mb-20"></div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 2xl:px-12 text-center space-y-3">
          <span className="inline-flex items-center gap-3 px-3.5 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-full border border-emerald-500/30 text-xs uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            Growlancer Escrow Protection
          </span>
          <h1 className="font-display text-4xl sm:text-6xl font-black tracking-tight leading-none">
            Designed to protect <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">every transaction</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto font-medium">
            Our escrow system is designed to help protect both clients and freelancers by holding funds until agreed milestones or completion conditions are met, and to help promote transparent and fair collaborations.
          </p>
        </div>
      </section>

      {/* Steps Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 mt-16 space-y-8">
        <h2 className="font-display text-2xl font-black text-slate-900 mb-8 text-center">The Escrow Lifecycle</h2>
        <div className="space-y-4">
          {steps.map((step, i) => (
            <div key={i} className="bg-white rounded-xl p-3 border border-slate-200/50 shadow-sm flex flex-col sm:flex-row items-start gap-3 hover:border-emerald-500/20 transition-colors group">
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${step.color} text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform`}>
                <step.icon className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-slate-900">{step.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Fees & Transparency — the full money picture */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 mt-16">
        <h2 className="font-display text-2xl font-black text-slate-900 mb-3 text-center">Fees & Transparency</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-3 border border-slate-200/50 shadow-sm">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-2">Growlancer commission: 5%</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Paid by the <strong>client</strong>, on top of the package price, only when a contract is
              successfully funded. The freelancer receives <strong>100% of the package price</strong>.
              There is no listing fee, no hidden charge, and no other platform fee.
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-200/50 shadow-sm">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-2">Payout processing: 2%</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              When a freelancer withdraws wallet funds, the payment processor (Razorpay/PayPal)
              charges a <strong>2% transfer fee</strong>. This is the processor's actual cost — it is
              <strong> not</strong> Growlancer profit and is shown separately from the 5% commission,
              before you confirm any withdrawal.
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-200/50 shadow-sm">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-2">Freelancer Premium: {formatCurrency(299)}/month</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Optional, no lock-in, cancel anytime. It unlocks only <strong>AI tools and analytics</strong> —
              building packages, getting work, and your ranking are identical with or without it.
              Everyone competes on merit; nobody pays for visibility.
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-200/50 shadow-sm">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-2">Client AI: free forever</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              AI freelancer matching and the AI assistant are <strong>free for clients for
              lifetime</strong>, protected only by a fair-use daily cap against bots. No paywall, no
              upsell — ever.
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-200/50 shadow-sm">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-2">Team Projects: independent contracts</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              In a Team Project, every freelancer's contract is <strong>independent</strong> — its own
              escrow, milestones and dispute. One member's dispute or cancellation never affects
              the rest of the team. The <strong>5% commission applies per contract</strong>, with no
              separate "team fee".
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-slate-200/50 shadow-sm">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-2">How we make money</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">
              Only the <strong>5% commission when work is successfully funded</strong>. No listing fee,
              no hidden charge, no forced subscription. Premium ({formatCurrency(299)}/month) is
              optional and only unlocks AI tools and analytics — never ranking or visibility.
            </p>
          </div>
        </div>
      </section>

      {/* Mediation Details */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 mt-16">
        <div className="bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-900 rounded-[2.5rem] p-4 sm:p-10 text-white relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl -mr-20 -mt-20"></div>
          
          <div className="relative space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-500/30">
                <Scale className="w-5 h-5" />
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">Human-Reviewed Dispute Resolution</h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              If coordination breaks down, either party can raise a dispute in the contract workspace. This action freezes file uploads and locks remaining escrow pools while our dispute resolution process runs.
            </p>
            
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              When a dispute is raised, the escrow is frozen and no money moves while our resolution team reviews the workspace evidence — files, chat history, and the full audit trail. Both parties can communicate in the dispute thread and attach evidence. A human specialist reviews the available evidence before any funds are released, and their decision is binding. AI-assisted analysis may support the review but never makes the final call.
            </p>
            
            <div className="pt-4 flex flex-wrap gap-3">
              <Link
                to="/help-center"
                className="inline-flex h-11 px-5 items-center justify-center font-bold bg-white text-emerald-950 rounded-xl hover:bg-slate-50 transition-colors text-xs shadow-md"
              >
                Read Mediation FAQs
              </Link>
              <Link
                to="/contact"
                className="inline-flex h-11 px-5 items-center justify-center font-bold bg-emerald-800 text-white border border-emerald-500/30 rounded-xl hover:bg-emerald-900 transition-colors text-xs"
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
