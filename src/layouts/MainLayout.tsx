import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, LayoutDashboard, AlertTriangle, Briefcase, CircleDollarSign, HelpCircle, Info, LayoutGrid, LogIn, Mail, Package, Sparkles, Trophy, UserPlus, Users, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ROUTES } from '../routes';
import { useAuth } from '../context/AuthContext';
import { LoginModal } from '../components/LoginModal';
import { SignupModal } from '../components/SignupModal';
import { SiteFooter } from '../components/SiteFooter';

export function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);
  const [signupRole, setSignupRole] = useState<'freelancer' | 'client' | undefined>(undefined);
  const { isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Escape closes the mobile menu (Section-1G: every dismissible overlay must
  // close on Escape, not just the toggle button). No-op when menu is closed.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  // Check URL params to open modal on page load
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const modal = params.get('modal');
    const roleParam = params.get('role') as 'freelancer' | 'client' | null;

    if (modal === 'login') {
      setIsLoginModalOpen(true);
      // Clean URL params without triggering React Router navigation (prevents race conditions with lazy-loaded components)
      window.history.replaceState(null, '', location.pathname);
    } else if (modal === 'signup') {
      if (roleParam) setSignupRole(roleParam);
      setIsSignupModalOpen(true);
      // Clean URL params without triggering React Router navigation
      window.history.replaceState(null, '', location.pathname);
    }
  }, [location.search, location.pathname, navigate]);

  const handleOpenLogin = () => {
    setIsLoginModalOpen(true);
    setMobileMenuOpen(false);
  };

  const handleOpenSignup = (role?: 'freelancer' | 'client') => {
    if (role) {
      setSignupRole(role);
    } else {
      // 🆕 No role param → don't pre-select any role in SignupModal
      setSignupRole(undefined);
    }
    setIsSignupModalOpen(true);
    setMobileMenuOpen(false);
  };

  const handleCloseLogin = () => {
    setIsLoginModalOpen(false);
  };

  const handleCloseSignup = () => {
    setIsSignupModalOpen(false);
  };

  const handleSwitchToSignup = () => {
    setIsLoginModalOpen(false);
    setIsSignupModalOpen(true);
  };

  const handleSwitchToLogin = () => {
    setIsSignupModalOpen(false);
    setIsLoginModalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12">
          <div className="h-16 flex items-center justify-between gap-3">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group shrink-0">
              <img 
                src="/UpdatedLogo.webp" 
                alt="Growlancer" 
                className="h-9 w-9 rounded-xl"
              />
              <div className="leading-tight">
                <div className="font-semibold tracking-tight text-[15px] sm:text-base font-display flex items-center gap-1.5">Growlancer
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 ring-1 ring-amber-200 text-[9px] font-bold uppercase tracking-wide">Beta</span>
                </div>
                <div className="text-[10px] sm:text-xs text-slate-500 -mt-0.5">AI freelancing marketplace</div>
              </div>
            </Link>

            {/* Desktop nav — professional text like Upwork/Fiverr.
                ⚠️ `xl:flex`, NOT `lg:flex`: at the 1024px breakpoint this nav is
                918px wide and the header needs ~1258px total, so between
                1024px and ~1245px (iPad landscape, 11" iPad Pro, small laptop
                windows, split-screen) the nav was cut off AND the Login/Signup
                buttons were pushed off-screen (body overflow-x: clip hides
                them, so they were unclickable). The hamburger menu is complete
                and working, so 1024–1279px now uses it.
                `min-w-0 overflow-x-auto`: on wide-font environments (Linux/
                DejaVu system fonts) even 1280px was borderline — the nav now
                SHRINKS and scrolls inside its own track instead of pushing the
                Login/Signup buttons off-screen. Links are shrink-0 + nowrap so
                they never squish or wrap. */}
            <nav className="hidden xl:flex items-center gap-0.5 text-[11px] text-slate-600 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link to={ROUTES.HOW_IT_WORKS} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">How it works</Link>
              <Link to={ROUTES.CATEGORIES} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Categories</Link>
              <Link to={ROUTES.FREELANCERS} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Find Talent</Link>
              <Link to={ROUTES.SERVICES} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Services</Link>
              <Link to={ROUTES.CONTESTS} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Contests</Link>
              <Link to={ROUTES.FEATURES} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Features</Link>
              <Link to={ROUTES.PRICING} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Pricing</Link>
              <Link to={ROUTES.ABOUT} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">About</Link>
              <Link to={ROUTES.CONTACT} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Contact</Link>
              <Link to={ROUTES.HELP_CENTER} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Help</Link>
              <Link to={ROUTES.INTERNSHIPS} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Internships</Link>
              <Link to={ROUTES.PHILOSOPHY} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Philosophy</Link>
              <Link to={ROUTES.SAFETY} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Safety</Link>
              <Link to={ROUTES.GUIDELINES} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Guidelines</Link>
              <Link to={ROUTES.STATUS} className="px-2.5 py-1.5 rounded-md hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium whitespace-nowrap shrink-0">Status</Link>
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {!isAuthenticated && (
                <>
                  <button onClick={handleOpenLogin} className="hidden sm:inline-flex items-center justify-center h-10 px-3 rounded-lg text-sm font-medium text-slate-700 ring-1 ring-slate-200 bg-white hover:text-slate-900 hover:bg-slate-50 hover:ring-slate-300 transition-colors">Login</button>
                  <button onClick={() => handleOpenSignup()} className="inline-flex items-center justify-center h-10 px-3 rounded-lg text-sm font-semibold text-emerald-700 ring-2 ring-emerald-500 bg-white hover:bg-emerald-50 hover:ring-emerald-600 transition-colors shadow-sm">Signup</button>
                </>
              )}
              {isAuthenticated && (
                <Link 
                  to={role === 'client' ? '/client' : role === 'admin' ? '/admin' : '/dashboard'} 
                  className="inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <LayoutDashboard className="mr-2 w-4 h-4" />
                  Dashboard
                </Link>
              )}

              {/* Mobile menu button */}
              {/* 44×44 touch target (Apple HIG / WCAG 2.5.5). The negative
                  margin keeps the extra 4px from widening the header row at
                  320px, and the icon stays visually the same size. */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="xl:hidden inline-flex items-center justify-center h-11 w-11 -mr-1 rounded-lg ring-1 ring-slate-200 bg-white hover:bg-slate-50 transition-colors"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-nav-panel"
              >
                {mobileMenuOpen ? <X className="text-slate-700 w-5 h-5" /> : <Menu className="text-slate-700 w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Panel */}
      {mobileMenuOpen && (
        <div id="mobile-nav-panel" className="xl:hidden fixed inset-x-0 top-16 z-40 bg-white border-b border-slate-200 shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto">
          <nav className="px-4 py-4 space-y-1">
            {/* Main Navigation */}
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 pb-1 pt-2">Browse</div>
            <Link to={ROUTES.HOW_IT_WORKS} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <Zap className="w-4 h-4 text-slate-400" />
              How it works
            </Link>
            <Link to={ROUTES.CATEGORIES} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <LayoutGrid className="w-4 h-4 text-slate-400" />
              Categories
            </Link>
            <Link to={ROUTES.SERVICES} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <Package className="w-4 h-4 text-slate-400" />
              Services
            </Link>
            <Link to={ROUTES.FREELANCERS} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
              Freelancers
            </Link>
            <Link to={ROUTES.CONTESTS} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0" />
              Contests
            </Link>
            <Link to={ROUTES.FEATURES} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <Sparkles className="w-4 h-4 text-slate-400" />
              Features
            </Link>
            <Link to={ROUTES.PRICING} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <CircleDollarSign className="w-4 h-4 text-slate-400" />
              Pricing
            </Link>

            <div className="border-t border-slate-100 my-3"></div>

            {/* Company */}
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 pb-1 pt-2">Company</div>
            <Link to={ROUTES.ABOUT} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <Info className="w-4 h-4 text-slate-400" />
              About
            </Link>
            <Link to={ROUTES.INTERNSHIPS} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <Briefcase className="w-4 h-4 text-slate-400" />
              Internships
            </Link>
            <Link to={ROUTES.CONTACT} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <Mail className="w-4 h-4 text-slate-400" />
              Contact
            </Link>              <Link to={ROUTES.HELP_CENTER} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <HelpCircle className="w-4 h-4 text-slate-400" />
              Help Center
            </Link>
            <Link to="/report" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <AlertTriangle className="w-4 h-4 text-slate-400" />
              Report a Bug / Feedback
            </Link>

            <div className="border-t border-slate-100 my-3"></div>

            {/* Auth */}
            {!isAuthenticated ? (
              <>
                <button onClick={handleOpenLogin} className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                  <LogIn className="w-4 h-4 text-slate-400" />
                  Login
                </button>
                <button onClick={() => handleOpenSignup()} className="flex items-center gap-2 w-full text-left px-4 py-3 rounded-lg text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors mt-2">
                  <UserPlus className="w-4 h-4" />
                  Sign Up Free
                </button>
              </>
            ) : (
              <Link to={role === 'client' ? '/client' : role === 'admin' ? '/admin' : '/dashboard'} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
            )}
          </nav>
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>

      <SiteFooter onOpenSignup={handleOpenSignup} />

      {/* Modals */}
      <LoginModal 
        isOpen={isLoginModalOpen} 
        onClose={handleCloseLogin} 
        onSwitchToSignup={handleSwitchToSignup}
      />
      <SignupModal 
        isOpen={isSignupModalOpen} 
        onClose={handleCloseSignup} 
        onSwitchToLogin={handleSwitchToLogin}
        initialRole={signupRole}
      />
    </div>
  );
}
