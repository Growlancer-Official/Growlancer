import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { Activity, AlertCircle, ArrowRight, BadgeCheck, BarChart3, BriefcaseBusiness, CalendarCheck, CheckCircle2, CheckSquare, ClipboardCheck, ClipboardList, Clock3, Cpu, Eye, Flag, FolderKanban, GitCompare, Handshake, Layers, LayoutDashboard, Loader2, Lock, LockKeyhole, MessageSquareText, MessagesSquare, Receipt, ScanText, ShieldCheck, Sparkles, Target, Timer, Users, Wallet, Wand2, X, Zap,  } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { CategoriesSection as CategoriesSectionComponent } from '../components/CategoriesSection';
import { supabase } from '../lib/supabase';
// Hero Section Component
function HeroSection({ onOpenSignup }: { onOpenSignup: (role?: 'freelancer' | 'client') => void }) {
  const [videoFailed, setVideoFailed] = useState(false);
  return (
    <section className="relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 lg:pt-16 pb-10 sm:pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left content */}
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white ring-1 ring-slate-200 px-3 py-1.5 shadow-sm opacity-0 translate-y-2 animate-fade-up">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-medium text-slate-700">No proposal spam • Matching-first hiring</span>
            </div>

            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-slate-900 opacity-0 translate-y-2 animate-fade-up animation-delay-80 font-display">
              Freelancing, Reinvented with AI
            </h1>

            <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl opacity-0 translate-y-2 animate-fade-up animation-delay-140">
              Find the right freelancer in seconds using intelligent matching. No proposal spam. No endless searching.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3 opacity-0 translate-y-2 animate-fade-up animation-delay-200">
              <button onClick={() => onOpenSignup('client')} className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700 transition-colors">
                Start Hiring
                <ArrowRight className="ml-2 w-5 h-5" />
              </button>
              <button onClick={() => onOpenSignup('freelancer')} className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-white text-slate-900 font-semibold ring-1 ring-slate-200 hover:bg-slate-50 transition-colors">
                Start Freelancing
                <Sparkles className="ml-2 w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600 opacity-0 translate-y-2 animate-fade-up animation-delay-260">
              <div className="inline-flex items-center gap-2">
                <ShieldCheck className="text-emerald-600 w-5 h-5" />
                <span>No spam</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <Clock3 className="text-emerald-600 w-5 h-5" />
                <span>No delays</span>
              </div>
              <div className="inline-flex items-center gap-2">
                <BadgeCheck className="text-emerald-600 w-5 h-5" />
                <span>Better matches</span>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-0 translate-y-2 animate-fade-up animation-delay-320">
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">For clients</div>
                <div className="mt-1 font-semibold tracking-tight text-slate-900">Shortlist instantly</div>
                <div className="mt-1 text-sm text-slate-600">AI ranks best-fit profiles first.</div>
              </div>
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">For freelancers</div>
                <div className="mt-1 font-semibold tracking-tight text-slate-900">Get discovered</div>
                <div className="mt-1 text-sm text-slate-600">Matched to relevant work automatically.</div>
              </div>
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 shadow-sm">
                <div className="text-xs font-semibold text-slate-500">For teams</div>
                <div className="mt-1 font-semibold tracking-tight text-slate-900">Work in one place</div>
                <div className="mt-1 text-sm text-slate-600">Escrow, files, feedback, updates.</div>
              </div>
            </div>
          </div>

          {/* Hero Visual - Animation */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center">
            <div className="relative w-full max-w-[770px] opacity-0 translate-y-2 animate-fade-up animation-delay-180">
              {/* Professional gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 rounded-3xl -z-10"></div>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/20 via-transparent to-transparent rounded-3xl -z-10"></div>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent rounded-3xl -z-10"></div>
              
              {/* Decorative elements */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl -z-10"></div>
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl -z-10"></div>
              
              <div className="relative rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                {!videoFailed ? (
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    className="w-full aspect-video object-cover"
                    poster="/UpdatedLogo.webp"
                    onError={() => setVideoFailed(true)}
                    style={{
                      animation: 'none',
                      transition: 'opacity 0.3s ease',
                    }}
                  >
                    <source src="/videos/hero-demo.mp4" type="video/mp4" />
                  </video>
                ) : (
                  <div className="w-full aspect-video flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-800 to-emerald-900">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="h-16 w-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center animate-pulse">
                        <svg className="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                      </div>
                      <div className="text-white">
                        <div className="text-2xl font-bold font-display">Growlancer</div>
                        <div className="text-emerald-400 text-sm">AI-Powered Matching</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 w-full max-w-md">
                      <div className="bg-white/10 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-emerald-400">0.3s</div>
                        <div className="text-xs text-white/60">Match Time</div>
                      </div>
                      <div className="bg-white/10 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-emerald-400">95%</div>
                        <div className="text-xs text-white/60">Fit Accuracy</div>
                      </div>
                      <div className="bg-white/10 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-emerald-400">5min</div>
                        <div className="text-xs text-white/60">To Hire</div>
                      </div>
                    </div>
                    <div className="mt-6 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
                      <span className="text-emerald-400 text-xs font-medium">Live AI Matching Engine</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Minimal text definition below video - 4 icons with professional styling */}
            <div className="mt-6 grid grid-cols-4 gap-4 w-full max-w-[770px] opacity-0 translate-y-2 animate-fade-up animation-delay-220">
              <div className="group text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 ring-1 ring-emerald-200 mb-3 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-emerald-200/50 transition-all duration-300">
                  <Zap className="text-emerald-600 w-7 h-7" />
                </div>
                <div className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">Instant</div>
                <div className="text-xs text-slate-600 mt-1">AI-powered matching in seconds</div>
              </div>
              <div className="group text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 ring-1 ring-blue-200 mb-3 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-blue-200/50 transition-all duration-300">
                  <ShieldCheck className="text-blue-600 w-7 h-7" />
                </div>
                <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">Secure</div>
                <div className="text-xs text-slate-600 mt-1">Protected escrow payments</div>
              </div>
              <div className="group text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 ring-1 ring-purple-200 mb-3 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-purple-200/50 transition-all duration-300">
                  <Target className="text-purple-600 w-7 h-7" />
                </div>
                <div className="text-sm font-semibold text-slate-900 group-hover:text-purple-700 transition-colors">Precise</div>
                <div className="text-xs text-slate-600 mt-1">Right-fit talent matching</div>
              </div>
              <div className="group text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 ring-1 ring-orange-200 mb-3 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-orange-200/50 transition-all duration-300">
                  <Clock3 className="text-orange-600 w-7 h-7" />
                </div>
                <div className="text-sm font-semibold text-slate-900 group-hover:text-orange-700 transition-colors">Fast</div>
                <div className="text-xs text-slate-600 mt-1">Quick project delivery</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// How It Works Section
function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-10 sm:py-16 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-display">A simple 3-step system</h2>
            <p className="mt-3 text-slate-600 leading-relaxed">Post work (or a profile), get matched instantly, and collaborate with escrow from day one.</p>
          </div>
          <div className="rounded-full bg-white ring-1 ring-slate-200 px-4 py-2 text-sm text-slate-600 shadow-sm w-fit">
            Built for speed, built for clarity
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          <div className="rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6">
            <div className="h-11 w-11 rounded-2xl bg-slate-900 flex items-center justify-center">
              <ClipboardList className="text-white w-6 h-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900 font-display">1) Post project / create profile</h3>
            <p className="mt-2 text-sm text-slate-600">Add requirements, timeline, and preferences (or skills and availability).</p>
          </div>
          <div className="rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6">
            <div className="h-11 w-11 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-sm">
              <Wand2 className="text-white w-6 h-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900 font-display">2) AI matches instantly</h3>
            <p className="mt-2 text-sm text-slate-600">Start with a ranked shortlist and an explanation of why each match fits.</p>
          </div>
          <div className="rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6">
            <div className="h-11 w-11 rounded-2xl bg-orange-500 flex items-center justify-center shadow-sm">
              <Handshake className="text-white w-6 h-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900 font-display">3) Start working with escrow</h3>
            <p className="mt-2 text-sm text-slate-600">Use PayPal escrow, milestones, and a shared workspace to deliver with confidence.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// Why Growlancer is Different — consolidated from Problems/Solutions, Differentiation, Why Choose
function WhyDifferentSection() {
  const comparisons = [
    {
      growlancer: 'AI-ranked shortlist from day one',
      traditional: 'Hundreds of generic proposals to sort through',
      icon: Zap,
    },
    {
      growlancer: 'Invite-only matching based on fit',
      traditional: 'Race-to-the-bottom price bidding',
      icon: Target,
    },
    {
      growlancer: 'Escrow + milestone payment structure',
      traditional: 'Unclear payments and endless email threads',
      icon: ShieldCheck,
    },
    {
      growlancer: 'Unified workspace for files, feedback, and updates',
      traditional: 'Tools scattered across chats and docs',
      icon: FolderKanban,
    },
  ];

  const pillars = [
    {
      icon: Cpu,
      title: 'AI-Powered Precision',
      desc: 'Our multi-variable engine evaluates skills, experience, availability, and past performance to deliver ranked matches — not spam proposals.',
      gradient: 'from-emerald-500/20 to-emerald-600/10',
      iconBg: 'bg-emerald-100 text-emerald-600',
    },
    {
      icon: ShieldCheck,
      title: 'Escrow-First Trust',
      desc: 'Every contract is protected by PayPal escrow. Funds release only when milestones are approved — safety for both sides.',
      gradient: 'from-blue-500/20 to-blue-600/10',
      iconBg: 'bg-blue-100 text-blue-600',
    },
    {
      icon: Users,
      title: 'Built for Collaboration',
      desc: 'Shared workspaces with task boards, notes, and real-time updates keep everyone aligned. No context-switching across tools.',
      gradient: 'from-purple-500/20 to-purple-600/10',
      iconBg: 'bg-purple-100 text-purple-600',
    },
    {
      icon: BarChart3,
      title: 'Data-Driven Growth',
      desc: 'Actionable analytics and transparent success metrics help you make better hiring and freelancing decisions every time.',
      gradient: 'from-orange-500/20 to-orange-600/10',
      iconBg: 'bg-orange-100 text-orange-600',
    },
  ];

  return (
    <section id="why-different" className="py-10 sm:py-16 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Built Different — How Growlancer Stands Out
          </h2>
          <p className="text-slate-600 text-lg leading-relaxed">
            We fixed the broken parts of freelancing: no proposal spam, structured payments, and AI that matches on fit, not noise.
          </p>
        </div>

        {/* Side-by-side Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-16">
          {comparisons.map((item, i) => (
            <div key={i} className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
              {/* Growlancer side */}
              <div className="p-4 sm:p-5 bg-emerald-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-emerald-100 ring-1 ring-emerald-200 flex items-center justify-center flex-shrink-0">
                    <item.icon className="text-emerald-600 w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Growlancer</div>
                    <p className="text-sm font-semibold text-slate-900">{item.growlancer}</p>
                  </div>
                </div>
              </div>
              {/* Traditional side */}
              <div className="p-4 sm:p-5 border-t border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                    <X className="text-slate-400 w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Traditional</div>
                    <p className="text-sm text-slate-500">{item.traditional}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 4 Pillar Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pillars.map((pillar, i) => {
            const Icon = pillar.icon;
            return (
              <div
                key={i}
                className="relative group bg-white rounded-3xl p-8 border border-slate-200/60 shadow-sm hover:shadow-lg hover:border-emerald-200/60 transition-all duration-300 overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${pillar.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative flex items-start gap-5">
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${pillar.iconBg} group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-900 mb-2">{pillar.title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{pillar.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Freelancer Section
function FreelancerSection({ onOpenSignup }: { onOpenSignup: (role?: 'freelancer' | 'client') => void }) {
  return (
    <section id="freelancer" className="py-10 sm:py-16 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
          <div className="lg:col-span-7 rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-display">Stop chasing projects</h2>
                <p className="mt-3 text-slate-600 leading-relaxed max-w-2xl">Get matched automatically to work that fits your skills, availability, and preferences. Spend time delivering, not pitching.</p>
              </div>
              <div className="hidden sm:flex h-12 w-12 rounded-2xl bg-emerald-50 ring-1 ring-emerald-100 items-center justify-center">
                <Target className="text-emerald-700 w-6 h-6" />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <GitCompare className="text-slate-700 w-5 h-5" />
                  <div className="text-sm font-semibold text-slate-900">Get matched automatically</div>
                </div>
                <div className="mt-2 text-sm text-slate-600">Your profile acts like an always-on application, without spam.</div>
              </div>
              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <BriefcaseBusiness className="text-slate-700 w-5 h-5" />
                  <div className="text-sm font-semibold text-slate-900">Relevant projects only</div>
                </div>
                <div className="mt-2 text-sm text-slate-600">Better fit means better outcomes and repeat work.</div>
              </div>
              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <Wallet className="text-slate-700 w-5 h-5" />
                  <div className="text-sm font-semibold text-slate-900">Earn faster</div>
                </div>
                <div className="mt-2 text-sm text-slate-600">Milestones and escrow help you ship and get paid on time.</div>
              </div>
              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <MessagesSquare className="text-slate-700 w-5 h-5" />
                  <div className="text-sm font-semibold text-slate-900">Collaborate easily</div>
                </div>
                <div className="mt-2 text-sm text-slate-600">Files, feedback, and updates stay connected to the project.</div>
              </div>
            </div>

            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <button onClick={() => onOpenSignup('freelancer')} className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700 transition-colors w-full sm:w-auto">
                Create Freelancer Profile
                <ArrowRight className="ml-2 w-5 h-5" />
              </button>
              <Link to={ROUTES.FEATURES} className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-white text-slate-900 font-semibold ring-1 ring-slate-200 hover:bg-slate-50 transition-colors w-full sm:w-auto">
                Explore features
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-3xl bg-slate-900 text-white shadow-sm p-6 sm:p-8 relative overflow-hidden">
            <div className="absolute -top-16 -right-20 h-56 w-56 rounded-full bg-emerald-600/25"></div>
            <div className="absolute -bottom-16 -left-20 h-56 w-56 rounded-full bg-orange-500/20"></div>
            <div className="relative">
              <div className="text-xs font-semibold text-white/70">Freelancer-first detail</div>
              <div className="mt-2 text-xl font-semibold tracking-tight font-display">Signal-based matching</div>
              <p className="mt-3 text-sm text-white/80 leading-relaxed">Your availability, focus areas, and recent work matter. Growlancer prioritizes fit over volume.</p>

              <div className="mt-6 grid grid-cols-1 gap-3">
                <div className="rounded-2xl bg-white/10 ring-1 ring-white/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Profile clarity</div>
                    <ScanText className="text-white/80 w-5 h-5" />
                  </div>
                  <div className="mt-1 text-sm text-white/75">Skills, samples, and scope preference are structured.</div>
                </div>
                <div className="rounded-2xl bg-white/10 ring-1 ring-white/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Availability signals</div>
                    <CalendarCheck className="text-white/80 w-5 h-5" />
                  </div>
                  <div className="mt-1 text-sm text-white/75">Opt in to match windows, not constant bidding.</div>
                </div>
                <div className="rounded-2xl bg-white/10 ring-1 ring-white/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Workflow readiness</div>
                    <CheckSquare className="text-white/80 w-5 h-5" />
                  </div>
                  <div className="mt-1 text-sm text-white/75">Milestones and deliverables reduce misalignment.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Client Section
function ClientSection({ onOpenSignup }: { onOpenSignup: (role?: 'freelancer' | 'client') => void }) {
  return (
    <section id="client" className="py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
          <div className="lg:col-span-5 rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center">
                <Timer className="text-orange-700 w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">For clients</div>
                <div className="text-lg font-semibold tracking-tight text-slate-900 font-display">Stop wasting time hiring</div>
              </div>
            </div>

            <ul className="mt-5 space-y-3 text-sm text-slate-700">
              <li className="flex gap-3">
                <CheckCircle2 className="text-emerald-600 w-5 h-5 mt-0.5" />
                <div><span className="font-semibold text-slate-900">Instant AI recommendations</span> that fit your project constraints.</div>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="text-emerald-600 w-5 h-5 mt-0.5" />
                <div><span className="font-semibold text-slate-900">No spam proposals</span> — you invite who you want to talk to.</div>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="text-emerald-600 w-5 h-5 mt-0.5" />
                <div><span className="font-semibold text-slate-900">Hire quickly</span> with milestones and escrow ready to go.</div>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="text-emerald-600 w-5 h-5 mt-0.5" />
                <div><span className="font-semibold text-slate-900">Track projects easily</span> with a shared workspace for delivery.</div>
              </li>
            </ul>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button onClick={() => onOpenSignup('client')} className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700 transition-colors w-full sm:w-auto">
                Get Started
                <ArrowRight className="ml-2 w-5 h-5" />
              </button>
              <Link to={ROUTES.CATEGORIES} className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-white text-slate-900 font-semibold ring-1 ring-slate-200 hover:bg-slate-50 transition-colors w-full sm:w-auto">
                Browse categories
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7 rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-slate-500">Client workflow preview</div>
                <h3 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 font-display">From brief to escrow, without tool chaos</h3>
                <p className="mt-3 text-slate-600 leading-relaxed max-w-2xl">Define scope, invite matches, and collaborate in a structured workspace that keeps delivery predictable.</p>
              </div>
              <div className="hidden sm:flex h-12 w-12 rounded-2xl bg-slate-50 ring-1 ring-slate-200 items-center justify-center">
                <LayoutDashboard className="text-slate-700 w-6 h-6" />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Milestones</div>
                  <Flag className="text-slate-500 w-5 h-5" />
                </div>
                <div className="mt-2 text-sm text-slate-600">Break work into clear deliverables with approvals.</div>
              </div>
              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Escrow</div>
                  <Lock className="text-slate-500 w-5 h-5" />
                </div>
                <div className="mt-2 text-sm text-slate-600">PayPal escrow helps both sides move forward confidently.</div>
              </div>
              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Feedback loop</div>
                  <MessageSquareText className="text-slate-500 w-5 h-5" />
                </div>
                <div className="mt-2 text-sm text-slate-600">Comments and revisions stay tied to the work.</div>
              </div>
              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Status clarity</div>
                  <Activity className="text-slate-500 w-5 h-5" />
                </div>
                <div className="mt-2 text-sm text-slate-600">Track progress with simple, consistent states.</div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-emerald-50 ring-1 ring-emerald-100 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Zap className="text-emerald-700 w-5 h-5" />
                  <div className="text-sm font-semibold text-slate-900">Realtime-ready by design</div>
                </div>
                <div className="text-sm text-slate-600">Messages, milestones, and escrow updates can sync live as the platform scales.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Categories Section
function CategoriesSection({ onOpenSignup }: { onOpenSignup: (role?: 'freelancer' | 'client') => void }) {
  const { categories, loading, error, refresh } = useCategories();

  return (
    <section id="categories" className="py-10 sm:py-16 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Error banner */}
        {error && !loading && (
          <div className="mb-6 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Could not load live category data.</span>
            <button
              onClick={refresh}
              className="ml-auto text-xs font-medium text-amber-700 underline hover:text-amber-800 whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-display">
              Browse All Categories
            </h2>
            <p className="mt-3 text-slate-600 leading-relaxed">
              {loading 
                ? 'Loading categories...' 
                : `${categories.length} categories — from Development & IT to Sustainability. Browse all categories and find the right freelancer for your project.`
              }
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={ROUTES.CATEGORIES}
              className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-white text-slate-900 font-semibold ring-1 ring-slate-200 hover:bg-slate-50 transition-colors w-fit"
            >
              View All
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
            <button onClick={() => onOpenSignup('client')} className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors w-fit">
              Hire talent
              <ArrowRight className="ml-2 w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mt-8">
          <CategoriesSectionComponent
            mode="browse"
            maxInitial={10}
          />
        </div>

        <div className="mt-6 text-center">
          <Link
            to={ROUTES.CATEGORIES}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-emerald-600 font-semibold rounded-xl border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-all shadow-sm"
          >
            <Layers className="w-5 h-5" />
            Explore All {categories.length} Categories
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// Features Section
function FeaturesSection() {
  const features = [
    { icon: Sparkles, title: 'AI Matching', desc: 'Ranked recommendations with explainable fit signals—built to reduce noise.', color: 'emerald' },
    { icon: ShieldCheck, title: 'Escrow Payments', desc: 'PayPal escrow + milestone structure so both sides know what happens next.', color: 'orange' },
    { icon: FolderKanban, title: 'Workspace', desc: 'Keep scope, files, feedback, and approvals connected to the project.', color: 'slate' },
    { icon: Users, title: 'Collaboration', desc: 'Invite stakeholders, set expectations, and move decisions forward quickly.', color: 'emerald' },
  ];

  return (
    <section id="features" className="py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-display">Product features</h2>
          <p className="mt-3 text-slate-600 leading-relaxed">Minimal surface area, high leverage. Every feature supports speed, trust, and collaboration.</p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {features.map((feat) => {
            const bgColor = feat.color === 'emerald' ? 'bg-emerald-50 ring-emerald-100 text-emerald-700' :
                           feat.color === 'orange' ? 'bg-orange-50 ring-orange-100 text-orange-700' :
                           'bg-slate-50 ring-slate-200 text-slate-700';
            return (
              <div key={feat.title} className="rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6">
                <div className={`h-11 w-11 rounded-2xl ring-1 flex items-center justify-center ${bgColor}`}>
                  <feat.icon className="w-6 h-6" />
                </div>
                <div className="mt-4 text-lg font-semibold tracking-tight text-slate-900 font-display">{feat.title}</div>
                <p className="mt-2 text-sm text-slate-600">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Pricing Section
function PricingSection() {
  return (
    <section id="pricing" className="py-8 sm:py-12 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-display">Pricing that stays transparent</h2>
              <p className="mt-3 text-slate-600 leading-relaxed">We keep pricing simple: clear fees, no pay-to-bid mechanics, and no incentives for spam. You'll always see costs before you commit to escrow.</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 ring-1 ring-emerald-100 p-4 w-full lg:w-[420px]">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white ring-1 ring-emerald-100 flex items-center justify-center">
                  <Receipt className="text-emerald-700 w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">Fee clarity, upfront</div>
                  <div className="mt-1 text-sm text-slate-600">Clients post without friction. Freelancers focus on fit, not bidding.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="text-emerald-600 w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">No proposal spam</div>
                  <div className="mt-1 text-sm text-slate-600">The platform is designed around invites, not floods.</div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-5">
              <div className="flex items-start gap-3">
                <Wallet className="text-emerald-600 w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Escrow-first workflow</div>
                  <div className="mt-1 text-sm text-slate-600">Milestones keep payments and deliverables aligned.</div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="text-emerald-600 w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Predictable experience</div>
                  <div className="mt-1 text-sm text-slate-600">Clear fees, clear next steps, and fewer moving parts.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Trust Section
function TrustSection() {
  return (
    <section id="trust" className="py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          <div className="lg:col-span-5">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-display">Built for trust from day one</h2>
            <p className="mt-3 text-slate-600 leading-relaxed">Growlancer builds trust by making the system understandable: how matching works, how payments are protected, and how projects stay organized.</p>
            <div className="mt-6 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
              <div className="flex items-start gap-3">
                <Eye className="text-emerald-600 w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-500">Platform philosophy</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">Clarity beats hype.</div>
                  <div className="mt-2 text-sm text-slate-600">We avoid vanity metrics and focus on workflow transparency and safer collaboration.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6">
              <div className="h-11 w-11 rounded-2xl bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center">
                <Eye className="text-slate-700 w-6 h-6" />
              </div>
              <div className="mt-4 text-lg font-semibold tracking-tight text-slate-900 font-display">Transparency</div>
              <p className="mt-2 text-sm text-slate-600">See fit reasons and key signals behind each recommendation.</p>
            </div>
            <div className="rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6">
              <div className="h-11 w-11 rounded-2xl bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center">
                <LockKeyhole className="text-emerald-700 w-6 h-6" />
              </div>
              <div className="mt-4 text-lg font-semibold tracking-tight text-slate-900 font-display">Escrow safety</div>
              <p className="mt-2 text-sm text-slate-600">Milestones + PayPal escrow support a safer payment flow.</p>
            </div>
            <div className="rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm p-6">
              <div className="h-11 w-11 rounded-2xl bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center">
                <ClipboardCheck className="text-orange-700 w-6 h-6" />
              </div>
              <div className="mt-4 text-lg font-semibold tracking-tight text-slate-900 font-display">Workflow control</div>
              <p className="mt-2 text-sm text-slate-600">Scope and delivery stay structured, reducing misalignment.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



// Waitlist Section
function WaitlistSection() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    setError('');
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('newsletter-subscribe', {
        method: 'POST',
        body: { email: email.trim() },
      });
      
      if (fnError || !data?.success) {
        setError(data?.error || 'Something went wrong. Try again.');
        setIsLoading(false);
        return;
      }
      
      setSubmitted(true);
      setIsLoading(false);
    } catch {
      setError('Network error. Please try again.');
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <section id="waitlist" className="py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[32px] bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-xl p-8 sm:p-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-300" />
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight font-display mb-3">You're on the list!</h2>
            <p className="text-emerald-100 text-lg max-w-md mx-auto">
              We'll notify you as soon as Growlancer launches. Stay tuned!
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="waitlist" className="py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[32px] bg-gradient-to-br from-slate-900 to-emerald-900 text-white shadow-xl overflow-hidden">
          <div className="relative p-8 sm:p-12">
            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-emerald-500/20"></div>
            <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-600/10"></div>

            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-4">
                  <Sparkles className="w-3 h-3" />
                  EARLY ACCESS
                </div>
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight font-display">
                  Be the first to know
                </h2>
                <p className="mt-3 text-white/80 leading-relaxed max-w-md">
                  We're launching soon. Join the waitlist for early access, feature announcements, and exclusive launch offers.
                </p>
              </div>
              <div>
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    id="waitlist-email"
                    name="email"
                    placeholder="you@company.com"
                    required
                    autoComplete="email"
                    className="flex-1 h-12 px-5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex items-center justify-center h-12 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 transition-colors font-semibold text-slate-900 disabled:opacity-50 gap-2 whitespace-nowrap"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Get Early Access
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
                {error && (
                  <p className="mt-2 text-xs text-red-400">{error}</p>
                )}
                <p className="mt-3 text-xs text-white/50">
                  No spam. Unsubscribe anytime.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// CTA Section
function CTASection({ onOpenSignup }: { onOpenSignup: (role?: 'freelancer' | 'client') => void }) {
  return (
    <section id="cta" className="py-8 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-[32px] bg-slate-900 text-white shadow-sm overflow-hidden ring-1 ring-slate-800">
          <div className="relative p-7 sm:p-10 lg:p-12">
            <div className="absolute -top-20 -right-24 h-80 w-80 rounded-full bg-emerald-600/25"></div>
            <div className="absolute -bottom-28 -left-28 h-96 w-96 rounded-full bg-orange-500/20"></div>

            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7">
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight font-display">Start your freelancing journey today.</h2>
                <p className="mt-3 text-white/80 leading-relaxed max-w-2xl">Whether you're hiring or freelancing, Growlancer helps you move from intent to work faster—with less noise and more clarity.</p>
              </div>
              <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col gap-3 lg:items-stretch">
                <button onClick={() => onOpenSignup('client')} className="inline-flex items-center justify-center h-12 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 transition-colors font-semibold text-slate-900 w-full">
                  Get Started
                  <ArrowRight className="ml-2 w-5 h-5" />
                </button>
                <button onClick={() => onOpenSignup('freelancer')} className="inline-flex items-center justify-center h-12 px-6 rounded-xl bg-white text-slate-900 hover:bg-slate-100 transition-colors font-semibold w-full">
                  Start Freelancing
                  <ArrowRight className="ml-2 w-5 h-5" />
                </button>
                <div className="text-xs text-white/70">No spam. No pay-to-bid. Clear workflows.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



// Main HomePage Component
export function HomePage() {
  const navigate = useNavigate();

  const handleOpenSignup = (role?: 'freelancer' | 'client') => {
    navigate('/?modal=signup&role=' + (role || 'freelancer'));
  };

  return (
    <div id="top">
      <HeroSection onOpenSignup={handleOpenSignup} />
      <HowItWorksSection />
      <WhyDifferentSection />
      <FreelancerSection onOpenSignup={handleOpenSignup} />
      <ClientSection onOpenSignup={handleOpenSignup} />
      <CategoriesSection onOpenSignup={handleOpenSignup} />

      <FeaturesSection />
      <PricingSection />
      <TrustSection />
      <WaitlistSection />
      <CTASection onOpenSignup={handleOpenSignup} />
    </div>
  );
}
