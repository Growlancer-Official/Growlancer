import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { validateEmail } from '../../utils/validation';

export function MagicLinkPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const validation = validateEmail(normalizedEmail);
    if (!validation.isValid) {
      setError(validation.error || 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?type=magiclink`,
        },
      });

      if (otpError) {
        setError(otpError.message);
      } else {
        setSent(true);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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

            {!sent ? (
              <>
                <div className="text-center mb-6">
                  <div className="flex justify-center mb-3">
                    <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-orange-600" />
                    </div>
                  </div>
                  <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">
                    Passwordless sign in
                  </h1>
                  <p className="text-sm text-slate-500">
                    We'll send you a magic link. Click it to sign in instantly — no password needed.
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

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 bg-orange-600 text-white font-semibold rounded-xl shadow-lg shadow-orange-600/25 hover:bg-orange-700 hover:shadow-xl hover:shadow-orange-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <span>Sending magic link...</span>
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </>
                    ) : (
                      'Send Magic Link'
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center space-y-2">
                  <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <p className="text-xs text-slate-400">
                    Or{' '}
                    <Link to="/login" className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors">
                      sign in with password
                    </Link>
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center animate-fade-in">
                <div className="flex justify-center mb-4">
                  <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                  Magic link sent!
                </h2>
                <p className="text-sm text-slate-500 mb-6">
                  Check your inbox at{' '}
                  <span className="font-semibold text-slate-700">{email}</span>
                  <br />
                  Click the link to sign in instantly.
                </p>
                <p className="text-xs text-slate-400 mb-6">
                  Didn't receive the email? Check your spam folder, or{' '}
                  <button
                    onClick={() => { setSent(false); setEmail(''); }}
                    className="text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
                  >
                    try again
                  </button>
                </p>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
                >
                  Back to Login
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
