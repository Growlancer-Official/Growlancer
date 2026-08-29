import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { supabase, clearSupabaseAuthStorage, isStaleSessionError } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getPostAuthPath } from '../lib/authAction';
import { validateEmail, validateRequired } from '../utils/validation';
import { Modal } from './Modal';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignup: () => void;
}

export function LoginModal({ isOpen, onClose, onSwitchToSignup }: LoginModalProps) {
  const navigate = useNavigate();
  const { login, signInWithOAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthProvider, setOauthProvider] = useState<'github' | 'linkedin' | null>(null);
  const [existingUser, setExistingUser] = useState(false);

  // Check if there's already a VALID session on this device.
  // Uses getUser() (server-validated) instead of getSession() (localStorage
  // only) — a stale token for a deleted user would otherwise show the
  // "Already logged in" banner forever. Dead sessions are force-cleared.
  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return;
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (isStaleSessionError(userError)) {
        // 🔥 Stale session for a deleted user — clear it so it stops blocking auth.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        clearSupabaseAuthStorage();
        setExistingUser(false);
        return;
      }
      if (userError || !userData?.user) return; // transient network — don't show banner
      setExistingUser(true);
    }
    checkSession();
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();

    const emailValidation = validateEmail(normalizedEmail);
    if (!emailValidation.isValid) {
      setError(emailValidation.error || 'Invalid email');
      return;
    }

    const passwordValidation = validateRequired(password, 'Password');
    if (!passwordValidation.isValid) {
      setError(passwordValidation.error || 'Password is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await login(normalizedEmail, password);

      if (result.success && result.role) {
        // 🎯 Use the SAME post-auth destination rules as the email-verify flow
        // (getPostAuthPath from lib/authAction — role-specific onboarding when
        // incomplete, role dashboard when complete). Login must land on exactly
        // the same onboarding screen the email-confirm flow shows — never a
        // "different onboarding" — so both paths are always consistent.
        const redirectPath = getPostAuthPath({
          role: result.role,
          onboardingCompleted: result.onboardingNeeded ? false : true,
        });
        
        // Close modal and navigate with a small delay to ensure cleanup
        onClose();
        setIsLoading(false);
        
        // Use setTimeout to ensure modal is fully unmounted before navigation
        setTimeout(() => {
          navigate(redirectPath, { replace: true });
        }, 100);
      } else {
        setError(
          (result.error || 'Login failed. Please check your credentials.') +
            ' No account yet? Click "Sign up here" below.'
        );
        setIsLoading(false);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Welcome back">
      {/* Subtle Background Decorations */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/50 rounded-full blur-2xl -mr-12 -mt-12 opacity-60 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-100/50 rounded-full blur-2xl -ml-12 -mb-12 opacity-60 pointer-events-none"></div>

      <div className="relative animate-fade-in-content">
        <p className="text-slate-500 mb-2.5 text-sm">Log in to your dashboard to manage your projects.</p>

        {/* ⚠️ Existing Session Banner — Dismissible, NOT blocking */}
        {existingUser && (
          <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">Already logged in</p>
                <p className="text-xs text-amber-600 leading-relaxed">
                  You can still log in with a different account below.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { onClose(); navigate('/dashboard'); }}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline px-2 py-1"
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    onClose();
                    await supabase.auth.signOut().catch(() => {});
                    clearSupabaseAuthStorage();
                    window.location.href = '/';
                  }}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline px-2 py-1"
                >
                  Logout
                </button>
                <button
                  type="button"
                  onClick={() => setExistingUser(false)}
                  className="p-1 rounded-lg hover:bg-amber-100 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4 text-amber-500" />
                </button>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-amber-200/50">
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut().catch(() => {});
                  clearSupabaseAuthStorage();
                  setExistingUser(false);
                }}
                className="w-full py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                ← Log out &amp; use a different account
              </button>
            </div>
          </div>
        )}

        {/* Social Auth — GitHub & LinkedIn */}
        <div className="mb-2.5 space-y-3">
          <button
            type="button"
            disabled={!!oauthProvider}
            onClick={async () => {
              setError(null);
              setOauthProvider('github');
              // 🆕 Clear any stale role from localStorage before login OAuth
              localStorage.removeItem('growlancer_oauth_role');
              const result = await signInWithOAuth('github');
              setOauthProvider(null);
              if (!result.success) setError(result.error || 'GitHub sign in failed. Make sure GitHub is configured in the Supabase Dashboard.');
            }}
            className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {oauthProvider === 'github' ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.48 2 2 6.58 2 12.22c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05.8-.23 1.65-.34 2.5-.34.85 0 1.7.11 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.48A10.25 10.25 0 0022 12.22C22 6.58 17.52 2 12 2z" fill="#24292E"/>
              </svg>
            )}
            {oauthProvider === 'github' ? 'Redirecting to GitHub...' : 'Continue with GitHub'}
          </button>
          <button
            type="button"
            disabled={!!oauthProvider}
            onClick={async () => {
              setError(null);
              setOauthProvider('linkedin');
              // 🆕 Clear any stale role from localStorage before login OAuth
              localStorage.removeItem('growlancer_oauth_role');
              const result = await signInWithOAuth('linkedin_oidc');
              setOauthProvider(null);
              if (!result.success) setError(result.error || 'LinkedIn sign in failed. Make sure LinkedIn is configured in the Supabase Dashboard.');
            }}
            className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {oauthProvider === 'linkedin' ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="20" height="20" rx="4" fill="#0A66C2"/>
                <path d="M8 10.5V17H5.5V10.5H8Z" fill="white"/>
                <path d="M6.75 8.75C6.06 8.75 5.5 8.19 5.5 7.5C5.5 6.81 6.06 6.25 6.75 6.25C7.44 6.25 8 6.81 8 7.5C8 8.19 7.44 8.75 6.75 8.75Z" fill="white"/>
                <path d="M14.5 17H12V13.5C12 12.67 11.33 12 10.5 12C9.67 12 9 12.67 9 13.5V17H6.5V10.5H9V11.3C9.63 10.62 10.7 10.15 11.75 10.15C13.5 10.15 14.5 11.35 14.5 13V17Z" fill="white"/>
              </svg>
            )}
            {oauthProvider === 'linkedin' ? 'Redirecting to LinkedIn...' : 'Continue with LinkedIn'}
          </button>
          <div className="relative flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">or continue with email</span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          {/* Passwordless login — Magic Link & OTP */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/auth/magic-link');
              }}
              className="w-full h-10 flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 shadow-sm"
            >
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Magic Link
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/auth/otp');
              }}
              className="w-full h-10 flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 shadow-sm"
            >
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 8a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
              OTP
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1"
            >
              Email Address
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Mail className="w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              </div>
              <input
                type="email"
                id="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl outline-none transition-all text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between ml-1">
              <label
                htmlFor="password"
                className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/auth/forgot-password');
                }}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Lock className="w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full h-11 pl-10 pr-10 bg-white border border-slate-200 rounded-xl outline-none transition-all text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-3 mt-2 group disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <span>Logging in...</span>
                <Loader2 className="w-4 h-4 animate-spin" />
              </>
            ) : (
              <>
                <span>Log In</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Signup Redirect */}
        <div className="mt-5 text-center">
          <p className="text-slate-600 text-sm">
            Don't have an account?{' '}
            <button
              onClick={onSwitchToSignup}
              className="text-emerald-600 font-semibold hover:text-emerald-700 transition-all duration-200 hover:scale-105"
            >
              Sign up here
            </button>
          </p>
        </div>
      </div>
    </Modal>
  );
}
