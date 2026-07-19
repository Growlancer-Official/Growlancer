import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../routes';
import { 
  Activity, AlertCircle, ArrowRight, BadgeCheck, BarChart3, 
  BriefcaseBusiness, CalendarCheck, CheckCircle2, CheckSquare, 
  ClipboardCheck, ClipboardList, Clock3, Cpu, Eye, Flag, 
  FolderKanban, GitCompare, Handshake, Layers, LayoutDashboard, 
  Loader2, Lock, LockKeyhole, MessageSquareText, MessagesSquare, 
  Receipt, ScanText, ShieldCheck, Sparkles, Target, Timer, 
  Users, Wallet, Wand2, X, Zap,
} from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { CategoriesSection as CategoriesSectionComponent } from '../components/CategoriesSection';
import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════
const SECTION_PADDING = 'py-12 sm:py-16 lg:py-20';
const SECTION_PADDING_SM = 'py-10 sm:py-14 lg:py-16';
const CONTAINER = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8';
const GRID_GAP = 'gap-6 lg:gap-8';
const CARD_CLASS = 'rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm';

// ═══════════════════════════════════════════════════════════════
// Hero Section
// ═══════════════════════════════════════════════════════════════
function HeroSection({ onOpenSignup }: { onOpenSignup: (role?: 'freelancer' | 'client') => void }) {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <section className="relative overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-50/40 via-white to-white pointer-events-none" />
      
      <div className={`${CONTAINER} relative pt-12 sm:pt-16 lg:pt-20 pb-10 sm:pb-14 lg:pb-16`}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* ── Left Content ── */}
          <div className="lg:col-span-6 lg:pr-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white ring-1 ring-slate-200 px-3 py-1.5 shadow-sm opacity-0 translate-y-2 animate-fade-up">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-slate-600">No proposal spam · Matching-first hiring</span>
            </div>

            <h1 className="mt-5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 opacity-0 translate-y-2 animate-fade-up animation-delay-80 font-display leading-[1.1]">
              Freelancing,<br />
              <span className="text-emerald-600">Reinvented with AI</span>
            </h1>

            <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed max-w-lg opacity-0 translate-y-2 animate-fade-up animation-delay-140">
              Find the right freelancer in seconds using intelligent matching. 
              No proposal spam. No endless searching. Just precise, data-driven matches.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-3 opacity-0 translate-y-2 animate-fade-up animation-delay-200">
              <button 
                onClick={() => onOpenSignup('client')} 
                className="inline-flex items-center justify-center h-12 px-6 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700 hover:shadow-md transition-all text-sm"
              >
                Start Hiring
                <ArrowRight className="ml-2 w-4 h-4" />
              </button>
              <button 
                onClick={() => onOpenSignup('freelancer')} 
                className="inline-flex items-center justify-center h-12 px-6 rounded-xl bg-white text-slate-700 font-semibold ring-1 ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 transition-all text-sm"
              >
                Start Freelancing
                <Sparkles className="ml-2 w-4 h-4 text-emerald-500" />
              </button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm text-slate-500 opacity-0 translate-y-2 animate-fade-up animation-delay-260">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="text-emerald-600 w-4 h-4" />
                <span>No spam proposals</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="text-emerald-600 w-4 h-4" />
                <span>No endless searching</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="text-emerald-600 w-4 h-4" />
                <span>Smarter matches</span>
              </span>
            </div>

            {/* Stats Cards */}
            <div className="mt-8 grid grid-cols-3 gap-3 opacity-0 translate-y-2 animate-fade-up animation-delay-320">
              {[
                { label: 'For clients', title: 'Shortlist in seconds', desc: 'AI ranks best-fit profiles' },
                { label: 'For freelancers', title: 'Get discovered', desc: 'Matched to relevant work' },
                { label: 'For teams', title: 'One workspace', desc: 'Escrow, files, feedback' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-white ring-1 ring-slate-200/70 p-3.5 shadow-sm hover:shadow-md hover:ring-emerald-200/50 transition-all duration-200">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{item.label}</div>
                  <div className="mt-1 text-sm font-semibold tracking-tight text-slate-900">{item.title}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right Visual ── */}
          <div className="lg:col-span-6 flex flex-col items-center">
            <div className="relative w-full max-w-[640px] opacity-0 translate-y-2 animate-fade-up animation-delay-180">
              {/* Background glow */}
              <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/20 via-transparent to-blue-500/20 rounded-[32px] blur-2xl -z-10" />
              <div className="absolute -top-8 -right-8 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl -z-10" />
              <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl -z-10" />

              <div className="relative rounded-2xl overflow-hidden shadow-xl ring-1 ring-black/5 bg-slate-900">
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
                  >
                    <source src="/videos/hero-demo.mp4" type="video/mp4" />
                  </video>
                ) : (
                  <div className="w-full aspect-video flex flex-col items-center justify-center p-6 sm:p-8 bg-gradient-to-br from-slate-800 to-emerald-900">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                        <svg className="w-7 h-7 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                      </div>
                      <div className="text-left">
                        <div className="text-xl font-bold font-display text-white">Growlancer</div>
                        <div className="text-emerald-400 text-xs font-medium">AI-Powered Matching Engine</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
                      {[
                        { value: '0.3s', label: 'Match Time' },
                        { value: '95%', label: 'Fit Accuracy' },
                        { value: '5min', label: 'To Hire' },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-white/10 rounded-xl p-2.5 text-center">
                          <div className="text-xl font-bold text-emerald-400">{stat.value}</div>
                          <div className="text-[10px] text-white/60">{stat.label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-emerald-400 text-[11px] font-medium">Live AI Matching Engine</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Features row below video */}
            <div className="mt-5 grid grid-cols-4 gap-3 w-full max-w-[640px] opacity-0 translate-y-2 animate-fade-up animation-delay-220">
              {[
                { icon: Zap, label: 'Instant', desc: 'AI matching in seconds', color: 'emerald' },
                { icon: ShieldCheck, label: 'Secure', desc: 'Protected escrow', color: 'blue' },
                { icon: Target, label: 'Precise', desc: 'Right-fit talent', color: 'purple' },
                { icon: Clock3, label: 'Fast', desc: 'Quick delivery', color: 'orange' },
              ].map(({ icon: Icon, label, desc, color }) => {
                const colorMap = {
                  emerald: 'from-emerald-50 to-emerald-100 ring-emerald-200 text-emerald-600 group-hover:shadow-emerald-200/50',
                  blue: 'from-blue-50 to-blue-100 ring-blue-200 text-blue-600 group-hover:shadow-blue-200/50',
                  purple: 'from-purple-50 to-purple-100 ring-purple-200 text-purple-600 group-hover:shadow-purple-200/50',
                  orange: 'from-orange-50 to-orange-100 ring-orange-200 text-orange-600 group-hover:shadow-orange-200/50',
                };
                return (
                  <div key={label} className="group text-center">
                    <div className={`inline-flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br ring-1 mb-2 group-hover:scale-105 group-hover:shadow-lg transition-all duration-200 ${colorMap[color]}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-emerald-700 transition-colors">{label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{desc}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// How It Works
// ═══════════════════════════════════════════════════════════════
function HowItWorksSection() {
  const steps = [
    {
      icon: ClipboardList,
      number: '01',
      title: 'Post project / create profile',
      desc: 'Add requirements, timeline, and preferences. Or set your skills and availability.',
      color: 'bg-slate-900',
    },
    {
      icon: Wand2,
      number: '02',
      title: 'AI matches instantly',
      desc: 'Get a ranked shortlist with fit explanations. No spam, just precision.',
      color: 'bg-emerald-600',
    },
    {
      icon: Handshake,
      number: '03',
      title: 'Start working with escrow',
      desc: 'Milestones, escrow, and a shared workspace for confident delivery.',
      color: 'bg-orange-500',
    },
  ];

  return (
    <section className={SECTION_PADDING}>
      <div className={CONTAINER}>
        <div className="flex flex-col items-center text-center lg:text-left lg:flex-row lg:items-end lg:justify-between gap-4 mb-10 lg:mb-12">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">How it works</div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 font-display">
              A simple 3-step system
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Post work (or a profile), get matched instantly, and collaborate with escrow from day one.
            </p>
          </div>
          <div className="rounded-full bg-white ring-1 ring-slate-200 px-4 py-2 text-xs text-slate-500 shadow-sm w-fit lg:ml-auto">
            Built for speed, built for clarity
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
          {steps.map((step) => (
            <div key={step.number} className="group relative rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-6 hover:shadow-lg hover:ring-emerald-200/50 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${step.color}`}>
                  <step.icon className="text-white w-5 h-5" />
                </div>
                <span className="text-2xl font-bold text-slate-200 font-display">{step.number}</span>
              </div>
              <h3 className="text-base font-semibold tracking-tight text-slate-900">{step.title}</h3>
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Why Different
// ═══════════════════════════════════════════════════════════════
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
      growlancer: 'Unified workspace for files, feedback, updates',
      traditional: 'Tools scattered across chats and docs',
      icon: FolderKanban,
    },
  ];

  const pillars = [
    {
      icon: Cpu,
      title: 'AI-Powered Precision',
      desc: 'Our multi-variable engine evaluates skills, experience, availability, and past performance to deliver ranked matches — not spam proposals.',
      gradient: 'from-emerald-500/10 to-emerald-600/5',
      iconBg: 'bg-emerald-100 text-emerald-600',
      border: 'hover:border-emerald-200',
    },
    {
      icon: ShieldCheck,
      title: 'Escrow-First Trust',
      desc: 'Every contract is protected by PayPal escrow. Funds release only when milestones are approved — safety for both sides.',
      gradient: 'from-blue-500/10 to-blue-600/5',
      iconBg: 'bg-blue-100 text-blue-600',
      border: 'hover:border-blue-200',
    },
    {
      icon: Users,
      title: 'Built for Collaboration',
      desc: 'Shared workspaces with task boards, notes, and real-time updates keep everyone aligned. No context-switching across tools.',
      gradient: 'from-purple-500/10 to-purple-600/5',
      iconBg: 'bg-purple-100 text-purple-600',
      border: 'hover:border-purple-200',
    },
    {
      icon: BarChart3,
      title: 'Data-Driven Growth',
      desc: 'Actionable analytics and transparent success metrics help you make better hiring and freelancing decisions every time.',
      gradient: 'from-orange-500/10 to-orange-600/5',
      iconBg: 'bg-orange-100 text-orange-600',
      border: 'hover:border-orange-200',
    },
  ];

  return (
    <section className={`${SECTION_PADDING} bg-white`}>
      <div className={CONTAINER}>
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 lg:mb-14">
          <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">Why Growlancer</div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 font-display mb-4">
            Built Different — How We Stand Out
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
            We fixed the broken parts of freelancing: no proposal spam, structured payments, 
            and AI that matches on fit, not noise.
          </p>
        </div>

        {/* Comparison Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-14 lg:mb-16">
          {comparisons.map((item, i) => (
            <div key={i} className={`${CARD_CLASS} overflow-hidden hover:shadow-md transition-all duration-200`}>
              <div className="p-4 bg-emerald-50/60">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 ring-1 ring-emerald-200 flex items-center justify-center flex-shrink-0">
                    <item.icon className="text-emerald-600 w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Growlancer</div>
                    <div className="text-sm font-medium text-slate-800">{item.growlancer}</div>
                  </div>
                </div>
              </div>
              <div className="p-4 border-t border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                    <X className="text-slate-400 w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Traditional</div>
                    <div className="text-sm text-slate-500">{item.traditional}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pillar Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
          {pillars.map((pillar, i) => {
            const Icon = pillar.icon;
            return (
              <div
                key={i}
                className={`group bg-white rounded-2xl p-6 lg:p-7 border border-slate-200/60 shadow-sm hover:shadow-lg ${pillar.border} transition-all duration-300 relative overflow-hidden`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${pillar.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative flex items-start gap-4">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${pillar.iconBg} group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 mb-1.5">{pillar.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{pillar.desc}</p>
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

// ═══════════════════════════════════════════════════════════════
// Freelancer Section
// ═══════════════════════════════════════════════════════════════
function FreelancerSection({ onOpenSignup }: { onOpenSignup: (role?: 'freelancer' | 'client') => void }) {
  return (
    <section className={SECTION_PADDING}>
      <div className={CONTAINER}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Content */}
          <div className="lg:col-span-7 rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-6 sm:p-8 lg:p-10">
            <div>
              <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-1">For freelancers</div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 font-display">
                Stop chasing projects
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                Get matched automatically to work that fits your skills, availability, and preferences. 
                Spend time delivering, not pitching.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: GitCompare, title: 'Get matched automatically', desc: 'Your profile acts like an always-on application, without spam.' },
                { icon: BriefcaseBusiness, title: 'Relevant projects only', desc: 'Better fit means better outcomes and repeat work.' },
                { icon: Wallet, title: 'Earn faster', desc: 'Milestones and escrow help you ship and get paid on time.' },
                { icon: MessagesSquare, title: 'Collaborate easily', desc: 'Files, feedback, and updates stay connected to the project.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-xl bg-slate-50 ring-1 ring-slate-200/70 p-4 hover:bg-emerald-50/50 hover:ring-emerald-200/50 transition-all duration-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="text-slate-600 w-4 h-4" />
                    <div className="text-sm font-semibold text-slate-900">{title}</div>
                  </div>
                  <div className="text-xs sm:text-sm text-slate-500">{desc}</div>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => onOpenSignup('freelancer')} 
                className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700 hover:shadow-md transition-all text-sm"
              >
                Create Freelancer Profile
                <ArrowRight className="ml-2 w-4 h-4" />
              </button>
              <Link 
                to={ROUTES.FEATURES} 
                className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-white text-slate-700 font-semibold ring-1 ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 transition-all text-sm"
              >
                Explore features
              </Link>
            </div>
          </div>

          {/* Right Dark Card */}
          <div className="lg:col-span-5 rounded-2xl bg-slate-900 text-white shadow-sm p-6 sm:p-8 lg:p-10 relative overflow-hidden">
            <div className="absolute -top-16 -right-20 h-56 w-56 rounded-full bg-emerald-600/20" />
            <div className="absolute -bottom-16 -left-20 h-56 w-56 rounded-full bg-orange-500/15" />
            <div className="relative">
              <div className="text-[10px] font-semibold text-white/50 uppercase tracking-widest">Freelancer-first detail</div>
              <div className="mt-2 text-xl sm:text-2xl font-bold tracking-tight font-display">Signal-based matching</div>
              <p className="mt-3 text-sm text-white/70 leading-relaxed">
                Your availability, focus areas, and recent work matter. Growlancer prioritizes fit over volume.
              </p>

              <div className="mt-6 space-y-3">
                {[
                  { icon: ScanText, title: 'Profile clarity', desc: 'Skills, samples, and scope preference are structured.' },
                  { icon: CalendarCheck, title: 'Availability signals', desc: 'Opt in to match windows, not constant bidding.' },
                  { icon: CheckSquare, title: 'Workflow readiness', desc: 'Milestones and deliverables reduce misalignment.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="rounded-xl bg-white/10 ring-1 ring-white/10 p-3.5 hover:bg-white/15 transition-colors">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-sm font-medium text-white">{title}</div>
                      <Icon className="text-white/60 w-4 h-4" />
                    </div>
                    <div className="text-xs text-white/60">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Client Section
// ═══════════════════════════════════════════════════════════════
function ClientSection({ onOpenSignup }: { onOpenSignup: (role?: 'freelancer' | 'client') => void }) {
  return (
    <section className={SECTION_PADDING_SM}>
      <div className={CONTAINER}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Card */}
          <div className="lg:col-span-5 rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center">
                <Timer className="text-orange-600 w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">For clients</div>
                <div className="text-lg font-bold tracking-tight text-slate-900">Stop wasting time hiring</div>
              </div>
            </div>

            <ul className="space-y-3 text-sm text-slate-600">
              {[
                { bold: 'Instant AI recommendations', text: 'that fit your project constraints.' },
                { bold: 'No spam proposals', text: '— you invite who you want to talk to.' },
                { bold: 'Hire quickly', text: 'with milestones and escrow ready to go.' },
                { bold: 'Track projects easily', text: 'with a shared workspace for delivery.' },
              ].map(({ bold, text }) => (
                <li key={bold} className="flex gap-2.5">
                  <CheckCircle2 className="text-emerald-600 w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div><span className="font-semibold text-slate-800">{bold}</span>{text}</div>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => onOpenSignup('client')} 
                className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700 hover:shadow-md transition-all text-sm"
              >
                Get Started
                <ArrowRight className="ml-2 w-4 h-4" />
              </button>
              <Link 
                to={ROUTES.CATEGORIES} 
                className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-white text-slate-700 font-semibold ring-1 ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 transition-all text-sm"
              >
                Browse categories
              </Link>
            </div>
          </div>

          {/* Right Content */}
          <div className="lg:col-span-7 rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-6 sm:p-8">
            <div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Client workflow preview</div>
              <h3 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 font-display">
                From brief to escrow, without tool chaos
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-xl">
                Define scope, invite matches, and collaborate in a structured workspace 
                that keeps delivery predictable.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { icon: Flag, title: 'Milestones', desc: 'Break work into clear deliverables with approvals.' },
                { icon: Lock, title: 'Escrow', desc: 'PayPal escrow helps both sides move forward confidently.' },
                { icon: MessageSquareText, title: 'Feedback loop', desc: 'Comments and revisions stay tied to the work.' },
                { icon: Activity, title: 'Status clarity', desc: 'Track progress with simple, consistent states.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-xl bg-slate-50 ring-1 ring-slate-200/70 p-4 hover:bg-orange-50/50 hover:ring-orange-200/50 transition-all duration-200">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-semibold text-slate-900">{title}</div>
                    <Icon className="text-slate-400 w-4 h-4" />
                  </div>
                  <div className="text-xs sm:text-sm text-slate-500">{desc}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl bg-emerald-50 ring-1 ring-emerald-100/70 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="text-emerald-600 w-4 h-4" />
                  <span className="text-sm font-semibold text-slate-800">Real-time ready by design</span>
                </div>
                <span className="text-xs sm:text-sm text-slate-500">
                  Messages, milestones, and escrow updates sync live.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Categories Section
// ═══════════════════════════════════════════════════════════════
function CategoriesSection({ onOpenSignup }: { onOpenSignup: (role?: 'freelancer' | 'client') => void }) {
  const { categories, loading, error, refresh } = useCategories();

  return (
    <section className={`${SECTION_PADDING} bg-white`}>
      <div className={CONTAINER}>
        {/* Error banner */}
        {error && !loading && (
          <div className="mb-6 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Could not load live category data.</span>
            <button onClick={refresh} className="ml-auto text-xs font-medium text-amber-700 underline hover:text-amber-800 whitespace-nowrap">
              Retry
            </button>
          </div>
        )}

        <div className="flex flex-col items-center text-center lg:text-left lg:flex-row lg:items-end lg:justify-between gap-4 mb-8 lg:mb-10">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">Categories</div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 font-display">
              Browse All Categories
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
              {loading 
                ? 'Loading categories...' 
                : `${categories.length} categories — from Development & IT to Sustainability.`
              }
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={ROUTES.CATEGORIES}
              className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-white text-slate-700 font-semibold ring-1 ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 transition-all text-sm"
            >
              View All
              <ArrowRight className="ml-2 w-3.5 h-3.5" />
            </Link>
            <button 
              onClick={() => onOpenSignup('client')} 
              className="inline-flex items-center justify-center h-10 px-4 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all text-sm shadow-sm"
            >
              Hire talent
              <ArrowRight className="ml-2 w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div>
          <CategoriesSectionComponent mode="browse" maxInitial={10} />
        </div>

        <div className="mt-6 text-center">
          <Link
            to={ROUTES.CATEGORIES}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-emerald-600 font-semibold rounded-xl border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-all text-sm shadow-sm"
          >
            <Layers className="w-4 h-4" />
            Explore All {categories.length} Categories
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Features Section
// ═══════════════════════════════════════════════════════════════
function FeaturesSection() {
  const features = [
    { icon: Sparkles, title: 'AI Matching', desc: 'Ranked recommendations with explainable fit signals — built to reduce noise.', color: 'emerald' },
    { icon: ShieldCheck, title: 'Escrow Payments', desc: 'PayPal escrow + milestone structure so both sides know what happens next.', color: 'orange' },
    { icon: FolderKanban, title: 'Workspace', desc: 'Keep scope, files, feedback, and approvals connected to the project.', color: 'slate' },
    { icon: Users, title: 'Collaboration', desc: 'Invite stakeholders, set expectations, and move decisions forward quickly.', color: 'emerald' },
  ];

  const colorStyles = {
    emerald: { bg: 'bg-emerald-50 ring-emerald-100 text-emerald-600', hover: 'hover:ring-emerald-200' },
    orange: { bg: 'bg-orange-50 ring-orange-100 text-orange-600', hover: 'hover:ring-orange-200' },
    slate: { bg: 'bg-slate-50 ring-slate-200 text-slate-600', hover: 'hover:ring-slate-300' },
  };

  return (
    <section className={SECTION_PADDING_SM}>
      <div className={CONTAINER}>
        <div className="max-w-2xl mb-8 lg:mb-10">
          <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">Features</div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 font-display">Product features</h2>
          <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
            Minimal surface area, high leverage. Every feature supports speed, trust, and collaboration.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          {features.map((feat) => {
            const styles = colorStyles[feat.color as keyof typeof colorStyles];
            return (
              <div key={feat.title} className={`${CARD_CLASS} p-6 ${styles.hover} hover:shadow-md transition-all duration-200 group`}>
                <div className={`h-10 w-10 rounded-xl ring-1 flex items-center justify-center ${styles.bg} group-hover:scale-110 transition-transform`}>
                  <feat.icon className="w-5 h-5" />
                </div>
                <div className="mt-3.5 text-base font-semibold tracking-tight text-slate-900">{feat.title}</div>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Pricing Section
// ═══════════════════════════════════════════════════════════════
function PricingSection() {
  return (
    <section className={`${SECTION_PADDING} bg-white`}>
      <div className={CONTAINER}>
        <div className={`${CARD_CLASS} overflow-hidden`}>
          <div className="p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="max-w-2xl">
                <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">Pricing</div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 font-display">
                  Pricing that stays transparent
                </h2>
                <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
                  We keep pricing simple: clear fees, no pay-to-bid mechanics, and no incentives for spam.
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-100/70 p-4 w-full lg:w-[380px] shrink-0">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white ring-1 ring-emerald-100 flex items-center justify-center shrink-0">
                    <Receipt className="text-emerald-600 w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Fee clarity, upfront</div>
                    <div className="mt-0.5 text-xs text-slate-500">Clients post without friction. Freelancers focus on fit, not bidding.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { icon: ShieldCheck, title: 'No proposal spam', desc: 'The platform is designed around invites, not floods.' },
                { icon: Wallet, title: 'Escrow-first workflow', desc: 'Milestones keep payments and deliverables aligned.' },
                { icon: CheckCircle2, title: 'Predictable experience', desc: 'Clear fees, clear next steps, fewer moving parts.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-xl bg-slate-50 ring-1 ring-slate-200/70 p-4 hover:shadow-sm transition-all">
                  <div className="flex items-start gap-3">
                    <Icon className="text-emerald-600 w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{title}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Trust Section
// ═══════════════════════════════════════════════════════════════
function TrustSection() {
  return (
    <section className={SECTION_PADDING_SM}>
      <div className={CONTAINER}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          <div className="lg:col-span-5">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">Trust</div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 font-display">
              Built for trust from day one
            </h2>
            <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
              Growlancer builds trust by making the system understandable: how matching works, 
              how payments are protected, and how projects stay organized.
            </p>
            <div className={`mt-6 ${CARD_CLASS} p-5 hover:shadow-md transition-all`}>
              <div className="flex items-start gap-3">
                <Eye className="text-emerald-600 w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Platform philosophy</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">Clarity beats hype.</div>
                  <div className="mt-1 text-xs text-slate-500">
                    We avoid vanity metrics and focus on workflow transparency and safer collaboration.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Eye, title: 'Transparency', desc: 'See fit reasons and key signals behind each recommendation.', bg: 'bg-slate-50 ring-slate-200 text-slate-600' },
              { icon: LockKeyhole, title: 'Escrow safety', desc: 'Milestones + PayPal escrow support a safer payment flow.', bg: 'bg-emerald-50 ring-emerald-100 text-emerald-600' },
              { icon: ClipboardCheck, title: 'Workflow control', desc: 'Scope and delivery stay structured, reducing misalignment.', bg: 'bg-orange-50 ring-orange-100 text-orange-600' },
            ].map(({ icon: Icon, title, desc, bg }) => (
              <div key={title} className={`${CARD_CLASS} p-6 hover:shadow-md transition-all duration-200 group`}>
                <div className={`h-10 w-10 rounded-xl ring-1 flex items-center justify-center ${bg} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="mt-3.5 text-base font-semibold tracking-tight text-slate-900">{title}</div>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Waitlist Section
// ═══════════════════════════════════════════════════════════════
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
      <section className={SECTION_PADDING_SM}>
        <div className={CONTAINER}>
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-lg p-8 sm:p-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-300" />
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display mb-3">You're on the list!</h2>
            <p className="text-emerald-100 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
              We'll notify you as soon as Growlancer launches. Stay tuned!
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={SECTION_PADDING_SM}>
      <div className={CONTAINER}>
        <div className="relative rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-900 text-white shadow-xl overflow-hidden">
          <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-emerald-500/15" />
          <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-emerald-600/10" />

          <div className="relative p-8 sm:p-10 lg:p-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-4">
                  <Sparkles className="w-3 h-3" />
                  EARLY ACCESS
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight font-display">
                  Be the first to know
                </h2>
                <p className="mt-2 text-sm sm:text-base text-white/70 leading-relaxed max-w-md">
                  We're launching soon. Join the waitlist for early access, feature announcements, 
                  and exclusive launch offers.
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
                    className="flex-1 h-12 px-4 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex items-center justify-center h-12 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 transition-colors font-semibold text-slate-900 disabled:opacity-50 gap-2 whitespace-nowrap text-sm"
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
                <p className="mt-2 text-xs text-white/50">No spam. Unsubscribe anytime.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// CTA Section
// ═══════════════════════════════════════════════════════════════
function CTASection({ onOpenSignup }: { onOpenSignup: (role?: 'freelancer' | 'client') => void }) {
  return (
    <section className={SECTION_PADDING_SM}>
      <div className={CONTAINER}>
        <div className="relative rounded-2xl bg-slate-900 text-white shadow-sm overflow-hidden ring-1 ring-slate-800">
          <div className="absolute -top-20 -right-24 h-72 w-72 rounded-full bg-emerald-600/20" />
          <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-orange-500/15" />

          <div className="relative p-8 sm:p-10 lg:p-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight font-display">
                  Start your freelancing journey today.
                </h2>
                <p className="mt-2 text-sm sm:text-base text-white/70 leading-relaxed max-w-xl">
                  Whether you're hiring or freelancing, Growlancer helps you move from intent 
                  to work faster — with less noise and more clarity.
                </p>
              </div>
              <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col gap-3 lg:items-stretch">
                <button 
                  onClick={() => onOpenSignup('client')} 
                  className="inline-flex items-center justify-center h-12 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 transition-colors font-semibold text-slate-900 w-full text-sm"
                >
                  Get Started
                  <ArrowRight className="ml-2 w-4 h-4" />
                </button>
                <button 
                  onClick={() => onOpenSignup('freelancer')} 
                  className="inline-flex items-center justify-center h-12 px-6 rounded-xl bg-white text-slate-800 hover:bg-slate-100 transition-colors font-semibold w-full text-sm"
                >
                  Start Freelancing
                  <ArrowRight className="ml-2 w-4 h-4" />
                </button>
                <div className="text-xs text-white/50 text-center lg:text-left">No spam. No pay-to-bid. Clear workflows.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main HomePage
// ═══════════════════════════════════════════════════════════════
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
