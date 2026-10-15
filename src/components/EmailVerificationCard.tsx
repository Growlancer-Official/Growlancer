import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, Mail, MailCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface EmailVerificationCardProps {
  className?: string;
  /** Hide the address when the surrounding form already shows it. */
  showEmail?: boolean;
}

/**
 * EmailVerificationCard — the single place a signed-in user verifies their email.
 *
 * Industry-standard behaviour, and the reason this is a shared component:
 *  - the status is REAL-TIME: a confirmation clicked in another tab, browser or
 *    phone flips this card without a reload (auth listener + a bounded poll
 *    while unverified, same contract VerifyEmailPage uses);
 *  - the user can (re)send the verification email at any time;
 *  - the Supabase built-in email sender is rate-limited project-wide, so the
 *    429 is translated into a plain-language message instead of a raw error.
 *
 * OAuth users normally arrive already verified (GitHub/LinkedIn confirm the
 * address); an unverified case only happens when the provider could not assert
 * it, which is exactly when this card matters.
 */
export function EmailVerificationCard({ className = '', showEmail = true }: EmailVerificationCardProps) {
  const { supabaseUser } = useAuth();
  const email = supabaseUser?.email || '';
  const provider = supabaseUser?.app_metadata?.provider as string | undefined;

  const [confirmed, setConfirmed] = useState(!!supabaseUser?.email_confirmed_at);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stay in sync with the auth user (this tab or anywhere else).
  useEffect(() => {
    setConfirmed(!!supabaseUser?.email_confirmed_at);
  }, [supabaseUser?.email_confirmed_at, supabaseUser?.id]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setConfirmed(!!session.user.email_confirmed_at);
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  // Bounded real-time poll while unverified — catches a confirmation clicked in
  // another browser/device, where no auth event reaches this tab.
  useEffect(() => {
    if (confirmed || !email) return;
    const interval = setInterval(async () => {
      const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      if (data?.user?.email_confirmed_at) {
        setConfirmed(true);
        setMessage({ tone: 'ok', text: 'Email verified — thank you!' });
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [confirmed, email]);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  if (!email) return null;

  const startCooldown = () => {
    setCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleSend = async () => {
    setSending(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          // The confirm link lands on the "Email verified ✓" screen; GoTrue
          // appends the flow type itself, so no query suffix here.
          emailRedirectTo: `${window.location.origin}/auth/email-confirm`,
        },
      });
      if (error) {
        // The built-in email sender is rate-limited project-wide (a handful of
        // emails per hour) — say that in plain language, not a raw 429.
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          setMessage({
            tone: 'err',
            text: 'Too many verification emails were sent recently. Please wait a while and try again.',
          });
        } else {
          const providerHint =
            provider === 'github' || provider === 'linkedin_oidc'
              ? ` Your address comes from ${provider === 'github' ? 'GitHub' : 'LinkedIn'} — make sure it is verified there, then try again.`
              : '';
          setMessage({ tone: 'err', text: `${error.message}${providerHint}` });
        }
      } else {
        setMessage({
          tone: 'ok',
          text: `Verification email sent to ${email}. Open it and click the link — this status updates automatically.`,
        });
        startCooldown();
      }
    } catch {
      setMessage({ tone: 'err', text: 'Could not send the verification email. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const handleRecheck = async () => {
    setChecking(true);
    setMessage(null);
    try {
      const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      if (data?.user?.email_confirmed_at) {
        setConfirmed(true);
        setMessage({ tone: 'ok', text: 'Email verified — thank you!' });
      } else {
        setMessage({
          tone: 'err',
          text: 'Not verified yet. Open the verification email and click the link, then check again.',
        });
      }
    } finally {
      setChecking(false);
    }
  };

  if (confirmed) {
    return (
      <div className={`rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-start gap-3 ${className}`}>
        <MailCheck className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-emerald-900">Email verified</p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium">
              <Check className="w-3.5 h-3.5" /> Verified
            </span>
          </div>
          {showEmail && <p className="text-xs text-emerald-800 mt-0.5 break-all">{email}</p>}
          <p className="text-xs text-emerald-700/80 mt-1">
            Payments, contracts and payouts are fully unlocked.
          </p>
          {message?.tone === 'ok' && <p className="text-xs text-emerald-700 mt-1">{message.text}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 ${className}`}>
      <Mail className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-amber-900">Verify your email</p>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">
            <AlertCircle className="w-3.5 h-3.5" /> Not verified
          </span>
        </div>
        {showEmail && <p className="text-xs text-amber-800 mt-0.5 break-all">{email}</p>}
        <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
          We'll email you a one-time link to confirm this address. Your status updates here
          automatically once you click it — you can do this whenever you want.
        </p>
        {!showEmail && <p className="text-xs text-amber-800 mt-0.5 break-all">{email}</p>}

        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || cooldown > 0}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-xs font-semibold transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send verification email'}
          </button>
          <button
            type="button"
            onClick={handleRecheck}
            disabled={checking}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50 text-xs font-semibold transition-colors"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {checking ? 'Checking…' : "I've verified"}
          </button>
        </div>

        {message && (
          <p className={`text-xs mt-2 ${message.tone === 'err' ? 'text-red-600' : 'text-emerald-700'}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
