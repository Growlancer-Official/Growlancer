import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, LayoutDashboard } from 'lucide-react';
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
  const [signupRole, setSignupRole] = useState<'freelancer' | 'client'>('freelancer');
  const { isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
    if (role) setSignupRole(role);
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
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between gap-3">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <img 
                src="/UpdatedLogo.png" 
                alt="Growlancer" 
                className="h-9 w-9 rounded-xl"
              />
              <div className="leading-tight">
                <div className="font-semibold tracking-tight text-[15px] sm:text-base font-display">Growlancer</div>
                <div className="text-xs text-slate-500 -mt-0.5">AI freelancing marketplace</div>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-1 text-sm text-slate-600">
              <Link to={ROUTES.HOW_IT_WORKS} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium">How it works</Link>
              <Link to={ROUTES.CATEGORIES} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium">Categories</Link>
              <Link to={ROUTES.FEATURES} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium">Features</Link>
              <Link to={ROUTES.PRICING} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium">Pricing</Link>
              <Link to={ROUTES.INTERNSHIPS} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium">Internships</Link>
              <Link to={ROUTES.ABOUT} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium">About</Link>
              <Link to={ROUTES.CONTACT} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium">Contact</Link>
              <Link to={ROUTES.HELP_CENTER} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors font-medium">Help</Link>
            </nav>

            {/* Right actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {!isAuthenticated && (
                <>
                  <button onClick={handleOpenLogin} className="hidden sm:inline-flex items-center justify-center h-10 px-3 rounded-lg text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">Login</button>
                  <button onClick={() => handleOpenSignup()} className="inline-flex items-center justify-center h-10 px-3 rounded-lg text-sm font-medium text-slate-900 ring-1 ring-slate-200 bg-white hover:bg-slate-50 transition-colors">Signup</button>
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
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden inline-flex items-center justify-center h-10 w-10 rounded-lg ring-1 ring-slate-200 bg-white hover:bg-slate-50 transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="text-slate-700 w-5 h-5" /> : <Menu className="text-slate-700 w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Panel */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-16 z-40 bg-white border-b border-slate-200 shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto">
          <nav className="px-4 py-4 space-y-1">
            {/* Main Navigation */}
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 pb-1 pt-2">Browse</div>
            <Link to={ROUTES.HOW_IT_WORKS} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              How it works
            </Link>
            <Link to={ROUTES.CATEGORIES} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              Categories
            </Link>
            <Link to={ROUTES.FEATURES} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              Features
            </Link>
            <Link to={ROUTES.PRICING} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Pricing
            </Link>

            <div className="border-t border-slate-100 my-3"></div>

            {/* Company */}
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 pb-1 pt-2">Company</div>
            <Link to={ROUTES.ABOUT} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              About
            </Link>
            <Link to={ROUTES.INTERNSHIPS} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Internships
            </Link>
            <Link to={ROUTES.CONTACT} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Contact
            </Link>
            <Link to={ROUTES.HELP_CENTER} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Help Center
            </Link>

            <div className="border-t border-slate-100 my-3"></div>

            {/* Auth */}
            {!isAuthenticated ? (
              <>
                <button onClick={handleOpenLogin} className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                  Login
                </button>
                <button onClick={() => handleOpenSignup()} className="flex items-center gap-2 w-full text-left px-4 py-3 rounded-lg text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors mt-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                  Sign Up Free
                </button>
              </>
            ) : (
              <Link to={role === 'client' ? '/client' : role === 'admin' ? '/admin' : '/dashboard'} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                Dashboard
              </Link>
            )}
          </nav>
        </div>
      )}

      <main>
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
