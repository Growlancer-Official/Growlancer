import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle, Compass, XCircle,  } from 'lucide-react';

export function GuidelinesPage() {
  const dos = [
    'Communicate clearly and professionally in the workspace',
    'Set realistic milestone expectations and clear deadlines',
    'Ensure all payments are locked in Virtual Escrow beforehand',
    'Keep code updates and feedback cycles synchronized live',
    'Provide constructive, objective, and respectful reviews',
    'Respond to messages and coordination calls in under 24 hours',
  ];

  const donts = [
    'Attempt to bypass escrow or solicit direct external payments',
    'Share sensitive passwords or private credentials in raw text',
    'Upload malicious scripts, spam links, or unvetted bundles',
    'Plagiarize, misrepresent experience, or buy profile credentials',
    'Coerce or harass partners during milestone negotiations',
    'Delete active task cards without prior workspace consensus',
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
            <Compass className="w-3.5 h-3.5" />
            Community Guidelines
          </span>
          <h1 className="font-display text-4xl sm:text-6xl font-black tracking-tight leading-none">
            Maintaining our high <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">standard of work</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto font-medium">
            To preserve a clean, spam-free, and high-trust ecosystem, all registered members must adhere to our behavioral code.
          </p>
        </div>
      </section>

      {/* Do's and Dont's */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Dos */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/50 shadow-sm space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-emerald-650" />
              </div>
              <div>
                <h3 className="font-display font-extrabold text-slate-900 text-base">Client & Creator Do's</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Best Practices</p>
              </div>
            </div>

            <ul className="space-y-4">
              {dos.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-650 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 leading-relaxed font-semibold">{item}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Donts */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/50 shadow-sm space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center border border-red-100 flex-shrink-0">
                <XCircle className="w-6 h-6 text-red-650" />
              </div>
              <div>
                <h3 className="font-display font-extrabold text-slate-900 text-base">Client & Creator Don'ts</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Banned Operations</p>
              </div>
            </div>

            <ul className="space-y-4">
              {donts.map((item, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 leading-relaxed font-semibold">{item}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Enforcement Alert Box */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-6 flex flex-col sm:flex-row gap-4 items-start shadow-sm">
          <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-700 animate-pulse" />
          </div>
          <div>
            <h4 className="font-bold text-amber-950 text-sm">Enforcement Protocol</h4>
            <p className="text-xs text-amber-900/80 leading-relaxed mt-1 font-semibold">
              Growlancer uses automated review processes. Violating these directives triggers workspace lockouts, wallet freezes, and permanent profile banning. You can submit appeals via support tickets.
            </p>
          </div>
        </div>
      </section>

      {/* Support link */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 text-center">
        <div className="bg-emerald-600 rounded-[2.5rem] p-8 sm:p-12 text-white relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-2xl -mr-20 -mt-20"></div>
          
          <div className="relative space-y-6">
            <h2 className="font-display text-3xl font-black tracking-tight leading-tight">Spotted a violation?</h2>
            <p className="text-emerald-100 text-xs max-w-md mx-auto leading-relaxed">
              If you see something that violates our guidelines, please create a support ticket and we'll review it promptly.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                to="/contact"
                className="inline-flex h-12 px-6 items-center justify-center font-bold bg-white text-emerald-600 rounded-xl hover:bg-emerald-50 transition-colors shadow-md text-sm shrink-0"
              >
                Get AI Support
              </Link>
              <Link
                to="/help-center"
                className="inline-flex h-12 px-6 items-center justify-center font-bold bg-emerald-850 hover:bg-emerald-900 text-white rounded-xl transition-colors border border-emerald-500/20 text-sm shrink-0"
              >
                Browse Guidelines FAQs
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
