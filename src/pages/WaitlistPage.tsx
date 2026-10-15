import { useState } from 'react';
import { Mail, Clock, Globe, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { validateEmail } from '../utils/validation';

/**
 * Waitlist page for visitors from countries where Growlancer is not yet live.
 *
 * Design intent (v2, replaces the old static placeholder): the previous version
 * had NO input form at all and hardcoded "You're on the waitlist!" — telling
 * non-India visitors they were subscribed without ever collecting their email.
 * This version captures the email (server-validated via the same
 * `newsletter-subscribe` edge function the homepage form uses, which records
 * the waitlist row {name, email, country} server-side) and only then shows a
 * truthful success state.
 */
export function WaitlistPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required to join the waitlist.');
      return;
    }
    // 🚫 Disposable / temp emails rejected client-side; the edge function
    // re-checks server-side (single source of truth).
    const emailValidation = validateEmail(email.trim().toLowerCase());
    if (!emailValidation.isValid) {
      setError(emailValidation.error || 'Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('newsletter-subscribe', {
        method: 'POST',
        body: { email: email.trim(), name: '', country: null },
      });

      let serverMessage: string | null = null;
      if (fnError && (fnError as { context?: Response }).context) {
        try {
          const ctx = (fnError as { context?: Response }).context;
          if (ctx) {
            const body = (await ctx.json()) as { error?: string };
            serverMessage = body?.error ?? null;
          }
        } catch {
          // Non-JSON error body — fall through to the generic message.
        }
      }

      if (fnError || !data?.success) {
        setError(serverMessage || 'Could not join the waitlist right now. Please try again.');
        return;
      }
      setSubscribed(true);
    } catch (err) {
      console.error('Waitlist subscribe failed:', err);
      setError('Something went wrong. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 md:p-12 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-3">
            <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <Globe className="w-10 h-10 text-white" />
            </div>
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-3">
            <img
              src="/UpdatedLogo.webp"
              alt="Growlancer"
              className="h-12 w-12 rounded-xl"
            />
          </div>

          <h1 className="font-display text-2xl md:text-3xl font-bold text-slate-900 mb-3">
            Coming Soon in Your Country 🚀
          </h1>

          <p className="text-slate-500 mb-8 leading-relaxed">
            Growlancer is currently available in <strong>India</strong> only.
            We are working hard to expand to other countries and would love
            to keep you updated on our launch progress.
          </p>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <Clock className="w-6 h-6 text-emerald-600 mb-2 mx-auto" />
              <h2 className="text-sm font-bold text-slate-900 mb-1">Early Access</h2>
              <p className="text-xs text-slate-500">
                Be among the first to know when we launch in your country
              </p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <Mail className="w-6 h-6 text-emerald-600 mb-2 mx-auto" />
              <h2 className="text-sm font-bold text-slate-900 mb-1">Launch Updates</h2>
              <p className="text-xs text-slate-500">
                Get notified via email when your country is supported
              </p>
            </div>
          </div>

          {subscribed ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-8">
              <p className="text-sm text-amber-800">
                <strong className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  You're on the waitlist!
                </strong>{' '}
                We'll notify you at <strong>{email.trim()}</strong> as soon as
                Growlancer becomes available in your country. No action needed
                from you right now.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mb-8" noValidate>
              <label htmlFor="waitlist-email" className="block text-sm font-semibold text-slate-700 mb-1.5 text-left">
                Email address <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                type="email"
                id="waitlist-email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
                aria-describedby={error ? 'waitlist-email-error' : undefined}
                className="w-full h-12 px-4 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
              />
              {error && (
                <p id="waitlist-email-error" role="alert" className="mt-2 text-xs text-red-600 text-left">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="mt-3 w-full inline-flex items-center justify-center gap-3 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    Notify Me at Launch
                    <Mail className="w-4 h-4" />
                  </>
                )}
              </button>
              <p className="mt-2 text-xs text-slate-400 text-left">No spam. Unsubscribe anytime.</p>
            </form>
          )}

          {/* Navigation */}
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-3 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; {new Date().getFullYear()} Growlancer. All rights reserved.
        </p>
      </div>
    </div>
  );
}
