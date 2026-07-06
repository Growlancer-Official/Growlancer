import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, Cpu, FileText, Handshake, Lock, Sparkles, TrendingUp,  } from 'lucide-react';

export function HowItWorksPage() {
  const [activeTab, setActiveTab] = useState<'client' | 'freelancer'>('client');

  const clientSteps = [
    {
      icon: FileText,
      title: '1. Specify Requirements',
      description: 'Define your project scope, budget limits, required skills, and deliverables in our easy wizard. No complex specs needed.',
      color: 'from-blue-500 to-blue-600'
    },
    {
      icon: Cpu,
      title: '2. Get AI Matches',
      description: 'Our matching algorithm analyzes verified freelancer capabilities, rates, availability and recommends the top 3 instant fits.',
      color: 'from-emerald-500 to-teal-650'
    },
    {
      icon: Lock,
      title: '3. Secure Escrow Pool',
      description: 'Fund the project milestone escrow. Payments remain locked securely until you audit and approve completed work.',
      color: 'from-amber-500 to-orange-600'
    },
    {
      icon: Handshake,
      title: '4. Synced Canvas Co-working',
      description: 'Use the shared Kanban board, focus-locked scratchpad, live code rooms, and instant messenger to align without switching apps.',
      color: 'from-indigo-500 to-indigo-650'
    }
  ];

  const freelancerSteps = [
    {
      icon: Briefcase,
      title: '1. Build Onboarding Profile',
      description: 'Fill in your skill tags, rate ranges, and link your verified GitHub or PenTool portfolios to feed our matching algorithm.',
      color: 'from-purple-500 to-purple-650'
    },
    {
      icon: Sparkles,
      title: '2. Receive Direct Invites',
      description: 'Skip typing long covers letters. Vetted matches place you directly onto client dashboards for immediate hire invites.',
      color: 'from-emerald-500 to-teal-650'
    },
    {
      icon: Lock,
      title: '3. Guaranteed Funding Lock',
      description: 'Never start work on spec. You are notified as soon as client capital is locked in the virtual escrow pool.',
      color: 'from-amber-500 to-orange-600'
    },
    {
      icon: Handshake,
      title: '4. Deliver & Instant Release',
      description: 'Complete milestones on the synced canvas. Payments are credited directly to your Wallet as soon as milestones approve.',
      color: 'from-indigo-500 to-indigo-650'
    }
  ];

  const steps = activeTab === 'client' ? clientSteps : freelancerSteps;

  return (
    <div className="min-h-screen bg-cream font-sans pb-24 text-slate-800">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src="/UpdatedLogo.png" alt="Growlancer" className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105" />
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
      <section className="relative py-20 overflow-hidden bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white border-b border-emerald-900/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl -ml-20 -mb-20"></div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-full border border-emerald-500/30 text-xs uppercase tracking-wider">
            <TrendingUp className="w-3.5 h-3.5" />
            How it works
          </span>
          <h1 className="font-display text-4xl sm:text-6xl font-black tracking-tight leading-none">
            A secure pathway to <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">getting work done</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto font-medium">
            From smart AI matchmaking to secure escrow payment locks, Growlancer guarantees a clear, transparent flow for both parties.
          </p>

          {/* Interactive Toggle */}
          <div className="inline-flex p-1.5 bg-slate-900/60 backdrop-blur border border-white/10 rounded-2xl max-w-xs mx-auto mt-8">
            <button
              onClick={() => setActiveTab('client')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'client'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              For Clients
            </button>
            <button
              onClick={() => setActiveTab('freelancer')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'freelancer'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              For Freelancers
            </button>
          </div>
        </div>
      </section>

      {/* Steps Visualizer */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, idx) => (
            <div 
              key={idx} 
              className="bg-white rounded-3xl p-6 border border-slate-200/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group hover:border-emerald-500/20"
            >
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${step.color} text-white flex items-center justify-center shadow-md mb-6 group-hover:scale-105 transition-transform`}>
                <step.icon className="w-6 h-6" />
              </div>
              <h3 className="font-display text-base font-extrabold text-slate-900 mb-2 leading-snug">{step.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Symmetrical Feature comparison */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
        <div className="bg-white rounded-[2.5rem] border border-slate-200/50 p-8 sm:p-12 shadow-sm space-y-8">
          <div className="text-center space-y-2">
            <h3 className="font-display text-2xl font-extrabold text-slate-900">Why Growlancer is superior</h3>
            <p className="text-xs text-slate-500">We replace outdated transaction mechanisms with live synchronization.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 space-y-2">
              <h4 className="font-bold text-slate-900 text-sm">Escrow Milestones</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">Payment is securely locked. Disputes are handled by structured, joint-release arbitration sliders.</p>
            </div>
            <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 space-y-2">
              <h4 className="font-bold text-slate-900 text-sm">Real-Time Sync Canvas</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">Shared boards and scratchpads stay live-synced in milliseconds. Skip email status threads entirely.</p>
            </div>
            <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 space-y-2">
              <h4 className="font-bold text-slate-900 text-sm">AI Matchmaking</h4>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">Bids spam is eliminated. Smart profiles automatically link requirements directly to verified talent.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
        <div className="bg-emerald-600 rounded-[2.5rem] p-8 sm:p-12 text-center text-white relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-2xl -mr-20 -mt-20"></div>
          
          <div className="relative space-y-6">
            <h2 className="font-display text-3xl font-black tracking-tight leading-tight">Ready to get started?</h2>
            <p className="text-emerald-100 text-xs max-w-md mx-auto leading-relaxed">
              Create a free account to join the state-of-the-art real-time collaboration canvas.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                to="/signup"
                state={{ role: 'client' }}
                className="inline-flex h-12 px-6 items-center justify-center font-bold bg-white text-emerald-600 rounded-xl hover:bg-emerald-50 transition-colors shadow-md text-sm shrink-0"
              >
                Hire Freelancers
              </Link>
              <Link
                to="/signup"
                state={{ role: 'freelancer' }}
                className="inline-flex h-12 px-6 items-center justify-center font-bold bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl transition-colors border border-emerald-500/20 text-sm shrink-0"
              >
                Apply as Freelancer
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
