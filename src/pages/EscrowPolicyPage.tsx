import { Link } from 'react-router-dom';
import { ArrowRight, Building, CheckCircle, Clock, Contact, Home, Lock, Scale, Wallet,  } from 'lucide-react';

export function EscrowPolicyPage() {
  const steps = [
    {
      icon: Lock,
      title: '1. Secure Funding Lock',
      description: 'The client deposits the milestone amount into the virtual escrow pool. Freelancers receive instant dashboard alerts confirming that funds are secured before any building begins.',
      color: 'from-emerald-500 to-emerald-650'
    },
    {
      icon: Clock,
      title: '2. Synchronized Building',
      description: 'The freelancer works on the milestones using the live Synced Canvas. Progress is tracked via live task boards, making deliverables fully transparent.',
      color: 'from-indigo-500 to-indigo-650'
    },
    {
      icon: CheckCircle,
      title: '3. Verification & Release',
      description: 'Once deliverables are submitted, the client reviews them. Approving the milestone releases escrow funds directly into the freelancer\'s Wallet balance.',
      color: 'from-pink-500 to-pink-650'
    },
  ];

  return (
    <div className="min-h-screen bg-cream font-sans pb-24 text-slate-800">
      {/* Symmetrical Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src="/Growlancer Logo (2).png" alt="Growlancer" className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105" />
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
            <Lock className="w-3.5 h-3.5" />
            Growlancer Escrow Protection
          </span>
          <h1 className="font-display text-4xl sm:text-6xl font-black tracking-tight leading-none">
            Guaranteed safety for <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">every transaction</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto font-medium">
            No unbacked work for freelancers, and no undelivered code for clients. Our dual-lock virtual escrow guarantees fair partnerships.
          </p>
        </div>
      </section>

      {/* Steps Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 space-y-8">
        <h2 className="font-display text-2xl font-black text-slate-900 mb-8 text-center">The Escrow Lifecycle</h2>
        <div className="space-y-4">
          {steps.map((step, i) => (
            <div key={i} className="bg-white rounded-3xl p-6 border border-slate-200/50 shadow-sm flex flex-col sm:flex-row items-start gap-6 hover:border-emerald-500/20 transition-colors group">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} text-white flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform`}>
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

      {/* Mediation Details */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 rounded-[2.5rem] p-8 sm:p-10 text-white relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl -mr-20 -mt-20"></div>
          
          <div className="relative space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-500/30">
                <Scale className="w-5 h-5" />
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">AI-Mediated Dispute Arbitration</h3>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              If coordination breaks down, either party can raise a dispute in the contract workspace. This action freezes file uploads, locks remaining escrow pools, and triggers our **AI dispute resolution engine**.
            </p>
            
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              The AI Mediator evaluates workspace logs, chat archives, and task cards, proposing a fair split ratio (e.g. 70% payout / 30% refund) as a starting point. A human dispute resolution specialist reviews the AI's recommendation and confirms or adjusts it before any funds are released. Once confirmed and accepted by both parties, funds are released.
            </p>
            
            <div className="pt-4 flex flex-wrap gap-4">
              <Link
                to="/help-center"
                className="inline-flex h-11 px-5 items-center justify-center font-bold bg-white text-indigo-950 rounded-xl hover:bg-slate-50 transition-colors text-xs shadow-md"
              >
                Read Mediation FAQs
              </Link>
              <Link
                to="/contact"
                className="inline-flex h-11 px-5 items-center justify-center font-bold bg-indigo-850 text-white border border-indigo-500/30 rounded-xl hover:bg-indigo-900 transition-colors text-xs"
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
