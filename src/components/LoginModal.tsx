import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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
        // Navigate based on role
        const dashboardRoute =
          result.role === 'freelancer'
            ? '/dashboard'
            : result.role === 'client'
              ? '/client'
              : result.role === 'admin'
                ? '/admin'
                : '/';
        
        // Close modal and navigate with a small delay to ensure cleanup
        onClose();
        setIsLoading(false);
        
        // Use setTimeout to ensure modal is fully unmounted before navigation
        setTimeout(() => {
          navigate(dashboardRoute, { replace: true });
        }, 100);
      } else {
        setError(result.error || 'Login failed. Please check your credentials.');
        setIsLoading(false);
      }
    } catch (err) {
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
        <p className="text-slate-500 mb-5 text-sm">Log in to your dashboard to manage your projects.</p>

        {/* Social Auth — Google & LinkedIn */}
        <div className="mb-5 space-y-3">
          <button
            type="button"
            onClick={() => signInWithOAuth('google')}
            className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25C22.56 11.47 22.49 10.72 22.36 10H12V14.26H17.92C17.66 15.63 16.88 16.79 15.73 17.57V20.34H19.28C21.36 18.42 22.56 15.6 22.56 12.25Z" fill="#4285F4"/>
              <path d="M12 23C14.97 23 17.46 21.92 19.28 20.34L15.73 17.57C14.73 18.23 13.45 18.64 12 18.64C9.14 18.64 6.71 16.7 5.84 14.12H2.18V16.96C3.99 20.57 7.7 23 12 23Z" fill="#34A853"/>
              <path d="M5.84 14.12C5.62 13.46 5.49 12.75 5.49 12C5.49 11.25 5.62 10.54 5.84 9.88V7.04H2.18C1.43 8.54 1 10.23 1 12C1 13.77 1.43 15.46 2.18 16.96L5.84 14.12Z" fill="#FBBC05"/>
              <path d="M12 5.36C13.59 5.36 15 5.94 16.11 7L19.36 3.75C17.46 1.98 15 1 12 1C7.7 1 3.99 3.43 2.18 7.04L5.84 9.88C6.71 7.3 9.14 5.36 12 5.36Z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => signInWithOAuth('linkedin_oidc')}
            className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="20" height="20" rx="4" fill="#0A66C2"/>
              <path d="M8 10.5V17H5.5V10.5H8Z" fill="white"/>
              <path d="M6.75 8.75C6.06 8.75 5.5 8.19 5.5 7.5C5.5 6.81 6.06 6.25 6.75 6.25C7.44 6.25 8 6.81 8 7.5C8 8.19 7.44 8.75 6.75 8.75Z" fill="white"/>
              <path d="M14.5 17H12V13.5C12 12.67 11.33 12 10.5 12C9.67 12 9 12.67 9 13.5V17H6.5V10.5H9V11.3C9.63 10.62 10.7 10.15 11.75 10.15C13.5 10.15 14.5 11.35 14.5 13V17Z" fill="white"/>
            </svg>
            Continue with LinkedIn
          </button>
          <div className="relative flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">or continue with email</span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
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
              className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1"
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
                className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
              >
                Password
              </label>
              <button
                type="button"
                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
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
            className="w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 mt-2 group disabled:opacity-70 disabled:cursor-not-allowed"
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
