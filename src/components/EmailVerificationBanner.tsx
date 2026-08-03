import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { MailCheck, MailWarning, Loader2 } from 'lucide-react';

/**
 * EmailVerificationBanner — recommends the user verify their email from Settings.
 *
 * Industry-standard behavior: an account should be email-verified, but OAuth users
 * (GitHub/LinkedIn) get email auto-confirmed by the provider and can defer any
 * app-level verification. Email/password users who skipped confirmation see this
 * banner until they verify. Applies to BOTH clients and freelancers — drop it in
 * any settings page.
 *
 * Renders nothing when the email is already confirmed.
 */
export function EmailVerificationBanner({ className = '' }: { className?: string }) {
  const { supabaseUser } = useAuth();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');

  const email = supabaseUser?.email;
  const emailConfirmed = !!supabaseUser?.email_confirmed_at;

  // Only render for logged-in users whose email isn't confirmed yet.
  if (emailConfirmed || !email) return null;

  const handleSend = async () => {
    setSending(true);
    setStatus('idle');
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setSending(false);
    setStatus(error ? 'error' : 'sent');
  };

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 ${className}`}
    >
      <span className="mt-0.5 shrink-0">
        {status === 'sent' ? (
          <MailCheck className="w-5 h-5 text-emerald-600" />
        ) : (
          <MailWarning className="w-5 h-5 text-amber-600" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          {status === 'sent' ? 'Verification link sent!' : 'Verify your email'}
        </p>
        <p className="text-xs text-amber-800 mt-0.5">
          {status === 'sent'
            ? `We've emailed a confirmation link to ${email}. Click it to activate your account — then all features (payments, contracts) unlock smoothly.`
            : `We've sent a confirmation link to ${email}. Click it to activate your account and unlock all features.`}
        </p>
        {status === 'error' && (
          <p className="text-xs text-red-600 mt-1">
            Couldn't send the link. Please try again in a minute.
          </p>
        )}
        {status !== 'sent' && (
          <button
            onClick={handleSend}
            disabled={sending}
            className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-xs font-semibold transition-colors"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {sending ? 'Sending...' : 'Send verification link'}
          </button>
        )}
      </div>
    </div>
  );
}
