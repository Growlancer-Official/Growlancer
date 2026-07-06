import { Link } from 'react-router-dom';
import { ArrowRight, History, Lock, ShieldCheck, UserCheck,  } from 'lucide-react';

export function SafetyPage() {
  const safetyFeatures = [
    {
      icon: ShieldCheck,
      title: 'Virtual Escrow Locks',
      description: 'Your project funds are secured in our protected escrow pool before the freelancer begins work. Payments are only released programmatically once deliverables are approved or via AI mediation splits.',
      color: 'from-emerald-500 to-emerald-600',
      badge: 'Payments'
    },
    {
      icon: Lock,
      title: 'Asset Locker Freeze',
      description: 'Shared design files, code bundle deposits, and documents are securely versioned in our Asset Locker. In the event of a coordination dispute, files are automatically locked to prevent tampering.',
      color: 'from-indigo-500 to-indigo-650',
      badge: 'Assets'
    },
    {
      icon: UserCheck,
      title: 'Talent Verification API',
      description: 'We authenticate freelancer credentials directly via GitHub or PenTool API scopes. This guarantees that all links to portfolios represent actual, verified work, eliminating qualification noise.',
      color: 'from-pink-500 to-pink-650',
      badge: 'Identity'
    },
    {
      icon: History,
      title: 'Real-Time Audit Trails',
      description: 'Every status change on tasks, chat histories, milestone funding, and code rooms is logged and timestamped. This gives our mediation team comprehensive audits to resolve issues fairly.',
      color: 'from-amber-500 to-orange-600',
      badge: 'Auditing'
    },
  ];

  return (
    <div className="min-h-screen bg-cream font-sans pb-24 text-slate-800">
      {/* Symmetrical Header */}
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
      <section className="relative py-20 overflow-hidden bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 text-white border-b border-emerald-900/30">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-3xl -mr-40 -mt-40"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl -ml-40 -mb-40"></div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-full border border-emerald-500/30 text-xs uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            Security & Trust
          </span>
          <h1 className="font-display text-4xl sm:text-6xl font-black tracking-tight leading-none">
            A secure foundation for <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">remote commerce</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto font-medium">
            We built multiple security systems directly into active workspaces to prevent payment issues, work loss, and communication breakdowns.
          </p>
        </div>
      </section>

      {/* Safety Grid */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {safetyFeatures.map((feature, index) => (
            <div 
              key={index} 
              className="bg-white rounded-3xl p-8 border border-slate-200/50 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group hover:border-emerald-500/20"
            >
              <div className="flex justify-between items-start mb-6">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}>
                  <feature.icon className="w-7 h-7" />
                </div>
                <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 font-bold rounded-full text-[10px] uppercase tracking-wider">
                  {feature.badge}
                </span>
              </div>
              <h3 className="font-display text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed font-medium">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Proactive Help Promo */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
        <div className="bg-emerald-600 rounded-[2.5rem] p-8 sm:p-12 text-center text-white relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-2xl -mr-20 -mt-20"></div>
          
          <div className="relative space-y-6">
            <h2 className="font-display text-3xl font-black tracking-tight leading-tight">Collaborate with Complete Assurance</h2>
            <p className="text-emerald-100 text-xs max-w-md mx-auto leading-relaxed">
              Have any questions or need to raise an issue? Browse our Help Center or chat with our AI assistant instantly.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                to="/help-center"
                className="inline-flex h-12 px-6 items-center justify-center font-bold bg-white text-emerald-600 rounded-xl hover:bg-emerald-50 transition-colors shadow-md text-sm shrink-0"
              >
                Browse Help Center
              </Link>
              <Link
                to="/contact"
                className="inline-flex h-12 px-6 items-center justify-center font-bold bg-emerald-850 hover:bg-emerald-900 text-white rounded-xl transition-colors border border-emerald-500/20 text-sm shrink-0"
              >
                Ask AI Assistant
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
