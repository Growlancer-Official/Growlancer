import { useState, useEffect } from 'react';
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
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { validateEmail, validatePassword, validateRequired, getPasswordStrength } from '../utils/validation';
import { Modal } from './Modal';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
  initialRole?: 'freelancer' | 'client';
}

export function SignupModal({ isOpen, onClose, onSwitchToLogin, initialRole = 'freelancer' }: SignupModalProps) {
  const { signup, signInWithOAuth } = useAuth();

  // Capture referral code from URL params (?ref=GRW-FR-XXXX)
  const referralCodeFromUrl = (() => {
    try {
      return new URLSearchParams(window.location.search).get('ref') || null;
    } catch {
      return null;
    }
  })();

  const [role, setRole] = useState<'freelancer' | 'client'>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(referralCodeFromUrl || '');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [oauthProvider, setOauthProvider] = useState<'google' | 'linkedin' | null>(null);
  const [existingUser, setExistingUser] = useState(false);
  const [showVerifyScreen, setShowVerifyScreen] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  // Check if there's already a session on this device
  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        setExistingUser(true);
      }
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
    setSuccessMessage(null);

    const result = await signup(normalizedEmail, password, normalizedName, role, referralCode.trim() || undefined);

    if (result.success) {
      setVerificationEmail(normalizedEmail);
      setShowVerifyScreen(true);
    } else {
      setError(result.error || 'Signup failed');
    }
    setIsLoading(false);
  };

  // Detect email provider for "Go to Inbox" button
  const getEmailProviderUrl = (email: string): string => {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail')) return 'https://mail.google.com';
    if (domain.includes('outlook') || domain.includes('hotmail')) return 'https://outlook.live.com';
    if (domain.includes('yahoo')) return 'https://mail.yahoo.com';
    if (domain.includes('proton')) return 'https://mail.proton.me';
    if (domain.includes('icloud')) return 'https://icloud.com/mail';
    if (domain.includes('aol')) return 'https://mail.aol.com';
    if (domain.includes('zoho')) return 'https://mail.zoho.com';
    if (domain.includes('yandex')) return 'https://mail.yandex.com';
    return 'https://mail.google.com'; // fallback
  };

  const getEmailProviderName = (email: string): string => {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail')) return 'Gmail';
    if (domain.includes('outlook')) return 'Outlook';
    if (domain.includes('hotmail')) return 'Hotmail';
    if (domain.includes('yahoo')) return 'Yahoo Mail';
    if (domain.includes('proton')) return 'Proton Mail';
    if (domain.includes('icloud')) return 'iCloud Mail';
    return 'your inbox';
  };

  const handleResendEmail = async () => {
    setResending(true);
    setResendMessage(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: verificationEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) {
        setResendMessage(error.message);
      } else {
        setResendMessage('Verification email resent! Check your inbox.');
      }
    } catch {
      setResendMessage('Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  // ── Verify Email Screen ──
  if (showVerifyScreen) {
    const providerUrl = getEmailProviderUrl(verificationEmail);
    const providerName = getEmailProviderName(verificationEmail);

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Verify your email">
        <div className="relative animate-fade-in-content">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Mail className="w-8 h-8 text-emerald-600" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Check your inbox</h2>
            <p className="text-sm text-slate-500">
              We sent a verification email to
            </p>
            <p className="text-sm font-semibold text-slate-900 mt-1">{verificationEmail}</p>
          </div>

          {/* Go to Inbox Button */}
          <a
            href={providerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all mb-4"
          >
            <ExternalLink className="w-5 h-5" />
            Open {providerName}
          </a>

          {/* Resend */}
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-2">Didn't receive the email?</p>
            <button
              onClick={handleResendEmail}
              disabled={resending}
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50"
            >
              {resending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {resending ? 'Sending...' : 'Resend verification email'}
            </button>
            {resendMessage && (
              <p className={`text-xs mt-2 ${resendMessage.includes('Failed') || resendMessage.includes('error') ? 'text-red-500' : 'text-emerald-600'}`}>
                {resendMessage}
              </p>
            )}
          </div>

          <div className="mt-6 p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <p className="text-[11px] text-amber-700 text-center">
              Please verify your email to access your dashboard. The link expires in 24 hours.
            </p>
          </div>

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <p className="text-slate-600 text-sm">
              Already verified?{' '}
              <button
                onClick={() => { onClose(); onSwitchToLogin(); }}
                className="text-emerald-600 font-semibold hover:text-emerald-700 transition-all"
              >
                Log in here
              </button>
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create your account">
      {/* Subtle Background Decorations */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/50 rounded-full blur-2xl -mr-12 -mt-12 opacity-60 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-100/50 rounded-full blur-2xl -ml-12 -mb-12 opacity-60 pointer-events-none"></div>

      <div className="relative animate-fade-in-content">
        <p className="text-slate-500 mb-5 text-sm">
          Join thousands of professionals already using AI to ship faster.
        </p>

        {/* Account Already Exists Alert */}
        {existingUser && (
          <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800 mb-1">Account already exists on this device</p>
                <p className="text-xs text-amber-700">
                  You already have an account on this device. Please log out first if you want to create a new account.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Social Auth — Google & LinkedIn */}
        <div className="mb-5 space-y-3">
          <button
            type="button"
            disabled={!!oauthProvider}
            onClick={async () => {
              setError(null);
              setOauthProvider('google');
              const result = await signInWithOAuth('google');
              setOauthProvider(null);
              if (!result.success) setError(result.error || 'Google sign in failed. Make sure Google is configured in the Supabase Dashboard.');
            }}
            className="w-full h-11 flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {oauthProvider === 'google' ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25C22.56 11.47 22.49 10.72 22.36 10H12V14.26H17.92C17.66 15.63 16.88 16.79 15.73 17.57V20.34H19.28C21.36 18.42 22.56 15.6 22.56 12.25Z" fill="#4285F4"/>
                <path d="M12 23C14.97 23 17.46 21.92 19.28 20.34L15.73 17.57C14.73 18.23 13.45 18.64 12 18.64C9.14 18.64 6.71 16.7 5.84 14.12H2.18V16.96C3.99 20.57 7.7 23 12 23Z" fill="#34A853"/>
                <path d="M5.84 14.12C5.62 13.46 5.49 12.75 5.49 12C5.49 11.25 5.62 10.54 5.84 9.88V7.04H2.18C1.43 8.54 1 10.23 1 12C1 13.77 1.43 15.46 2.18 16.96L5.84 14.12Z" fill="#FBBC05"/>
                <path d="M12 5.36C13.59 5.36 15 5.94 16.11 7L19.36 3.75C17.46 1.98 15 1 12 1C7.7 1 3.99 3.43 2.18 7.04L5.84 9.88C6.71 7.3 9.14 5.36 12 5.36Z" fill="#EA4335"/>
              </svg>
            )}
            {oauthProvider === 'google' ? 'Redirecting to Google...' : 'Continue with Google'}
          </button>
          <button
            type="button"
            disabled={!!oauthProvider}
            onClick={async () => {
              setError(null);
              setOauthProvider('linkedin');
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

        {/* Success Display */}
        {successMessage && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <p className="text-xs text-emerald-600">{successMessage}</p>
          </div>
        )}

        {/* Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role Selection */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1">
              I want to...
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`cursor-pointer flex flex-col items-center justify-center p-3 border-2 rounded-xl transition-all ${
                  role === 'freelancer'
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
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
                <User
                  className={`w-4 h-4 mb-1 ${role === 'freelancer' ? 'text-emerald-600' : 'text-slate-400'}`}
                />
                <span className="text-xs font-semibold">Freelance</span>
              </label>
              <label
                className={`cursor-pointer flex flex-col items-center justify-center p-3 border-2 rounded-xl transition-all ${
                  role === 'client'
                    ? 'border-emerald-500 bg-emerald-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
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
                <Briefcase
                  className={`w-4 h-4 mb-1 ${role === 'client' ? 'text-emerald-600' : 'text-slate-400'}`}
                />
                <span className="text-xs font-semibold">Hire Talent</span>
              </label>
            </div>
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
