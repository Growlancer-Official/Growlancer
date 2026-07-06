import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AIChatSupport } from '../components/AIChatSupport';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Clock, Headphones, Shield, Sparkles, Zap,  } from 'lucide-react';

export function ContactPage() {
  const { user } = useAuth();
  const [chatContext, setChatContext] = useState<'freelancer' | 'client'>('freelancer');

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans pb-24">
      {/* Header */}
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
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white border-b border-emerald-900/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl -ml-20 -mb-20"></div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-full border border-emerald-500/30 text-xs uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            AI Support
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight leading-none">
            We're here to <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">help you grow</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto font-medium leading-relaxed">
            Get instant answers from our AI support assistant. Real-time help whenever you need it.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Left: Context selector + Info cards */}
          <div className="lg:col-span-1 space-y-4">
            {/* Role Context Selector */}
            {!user && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-3">I need help as a...</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setChatContext('freelancer')}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      chatContext === 'freelancer'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Freelancer
                  </button>
                  <button
                    onClick={() => setChatContext('client')}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      chatContext === 'client'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Client
                  </button>
                </div>
              </div>
            )}

            {/* Features */}
            <div className="space-y-3">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-emerald-200 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Instant Responses</h4>
                    <p className="text-xs text-slate-500">Get help in seconds, not hours</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-emerald-200 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">24/7 Availability</h4>
                    <p className="text-xs text-slate-500">Always here, day or night</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-emerald-200 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Personalized Help</h4>
                    <p className="text-xs text-slate-500">Tailored to your role and needs</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-gradient-to-br from-slate-50 to-emerald-50/50 border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Headphones className="w-4 h-4 text-emerald-600" />
                <h4 className="font-bold text-slate-900 text-sm">Quick Resources</h4>
              </div>
              <Link to="/help-center" className="block text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline">
                → Browse Help Center
              </Link>
              <Link to="/guidelines" className="block text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline">
                → Platform Guidelines
              </Link>
              <Link to="/status" className="block text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:underline">
                → System Status
              </Link>
            </div>
          </div>

          {/* Right: Chat Support */}
          <div className="lg:col-span-2">
            <div className="h-[600px]">
              <AIChatSupport
                context={chatContext}
                title={user ? `Support Chat — ${user.name || user.email}` : '24/7 Support Chat'}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
