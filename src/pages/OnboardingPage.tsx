import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle,
  FileText,
  LucideIcon,
  Navigation,
  Shield,
  Sparkles,
  User,
  Verified,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface Slide {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  features?: string[];
}

const FREELANCER_SLIDES: Slide[] = [
  {
    icon: User,
    title: 'Welcome to Growlancer',
    description: 'Join thousands of talented freelancers who trust Growlancer to find high-quality projects. Our platform connects you with clients worldwide, offering secure payments, AI-powered matching, and tools to grow your freelance business.',
    color: 'bg-emerald-100 text-emerald-600',
    features: ['Global client network', 'Verified payments', 'AI-powered job matching'],
  },
  {
    icon: FileText,
    title: 'Create Your Professional Profile',
    description: 'Your profile is your digital storefront. Add your skills, portfolio, certifications, and work history. Our AI will optimize your profile to attract the right clients and projects that match your expertise.',
    color: 'bg-blue-100 text-blue-600',
    features: ['Portfolio showcase', 'Skills verification', 'Certification badges', 'Client reviews'],
  },
  {
    icon: Sparkles,
    title: 'Smart Project Discovery',
    description: 'Stop wasting time on irrelevant job postings. Our AI analyzes your profile, preferences, and past work to recommend projects that perfectly match your skills, rate expectations, and availability. Get notified instantly when matching projects are posted.',
    color: 'bg-purple-100 text-purple-600',
    features: ['Personalized recommendations', 'Real-time alerts', 'Skill-based filtering', 'Rate matching'],
  },
  {
    icon: Shield,
    title: 'Protected Payments & Milestones',
    description: 'Never worry about getting paid again. Our escrow system holds client funds securely until you complete agreed milestones. Track progress, submit deliverables, and receive payments automatically upon client approval. Withdraw earnings anytime.',
    color: 'bg-orange-100 text-orange-600',
    features: ['Secure escrow', 'Milestone tracking', 'Auto-release payments', 'Instant withdrawals'],
  },
  {
    icon: Wallet,
    title: 'Grow Your Earnings',
    description: 'Keep more of what you earn with our industry-low 5% platform fee. Upgrade to Pro for priority matching, 10x more proposals, exclusive high-budget projects, and dedicated support. Build long-term client relationships and scale your freelance career.',
    color: 'bg-emerald-100 text-emerald-600',
    features: ['5% platform fee', 'Pro: 10x proposals', 'High-budget projects', 'Priority support'],
  },
];

const CLIENT_SLIDES: Slide[] = [
  {
    icon: Briefcase,
    title: 'Welcome to Growlancer',
    description: 'Access a global network of pre-vetted freelance talent for your projects. From developers to designers, writers to marketers, find the perfect match for your needs. Our platform ensures quality, reliability, and seamless collaboration for businesses of all sizes.',
    color: 'bg-emerald-100 text-emerald-600',
    features: ['Pre-vetted talent', 'Global network', 'Quality guarantee', 'Fast hiring'],
  },
  {
    icon: FileText,
    title: 'Post Projects with AI Assistance',
    description: 'Describe your project requirements and let our AI help you create a comprehensive project brief. Get smart budget recommendations based on market rates, timeline estimates, and skill requirements. Attract qualified freelancers with clear, detailed project specifications.',
    color: 'bg-blue-100 text-blue-600',
    features: ['AI-powered briefs', 'Market-rate budgets', 'Timeline estimates', 'Skill requirements'],
  },
  {
    icon: Sparkles,
    title: 'Intelligent Talent Matching',
    description: 'Our AI analyzes your project requirements and matches you with freelancers who have the exact skills, experience, and availability you need. Review detailed portfolios, past client reviews, and verified credentials. Compare proposals side-by-side to make the best hiring decision.',
    color: 'bg-purple-100 text-purple-600',
    features: ['Skill-based matching', 'Portfolio reviews', 'Verified credentials', 'Proposal comparison'],
  },
  {
    icon: Shield,
    title: 'Secure Escrow & Milestone Management',
    description: 'Protect your investment with our secure escrow system. Funds are held safely and released only when you approve completed milestones. Track project progress in real-time, communicate seamlessly, and ensure deliverables meet your standards before payment.',
    color: 'bg-orange-100 text-orange-600',
    features: ['Secure escrow', 'Milestone tracking', 'Progress monitoring', 'Approval workflow'],
  },
  {
    icon: Wallet,
    title: 'Transparent Pricing & Value',
    description: 'Pay only a flat 5% platform fee with no hidden costs. Know exactly what you will pay before hiring. Access premium features with Pro membership including priority talent matching, dedicated account manager, and exclusive access to top-rated freelancers.',
    color: 'bg-emerald-100 text-emerald-600',
    features: ['5% platform fee', 'No hidden charges', 'Pro: Priority matching', 'Dedicated support'],
  },
];

export function OnboardingPage() {
  const { user, getDashboardRoute } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const isFreelancer = user?.role === 'freelancer';
  const slides = isFreelancer ? FREELANCER_SLIDES : CLIENT_SLIDES;

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentSlide(currentSlide + 1);
        setIsAnimating(false);
      }, 300);
    } else {
      completeOnboarding();
    }
  };

  const handleBack = () => {
    if (currentSlide > 0) {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentSlide(currentSlide - 1);
        setIsAnimating(false);
      }, 300);
    }
  };

  const handleSkip = () => {
    setShowSkipModal(true);
  };

  const confirmSkip = () => {
    completeOnboarding();
  };

  const completeOnboarding = async () => {
    // Mark onboarding as completed in database
    if (user?.id) {
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);
    }
    // Force a page reload to ensure the user state is updated
    window.location.href = getDashboardRoute();
  };

  const slide = slides[currentSlide];
  const progress = ((currentSlide + 1) / slides.length) * 100;
  const IconComponent = slide.icon;

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 group">
            <img src="/Growlancer Logo (2).png" alt="Growlancer" className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105" />
            <span className="font-display font-black text-xl tracking-tight text-slate-900">Growlancer</span>
          </div>
          <button
            onClick={handleSkip}
            className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors"
          >
            Skip
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-slate-100">
        <div
          className="h-full bg-emerald-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div
            className={`bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-slate-100 text-center transition-all duration-300 ${
              isAnimating ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
            }`}
          >
            {/* Animated Icon */}
            <div
              className={`inline-flex items-center justify-center h-24 w-24 rounded-3xl ${slide.color} mb-8 transition-all duration-500 hover:scale-110`}
            >
              <IconComponent className="w-12 h-12 animate-pulse" />
            </div>

            {/* Slide Counter */}
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
              Step {currentSlide + 1} of {slides.length}
            </p>

            {/* Title */}
            <h1 className="font-display text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              {slide.title}
            </h1>

            {/* Description */}
            <p className="text-slate-600 text-lg leading-relaxed mb-8 max-w-lg mx-auto">
              {slide.description}
            </p>

            {/* Features */}
            {slide.features && (
              <div className="flex flex-wrap justify-center gap-3 mb-8">
                {slide.features.map((feature, index) => (
                  <span
                    key={index}
                    className="px-4 py-2 bg-slate-50 text-slate-700 text-sm font-medium rounded-full border border-slate-200"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={handleBack}
                disabled={currentSlide === 0}
                className="flex items-center gap-2 px-6 py-3 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex gap-2">
                {slides.map((_, index) => (
                  <div
                    key={index}
                    className={`h-2 w-2 rounded-full transition-all duration-300 ${
                      index === currentSlide ? 'bg-emerald-500 w-6' : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-emerald-600/25"
              >
                {currentSlide === slides.length - 1 ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Get Started
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs text-slate-400">
            You can always access this information later from the Help Center
          </p>
        </div>
      </footer>

      {/* Skip Confirmation Modal */}
      {showSkipModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowSkipModal(false)}
          />
          <div className="relative bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-scale-in">
            <button
              onClick={() => setShowSkipModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>

            <div className="flex items-center justify-center w-16 h-16 bg-orange-100 rounded-2xl mb-6 mx-auto">
              <AlertTriangle className="w-8 h-8 text-orange-600" />
            </div>

            <h2 className="font-display text-2xl font-bold text-slate-900 text-center mb-3">
              Are you sure?
            </h2>

            <p className="text-slate-600 text-center mb-8 leading-relaxed">
              You are about to skip the onboarding tour. This guide contains valuable information about how to make the most of Growlancer. You can access it later from the Help Center.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSkipModal(false)}
                className="flex-1 px-6 py-3 text-slate-700 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Continue Tour
              </button>
              <button
                onClick={confirmSkip}
                className="flex-1 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
              >
                Skip Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
