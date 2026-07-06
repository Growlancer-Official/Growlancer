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
            <img src="/UpdatedLogo.png" alt="Growlancer" className="h-8 w-8 rounded-lg" />
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

      {/* Founder Section */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 sm:mt-28">
        {/* Section Label */}
        <div className="text-center space-y-3 mb-10 sm:mb-14">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-600 font-bold rounded-full border border-emerald-500/20 text-xs uppercase tracking-wider">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
            </svg>
            Leadership &amp; Vision
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Meet the Founder
          </h2>
          <p className="text-slate-500 text-sm max-w-lg mx-auto">
            The driving force behind Growlancer's mission to transform how the world works.
          </p>
        </div>

        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[1.25rem] sm:rounded-[2rem] p-[1.5px] shadow-xl shadow-slate-900/30">
          <div className="bg-[#0B1120] rounded-[calc(1.25rem-1.5px)] sm:rounded-[calc(2rem-1.5px)] p-5 sm:p-8 md:p-10 relative overflow-hidden">
            {/* Decorative background */}
            <div className="absolute top-0 right-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-gradient-to-br from-emerald-500/5 to-teal-500/5 rounded-full blur-3xl -mr-40 -mt-40"></div>
            <div className="absolute bottom-0 left-0 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] bg-gradient-to-tr from-emerald-600/5 to-teal-600/5 rounded-full blur-3xl -ml-32 -mb-32"></div>
            <div className="hidden sm:block absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMxMEI5ODEiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-40"></div>

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-10 items-center">
              {/* Founder Image — Left Side */}
              <div className="lg:col-span-2 flex justify-center lg:justify-end">
                <div className="relative group">
                  {/* Animated gradient ring */}
                  <div className="absolute -inset-1 bg-gradient-to-br from-emerald-400/60 via-teal-400/60 to-emerald-600/60 rounded-[2rem] opacity-60 group-hover:opacity-100 blur-sm transition-all duration-500" />
                  
                  {/* Image Container */}
                  <div className="relative w-48 h-60 sm:w-56 sm:h-72 md:w-64 md:h-80 rounded-[1.5rem] overflow-hidden border-2 border-emerald-500/30 shadow-xl shadow-emerald-900/30 bg-slate-900/50">
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/20 via-transparent to-transparent z-10" />
                    <img 
                      src="/Founder.png" 
                      alt="MOHAMMAD MIRAN KHAN — Founder & CEO of Growlancer"
                      className="w-full h-full object-contain scale-100 group-hover:scale-105 transition-transform duration-700 ease-out"
                      loading="lazy"
                    />
                  </div>

                  {/* Verified Badge */}
                  <div className="absolute -bottom-1.5 -right-1.5 bg-emerald-500 rounded-lg p-2 shadow-lg shadow-emerald-500/30 z-20 ring-2 ring-slate-900">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>

                  {/* Decorative corner accent */}
                  <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-2 border-l-2 border-emerald-400/30 rounded-tl-[1.5rem] z-20" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-2 border-r-2 border-emerald-400/30 rounded-br-[1.5rem] z-20" />
                </div>
              </div>

              {/* Founder Info — Right Side */}
              <div className="lg:col-span-3 space-y-5 text-center lg:text-left">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-2 px-2.5 py-0.5 bg-emerald-500/15 text-emerald-300 font-bold rounded-full border border-emerald-500/25 text-[10px] uppercase tracking-[0.15em]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Founder &amp; Chief Executive Officer
                  </span>
                  <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-[1.1] text-white">
                    MOHAMMAD MIRAN KHAN
                  </h2>
                  <p className="text-base sm:text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                    Founder &amp; CEO Of Growlancer
                  </p>
                </div>

                {/* Divider */}
                <div className="w-12 h-0.5 bg-gradient-to-r from-emerald-500/60 to-transparent mx-auto lg:mx-0" />

                {/* Bio */}
                <div className="space-y-3 max-w-xl">
                  <p className="text-slate-300 text-sm leading-relaxed">
                    A visionary entrepreneur with a deep passion for reshaping the future of professional work. 
                    Mohammad identified the critical gaps in traditional freelancing platforms — fragmented communication, 
                    payment insecurity, and disconnected workflows — and set out to build something better.
                  </p>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Under his leadership, Growlancer has emerged as a groundbreaking platform that combines 
                    <span className="text-slate-200 font-semibold"> AI-powered semantic matching</span>, 
                    <span className="text-slate-200 font-semibold"> real-time collaborative workspaces</span>, and 
                    <span className="text-slate-200 font-semibold"> escrow-backed payment protection</span> — 
                    delivering a unified experience where clients and freelancers can truly thrive together.
                  </p>
                </div>

                {/* Founder Quote */}
                <div className="relative pl-5 border-l-2 border-emerald-500/40 py-1 max-w-lg mx-auto lg:mx-0">
                  <svg className="absolute -top-2 -left-1.5 w-4 h-4 text-emerald-500/30" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151C7.563 6.068 6 8.789 6 11h4v10H0z" />
                  </svg>
                  <p className="text-xs text-slate-400 italic leading-relaxed">
                    "We're not just building a marketplace — we're engineering the infrastructure for the future of work. 
                    Every feature at Growlancer is designed with one question in mind: does this make collaboration 
                    simpler, safer, and more human?"
                  </p>
                </div>

                {/* Signature Area */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-emerald-500/20 shrink-0">
                      MM
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-white leading-tight">MOHAMMAD MIRAN KHAN</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">Founder &amp; CEO, Growlancer</p>
                    </div>
                  </div>
                  <div className="flex items-center sm:ml-auto">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-lg border border-white/10">
                      <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-[10px] font-semibold text-slate-300">Vision-Driven</span>
                    </div>
                  </div>
                </div>
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
