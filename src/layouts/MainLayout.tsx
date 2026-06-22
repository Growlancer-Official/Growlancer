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
      // Remove param from URL
      navigate(location.pathname, { replace: true });
    } else if (modal === 'signup') {
      if (roleParam) setSignupRole(roleParam);
      setIsSignupModalOpen(true);
      // Remove param from URL
      navigate(location.pathname, { replace: true });
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
                src="/Growlancer Logo (2).png" 
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
              <Link to={ROUTES.HOW_IT_WORKS} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors">How it works</Link>
              <Link to={ROUTES.CATEGORIES} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors">Categories</Link>
              <Link to={ROUTES.FEATURES} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors">Features</Link>
              <Link to={ROUTES.PRICING} className="px-3 py-2 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors">Pricing</Link>
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
        <div className="lg:hidden fixed inset-x-0 top-16 z-40 bg-white border-b border-slate-200 shadow-lg">
          <nav className="px-4 py-4 space-y-1">
            <Link
              to={ROUTES.HOW_IT_WORKS}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              How it works
            </Link>
            <Link
              to={ROUTES.CATEGORIES}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              Categories
            </Link>
            <Link
              to={ROUTES.FEATURES}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              Features
            </Link>
            <Link
              to={ROUTES.PRICING}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              Pricing
            </Link>
            <div className="border-t border-slate-100 my-3"></div>
            {!isAuthenticated ? (
              <>
                <button
                  onClick={handleOpenLogin}
                  className="w-full text-left block px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                >
                  Login
                </button>
                <button
                  onClick={() => handleOpenSignup()}
                  className="w-full text-left block px-4 py-3 rounded-lg text-base font-medium text-slate-900 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  Signup
                </button>
              </>
            ) : (
              <Link
                to={role === 'client' ? '/client' : role === 'admin' ? '/admin' : '/dashboard'}
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-3 rounded-lg text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
              >
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
