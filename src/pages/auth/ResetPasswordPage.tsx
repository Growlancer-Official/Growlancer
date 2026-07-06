import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { validatePassword, getPasswordStrength } from '../../utils/validation';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState<boolean | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Check if we have a valid recovery session
  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if ((session as { user?: unknown } | null)?.user) {
        setValidSession(true);
      } else {
        // Try to detect recovery token from URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const type = hashParams.get('type');
        if (type === 'recovery') {
          // Supabase will auto-process this
          await new Promise(resolve => setTimeout(resolve, 1500));
          const { data: retrySession } = await supabase.auth.getSession();
          if ((retrySession as { user?: unknown } | null)?.user) {
            setValidSession(true);
          } else {
            setValidSession(false);
          }
        } else {
          setValidSession(false);
        }
      }
    }
    checkSession();
  }, []);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setPasswordStrength(getPasswordStrength(value));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validatePassword(password);
    if (!validation.isValid) {
      setError(validation.error || 'Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess(true);
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 3000);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (validSession === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] py-12 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-2xl bg-amber-100 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-amber-600" />
              </div>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
              Invalid or Expired Link
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <button
              onClick={() => navigate('/auth/forgot-password')}
              className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
            >
              Request New Reset Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (validSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] py-12 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              </div>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
              Verifying your reset link...
            </h2>
            <p className="text-sm text-slate-500">
              Please wait while we verify your password reset link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 relative overflow-hidden">
          {/* Background Decorations */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/50 rounded-full blur-2xl -mr-12 -mt-12 opacity-60 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-100/50 rounded-full blur-2xl -ml-12 -mb-12 opacity-60 pointer-events-none"></div>

          <div className="relative">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <img
                src="/UpdatedLogo.png"
                alt="Growlancer"
                className="h-12 w-12 rounded-xl"
              />
            </div>

            {!success ? (
              <>
                <div className="text-center mb-6">
                  <div className="flex justify-center mb-3">
                    <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <KeyRound className="w-6 h-6 text-emerald-600" />
                    </div>
                  </div>
                  <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">
                    Set new password
                  </h1>
                  <p className="text-sm text-slate-500">
                    Enter your new password below.
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-600">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* New Password */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="new-password"
                      className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1"
                    >
                      New Password
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="new-password"
                        value={password}
                        onChange={handlePasswordChange}
                        required
                        autoComplete="new-password"
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
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="confirm-password"
                      className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1"
                    >
                      Confirm New Password
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        id="confirm-password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className="w-full h-11 pl-10 pr-10 bg-white border border-slate-200 rounded-xl outline-none transition-all text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <span>Resetting password...</span>
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </>
                    ) : (
                      'Reset Password'
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center animate-fade-in">
                <div className="flex justify-center mb-4">
                  <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                  Password reset successfully!
                </h2>
                <p className="text-sm text-slate-500 mb-6">
                  Your password has been updated. Redirecting you to login...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
