import { Link } from 'react-router-dom';
import { ArrowRight, Globe, Heart, ShieldCheck, Sparkles, Target, TrendingUp, Users, Zap } from 'lucide-react';
import { useAboutPageMetrics } from '@/hooks/useAboutPageMetrics';

export function AboutPage() {
  const { stats, ready } = useAboutPageMetrics();

  const values = [
    {
      icon: Target,
      title: 'AI Precision Matching',
      desc: 'No more generic bidding pools. Our multi-variable semantic matching aligns the exact freelancer skills with the client project guidelines in seconds.',
      color: 'from-emerald-500/10 to-teal-500/10',
      iconColor: 'text-emerald-600 bg-emerald-100',
    },
    {
      icon: Heart,
      title: 'Escrow-First Trust',
      desc: 'Complete payment security. Funds are safely locked in virtual pools at contract launch and released programmatically only when deliverables are verified.',
      color: 'from-amber-500/10 to-orange-500/10',
      iconColor: 'text-amber-600 bg-amber-100',
    },
    {
      icon: Globe,
      title: 'Real-Time Co-Working',
      desc: 'Work borders are obsolete. Our system bridges team coordinates across distances, providing micro-second syncing of tasks, note scratchpads, and secure assets.',
      color: 'from-blue-500/10 to-indigo-500/10',
      iconColor: 'text-blue-600 bg-blue-100',
    },
    {
      icon: Users,
      title: 'Active Community',
      desc: 'Growlancer treats freelancers and clients as mutual stakeholders. Symmetrical platform fees and verified expert badges empower sustainable careers.',
      color: 'from-purple-500/10 to-pink-500/10',
      iconColor: 'text-purple-600 bg-purple-100',
    },
  ];

  return (
    <div className="min-h-screen bg-cream font-sans pb-24 text-slate-800">
      {/* Symmetrical Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/Growlancer Logo (2).png" alt="Growlancer" className="h-8 w-8 rounded-lg" />
            <span className="font-display font-black text-xl tracking-tight text-slate-900">Growlancer</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-emerald-600 transition-colors"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Hero section */}
      <section className="relative py-20 sm:py-28 overflow-hidden bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 text-white border-b border-emerald-900/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl -ml-20 -mb-20"></div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-full border border-emerald-500/30 text-xs uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            Our Mission
          </span>
          <h1 className="font-display text-4xl sm:text-6xl font-black tracking-tight leading-none">
            We are building the <br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">Future of Professional Work</span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto font-medium leading-relaxed">
            Growlancer eliminates the coordination gaps that plague legacy platforms. By combining intelligent semantic matching with integrated, real-time workspace canvases, we make remote collaboration direct, secure, and delightful.
          </p>
        </div>
      </section>

      {/* Stats Panel */}
      <section className="relative -mt-10 z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-[2.5rem] border border-slate-200/60 p-8 sm:p-10 shadow-xl">
          <div className="text-center space-y-2 mb-8">
            <h2 className="text-xs font-black uppercase text-emerald-600 tracking-widest flex items-center justify-center gap-1.5">
              <TrendingUp className="w-4 h-4" /> Live Platform Metrics
            </h2>
            <p className="text-slate-500 text-xs max-w-md mx-auto">
              Our registered member counter tracks live signups directly from Supabase. Escrow amounts and partner totals update in real time.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => (
              <div
                key={index}
                className={`bg-cream/45 rounded-3xl p-6 border border-slate-100 flex flex-col justify-between items-center text-center transition-all hover:scale-102 hover:shadow-md ${
                  !ready ? 'animate-pulse' : ''
                }`}
              >
                <div>
                  <span className="font-display text-3xl sm:text-4xl font-black text-slate-900 leading-none tracking-tight tabular-nums">
                    {stat.value}
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-bold mt-3 leading-snug max-w-[12rem]">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vision & Narrative */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-1 text-xs font-black uppercase text-emerald-600 tracking-wider">
              <Zap className="w-3.5 h-3.5" /> Bridging the Gaps
            </span>
            <h3 className="font-display text-3xl font-black text-slate-900 leading-tight">
              Why we started Growlancer
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Traditional freelancing platforms like Upwork and Fiverr have failed to adapt. They force clients and freelancers to coordinate across fragmented third-party tools—bumping from static chat screens to external Kanban boards, separate scratchpads, and disconnected asset storage lockers.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed">
              We built Growlancer to consolidate this flow. In our system, the contract dashboard <strong>is</strong> the collaborative workspace. When a service is purchased or a milestone funds, a gorgeous glassmorphic canvas instantly spins up with multi-second syncing, task controls, welcome templates, and structured escrow release locks.
            </p>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-600/10 rounded-[3rem] blur-3xl -rotate-6"></div>
            <div className="relative bg-white rounded-[3rem] p-8 border border-slate-200/50 shadow-lg space-y-4">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                <span className="w-3 h-3 rounded-full bg-green-400"></span>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/30 text-xs font-mono space-y-2 text-slate-600">
                <p className="text-emerald-600">// Real-Time Canvas Synced Init</p>
                <p>const workspace = await Growlancer.createWorkspace(contractId);</p>
                <p>await workspace.mountKanbanBoard();</p>
                <p>await workspace.mountScratchpad({`{`} focusLock: true {`}`});</p>
                <p className="text-amber-500">await workspace.escrow.verifyPayPalFunding();</p>
                <p className="text-slate-400">// Ready to co-work seamlessly!</p>
              </div>
              <div className="flex items-center gap-3 bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-emerald-800">
                  100% Escrow and Deliverable IP Protection Guaranteed.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Values Grid */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-28">
        <div className="text-center space-y-3 mb-16">
          <span className="text-xs font-black uppercase text-emerald-600 tracking-widest">Platform Core Values</span>
          <h2 className="font-display text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            How we coordinate success
          </h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            These values steer every line of code we write, every AI recommendation we generate, and every contract milestone we secure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {values.map((val, index) => {
            const Icon = val.icon;
            return (
              <div
                key={index}
                className="bg-white rounded-[2rem] p-8 border border-slate-200/50 shadow-sm flex flex-col sm:flex-row gap-6 transition-all duration-300 hover:shadow-md hover:border-emerald-500/20 group"
              >
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${val.iconColor} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-7 h-7" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-display font-extrabold text-lg text-slate-900 group-hover:text-emerald-700 transition-colors">
                    {val.title}
                  </h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    {val.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA Join Mission */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-28">
        <div className="bg-emerald-600 rounded-[3rem] p-8 sm:p-14 text-center text-white relative overflow-hidden shadow-xl shadow-emerald-950/20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-2xl -mr-16 -mt-16"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500/10 rounded-full blur-2xl -ml-16 -mb-16"></div>

          <div className="relative max-w-xl mx-auto space-y-6">
            <h2 className="font-display text-3xl sm:text-4xl font-black tracking-tight leading-none">
              Ready to experience modern co-working?
            </h2>
            <p className="text-emerald-100 text-sm leading-relaxed max-w-md mx-auto">
              Join thousands of clients and freelancers who have already bridged dashboard gaps and secured their contracts through active escrow.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/signup"
                className="w-full sm:w-auto inline-flex h-12 px-8 items-center justify-center font-bold bg-white text-emerald-600 rounded-xl hover:bg-emerald-50 transition-all active:scale-95 shadow-md shadow-emerald-950/20"
              >
                Sign Up Free
              </Link>
              <Link
                to="/internships"
                className="w-full sm:w-auto inline-flex h-12 px-6 items-center justify-center font-bold text-white border border-white/30 rounded-xl hover:bg-white/10 transition-all"
              >
                View Internships <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
