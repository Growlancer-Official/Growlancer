import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Briefcase,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';

import { supabase, clearSupabaseAuthStorage, isStaleSessionError } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { validateEmail, validatePassword, validateRequired, getPasswordStrength } from '../utils/validation';
import { Modal } from './Modal';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
  initialRole?: 'freelancer' | 'client';
}

export function SignupModal({ isOpen, onClose, onSwitchToLogin, initialRole }: SignupModalProps) {
  const navigate = useNavigate();
  const { signup, signInWithOAuth } = useAuth();

  // Capture referral code from URL params (?ref=GRW-FR-XXXX)
  const referralCodeFromUrl = (() => {
    try {
      return new URLSearchParams(window.location.search).get('ref') || null;
    } catch {
      return null;
    }
  })();

  const [role, setRole] = useState<'freelancer' | 'client' | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(referralCodeFromUrl || '');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [oauthProvider, setOauthProvider] = useState<'github' | 'linkedin' | null>(null);
  const [existingUser, setExistingUser] = useState(false);

  // Sync role from initialRole when modal opens (only if explicitly provided via URL)
  useEffect(() => {
    if (isOpen && initialRole) {
      setRole(initialRole);
    } else if (isOpen && !initialRole) {
      setRole(null);
    }
  }, [isOpen, initialRole]);

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

  // Real-time email validation
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (value) {
      const validation = validateEmail(value);
      setEmailError(validation.isValid ? null : validation.error || 'Invalid email');
    } else {
      setEmailError(null);
    }
  };

  // Real-time password strength
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setPasswordStrength(getPasswordStrength(value));
    if (value) {
      const validation = validatePassword(value);
      setPasswordError(validation.isValid ? null : validation.error || 'Weak password');
    } else {
      setPasswordError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    // ✅ Role selection validation — must explicitly choose
    if (!role) {
      setError('Please select whether you want to work as a freelancer or hire talent.');
      return;
    }

    const nameValidation = validateRequired(normalizedName, 'Full name');
    if (!nameValidation.isValid) {
      setError(nameValidation.error || 'Full name is required');
      return;
    }

    // India-only phone validation
    const cleanedPhone = phone.replace(/[^0-9]/g, '');
    if (cleanedPhone.length !== 10) {
      setError('Please enter a valid 10-digit Indian phone number (+91)');
      return;
    }
    if (!cleanedPhone.startsWith('6') && !cleanedPhone.startsWith('7') && !cleanedPhone.startsWith('8') && !cleanedPhone.startsWith('9')) {
      setError('Please enter a valid Indian mobile number starting with 6, 7, 8, or 9');
      return;
    }

    const emailValidation = validateEmail(normalizedEmail);
    if (!emailValidation.isValid) {
      setError(emailValidation.error || 'Invalid email');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setError(passwordValidation.error || 'Weak password');
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await signup(normalizedEmail, password, normalizedName, role, referralCode.trim() || undefined);

    if (result.success) {
      // ✅ Account created — either auto-logged-in (dashboard) or verification required (verify-email page)
      onClose();
      setIsLoading(false);
      if (result.needsVerification) {
        // 📧 Real email verification is ON — guide user to their inbox
        setTimeout(() => {
          navigate(`/auth/verify-email?email=${encodeURIComponent(normalizedEmail)}`, { replace: true });
        }, 100);
      } else {
        const dashboardPath = role === 'client' ? '/client' : '/dashboard';
        setTimeout(() => {
          navigate(dashboardPath, { replace: true });
        }, 100);
      }
      return;
    } else {
      setError(result.error || 'Signup failed');
    }
    setIsLoading(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create your account">
      {/* Subtle Background Decorations */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/50 rounded-full blur-2xl -mr-12 -mt-12 opacity-60 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-100/50 rounded-full blur-2xl -ml-12 -mb-12 opacity-60 pointer-events-none"></div>

      <div className="relative animate-fade-in-content">
        <p className="text-slate-500 mb-5 text-sm">
          Join thousands of professionals already using AI to ship faster.
        </p>

        {/* ⚠️ Existing Session Banner — Dismissible, NOT blocking */}
        {existingUser && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">Already logged in</p>
                <p className="text-[11px] text-amber-600 leading-relaxed">
                  You can still create a new account below. Logging out first is recommended.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => { onClose(); navigate(role === 'client' ? '/client' : '/dashboard'); }}
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
                  <X className="w-3.5 h-3.5 text-amber-500" />
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
                ← Log out &amp; create a new account
              </button>
            </div>
          </div>
        )}

        {/* Social Auth — GitHub & LinkedIn */}
        <div className="mb-5 space-y-3">
          <button
            type="button"
            disabled={!!oauthProvider}
            onClick={async () => {
              setError(null);
              setOauthProvider('github');
              // 🆕 Save selected role to localStorage before OAuth redirect
              localStorage.setItem('growlancer_oauth_role', role || 'freelancer');
              const result = await signInWithOAuth('github');
              setOauthProvider(null);
              if (!result.success) setError(result.error || 'GitHub sign in failed. Make sure GitHub is configured in the Supabase Dashboard.');
            }}
            className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {oauthProvider === 'github' ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
              // 🆕 Save selected role to localStorage before OAuth redirect
              localStorage.setItem('growlancer_oauth_role', role || 'freelancer');
              const result = await signInWithOAuth('linkedin_oidc');
              setOauthProvider(null);
              if (!result.success) setError(result.error || 'LinkedIn sign in failed. Make sure LinkedIn is configured in the Supabase Dashboard.');
            }}
            className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {oauthProvider === 'linkedin' ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role Selection */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1">
              I want to...
            </label>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <label
                className={`cursor-pointer flex items-center gap-2 sm:gap-2.5 p-2.5 sm:p-3.5 border-2 rounded-xl transition-all min-w-0 ${
                  role === 'freelancer'
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-500/10'
                    : role === null
                    ? 'border-slate-200 hover:border-orange-300 bg-slate-50/50 hover:bg-orange-50/30'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-100/50'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="freelancer"
                  checked={role === 'freelancer'}
                  onChange={() => setRole('freelancer')}
                  className="sr-only"
                />
                <div className={`shrink-0 flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-lg border ${
                  role === 'freelancer'
                    ? 'bg-emerald-100 border-emerald-200 text-emerald-600'
                    : role === null
                    ? 'bg-white border-orange-200 text-slate-400'
                    : 'bg-white border-slate-200 text-slate-400'
                } transition-all`}>
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">Freelance</span>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 hidden sm:block truncate">Work & earn</span>
                </div>
              </label>
              <label
                className={`cursor-pointer flex items-center gap-2 sm:gap-2.5 p-2.5 sm:p-3.5 border-2 rounded-xl transition-all min-w-0 ${
                  role === 'client'
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-500/10'
                    : role === null
                    ? 'border-slate-200 hover:border-orange-300 bg-slate-50/50 hover:bg-orange-50/30'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-100/50'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="client"
                  checked={role === 'client'}
                  onChange={() => setRole('client')}
                  className="sr-only"
                />
                <div className={`shrink-0 flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-lg border ${
                  role === 'client'
                    ? 'bg-emerald-100 border-emerald-200 text-emerald-600'
                    : role === null
                    ? 'bg-white border-orange-200 text-slate-400'
                    : 'bg-white border-slate-200 text-slate-400'
                } transition-all`}>
                  <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">Hire Talent</span>
                  <span className="text-[10px] sm:text-[11px] text-slate-400 hidden sm:block truncate">Find & hire</span>
                </div>
              </label>
            </div>
            {role === null && (
              <p className="text-[11px] text-orange-500 font-medium ml-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Please select a role to continue
              </p>
            )}
          </div>

          {/* Full Name Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="full-name"
              className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1"
            >
              Full Name
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <User className="w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              </div>
              <input
                type="text"
                id="full-name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
                placeholder="Your full name"
                className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl outline-none transition-all text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>
          </div>

          {/* Email Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1"
            >
              Work Email
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Mail className={`w-4 h-4 transition-colors ${
                  emailError ? 'text-red-400' : 'text-slate-400 group-focus-within:text-emerald-500'
                }`} />
              </div>
              <input
                type="email"
                id="email"
                value={email}
                onChange={handleEmailChange}
                required
                autoComplete="email"
                placeholder="you@company.com"
                className={`w-full h-11 pl-10 pr-4 bg-white border rounded-xl outline-none transition-all text-sm focus:ring-2 ${
                  emailError 
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' 
                    : 'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/10'
                }`}
              />
              {email && !emailError && (
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
              )}
            </div>
            {emailError && (
              <p className="text-[11px] text-red-500 ml-1">{emailError}</p>
            )}
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
              <span className={`text-[10px] font-semibold uppercase ${
                passwordStrength === 0 ? 'text-slate-400' :
                passwordStrength <= 2 ? 'text-red-500' :
                passwordStrength <= 3 ? 'text-orange-500' :
                'text-emerald-500'
              }`}>
                {passwordStrength === 0 ? 'Enter password' :
                 passwordStrength <= 2 ? 'Weak' :
                 passwordStrength <= 3 ? 'Medium' :
                 'Strong'}
              </span>
            </div>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Lock className="w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={handlePasswordChange}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className={`w-full h-11 pl-10 pr-10 bg-white border rounded-xl outline-none transition-all text-sm focus:ring-2 ${
                  passwordError ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' :
                  passwordStrength >= 4 ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/10' :
                  'border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/10'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Password Strength Bar */}
            <div className="flex gap-1 mt-1.5 px-1">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${
                    index < passwordStrength
                      ? passwordStrength <= 2
                        ? 'bg-red-500'
                        : passwordStrength <= 3
                        ? 'bg-orange-500'
                        : 'bg-emerald-500'
                      : 'bg-slate-100'
                  }`}
                />
              ))}
            </div>
            {passwordError && (
              <p className="text-[11px] text-red-500 mt-1">{passwordError}</p>
            )}
          </div>

          {/* Phone Number — India only (+91) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1">
              Phone Number
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <span className="text-sm font-semibold text-slate-500">+91</span>
              </div>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={e => {
                  const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                  setPhone(val);
                }}
                required
                autoComplete="tel"
                placeholder="9876543210"
                className="w-full h-11 pl-12 pr-4 bg-white border border-slate-200 rounded-xl outline-none transition-all text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>
    <p className="text-[10px] text-slate-400 ml-1">
      India only (<strong>+91</strong>). Other countries coming soon.
    </p>
          </div>

          {/* Referral Code (Optional) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1">
              Referral Code <span className="text-slate-300 normal-case">(optional)</span>
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <input
                type="text"
                id="referral-code"
                value={referralCode}
                onChange={e => setReferralCode(e.target.value)}
                autoComplete="off"
                placeholder="Enter referral code (e.g. GRW-FR-XXXX)"
                className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl outline-none transition-all text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
              />
            </div>
            <p className="text-[10px] text-slate-400 ml-1">Have a referral code? Paste it here to earn rewards for both you and the person who invited you.</p>
          </div>

          {/* Terms Checkbox */}
          <div className="flex items-start gap-2 py-1">
            <input
              type="checkbox"
              id="terms"
              required
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <label htmlFor="terms" className="text-[11px] text-slate-500 leading-normal">
              By creating an account, you agree to our{' '}
              <button
                type="button"
                className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
              >
                Terms of Service
              </button>{' '}
              and{' '}
              <button
                type="button"
                className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
              >
                Privacy Policy
              </button>
              .
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <p className="text-[11px] text-red-600 font-medium">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 mt-2 group disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <span>Creating Account...</span>
                <Loader2 className="w-4 h-4 animate-spin" />
              </>
            ) : (
              <>
                <span>Create Account</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* Login Redirect */}
        <div className="mt-5 text-center">
          <p className="text-slate-600 text-sm">
            Already have an account?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-emerald-600 font-semibold hover:text-emerald-700 transition-all duration-200 hover:scale-105"
            >
              Log in here
            </button>
          </p>
        </div>
      </div>
    </Modal>
  );
}
