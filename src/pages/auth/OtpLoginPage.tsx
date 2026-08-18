import { useState, useEffect, useRef, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Mail,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { validateEmail } from '../../utils/validation';

// ═══════════════════════════════════════════════════════════════
// OTP Login — Continue with OTP
// Email → receive 6-digit code → verify → login → correct dashboard.
// Features: countdown timer, resend with cooldown, attempt limit,
// rate limiting, full error handling.
// ═══════════════════════════════════════════════════════════════

const OTP_LENGTH = 6;
const OTP_ATTEMPT_LIMIT = 5;
const OTP_RESEND_COOLDOWN_S = 30;

export function OtpLoginPage() {
  const navigate = useNavigate();
  const { getDashboardRoute } = useAuth();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [phase, setPhase] = useState<'email' | 'otp' | 'verifying' | 'success' | 'error'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [sentEmail, setSentEmail] = useState('');
  const busyRef = useRef(false);

  // Resend cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendOtp = async (targetEmail: string, isResend = false) => {
    setLoading(true);
    setError(null);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        setError(
          otpError.message.includes('rate limit')
            ? 'Too many codes were sent recently. Please wait a few minutes before trying again.'
            : otpError.message.includes('not registered') || otpError.message.includes('not found')
              ? 'No account found with this email. Please sign up first.'
              : otpError.message
        );
        setPhase(isResend ? 'otp' : 'email');
        return;
      }

      setSentEmail(targetEmail);
      setCooldown(OTP_RESEND_COOLDOWN_S);
      setAttempts(0);
      setPhase('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the code. Please try again.');
      setPhase(isResend ? 'otp' : 'email');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const validation = validateEmail(normalizedEmail);
    if (!validation.isValid) {
      setError(validation.error || 'Please enter a valid email address');
      return;
    }
    sendOtp(normalizedEmail);
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);

    if (otp.trim().length !== OTP_LENGTH) {
      setError(`Please enter the ${OTP_LENGTH}-digit code.`);
      busyRef.current = false;
      return;
    }

    setPhase('verifying');
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: sentEmail,
        token: otp.trim(),
        type: 'email',
      });

      if (verifyError) {
        const left = OTP_ATTEMPT_LIMIT - attempts - 1;
        setError(
          left > 0
            ? `Invalid code. ${left} attempt${left === 1 ? '' : 's'} remaining.`
            : 'Too many incorrect attempts. Please request a new code later.'
        );
        setAttempts(a => a + 1);
        setPhase(left <= 0 ? 'error' : 'otp');
        busyRef.current = false;
        return;
      }

      // Success — session established. Resolve the correct dashboard by role.
      setPhase('success');

      // Try to log in / resolve profile through the auth context to get the role.
      const sessionUser = data?.user;
      if (sessionUser) {
        // Fetch the profile to determine the role, then redirect.
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', sessionUser.id)
          .maybeSingle();
        const { data: privProfile } = await supabase
          .from('profiles_private')
          .select('onboarding_completed')
          .eq('id', sessionUser.id)
          .maybeSingle();

        const role = profile?.role === 'client' ? 'client' : 'freelancer';
        const onboarding_completed = privProfile?.onboarding_completed ?? true;
        const path = onboarding_completed === false
          ? '/onboarding'
          : (role === 'client' ? '/client' : '/dashboard');

        setTimeout(() => {
          window.location.replace(path);
        }, 1200);
        return;
      }

      // Fallback: use the auth context dashboard route
      setTimeout(() => {
        window.location.replace(getDashboardRoute());
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
      setPhase('otp');
    } finally {
      busyRef.current = false;
    }
  };

  const handleResend = () => {
    setError(null);
    sendOtp(sentEmail, true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 relative overflow-hidden">
          {/* Background Decorations */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/50 rounded-full blur-2xl -mr-12 -mt-12 opacity-60 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-100/50 rounded-full blur-2xl -ml-12 -mb-12 opacity-60 pointer-events-none" />

          <div className="relative">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-12 w-12 rounded-xl" />
            </div>

            {phase === 'email' && (
              <>
                <div className="text-center mb-6">
                  <div className="flex justify-center mb-3">
                    <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <Mail className="w-6 h-6 text-emerald-600" />
                    </div>
                  </div>
                  <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">
                    Sign in with OTP
                  </h1>
                  <p className="text-sm text-slate-500">
                    We'll send a 6-digit code to your email. Enter it to sign in instantly.
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-600">{error}</p>
                  </div>
                )}

                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="otp-email"
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
                        id="otp-email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="you@company.com"
                        className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl outline-none transition-all text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <span>Sending code...</span>
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </>
                    ) : (
                      'Send OTP'
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center space-y-2">
                  <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <p className="text-xs text-slate-400">
                    Or{' '}
                    <Link to="/?modal=login" className="text-emerald-600 font-semibold hover:text-emerald-700">
                      sign in with password
                    </Link>
                  </p>
                </div>
              </>
            )}

            {phase === 'otp' && (
              <>
                <div className="text-center mb-6">
                  <div className="flex justify-center mb-3">
                    <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <KeyRound className="w-6 h-6 text-emerald-600" />
                    </div>
                  </div>
                  <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">
                    Enter your code
                  </h1>
                  <p className="text-sm text-slate-500">
                    We sent a 6-digit code to{' '}
                    <span className="font-semibold text-slate-700">{sentEmail}</span>
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-600">{error}</p>
                  </div>
                )}

                <form onSubmit={handleVerify} className="space-y-4">
                  <input
                    type="text"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="000000"
                    className="w-full h-14 px-4 text-center text-2xl font-mono tracking-[0.4em] bg-white border border-slate-200 rounded-xl outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  />

                  <button
                    type="submit"
                    disabled={otp.length !== OTP_LENGTH}
                    className="w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <ShieldCheck className="w-4 h-4" /> Verify & Sign In
                  </button>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Didn't get it?</span>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading || cooldown > 0}
                      className="font-semibold text-emerald-600 hover:text-emerald-700 disabled:text-slate-400"
                    >
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </button>
                  </div>
                </form>

                <div className="mt-6 text-center">
                  <button
                    onClick={() => { setPhase('email'); setOtp(''); setError(null); }}
                    className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Use a different email
                  </button>
                </div>
              </>
            )}

            {phase === 'verifying' && (
              <div className="text-center py-8">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto mb-4" />
                <p className="text-sm text-slate-500">Verifying your code...</p>
              </div>
            )}

            {phase === 'success' && (
              <div className="text-center py-6 animate-fade-in">
                <div className="flex justify-center mb-4">
                  <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                  Signed in successfully!
                </h2>
                <p className="text-sm text-slate-500">Taking you to your dashboard...</p>
              </div>
            )}

            {phase === 'error' && (
              <div className="text-center py-6">
                <div className="flex justify-center mb-4">
                  <div className="h-16 w-16 rounded-2xl bg-red-100 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                  </div>
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                  Too many attempts
                </h2>
                <p className="text-sm text-slate-500 mb-6">{error || 'Please try again later.'}</p>
                <button
                  onClick={() => { setPhase('email'); setOtp(''); setError(null); setAttempts(0); }}
                  className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
                >
                  Back to Login
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
