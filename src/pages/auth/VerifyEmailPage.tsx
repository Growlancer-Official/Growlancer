import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mail, ExternalLink, RefreshCw, Loader2, CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchUserProfile } from '../../lib/services/authService';
import { redirectAfterAuth } from '../../lib/authAction';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  // mode=oauth → this is a GitHub/LinkedIn signup whose email needs confirming.
  // OAuth users go to the role-selection mini-form when onboarding is pending.
  const isOAuthMode = searchParams.get('mode') === 'oauth';

  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  // Guards against double-redirect when the realtime listener and the poll
  // both observe the confirmation in the same tick.
  const redirectedRef = useRef(false);

  /**
   * Shared destination logic: fetch the profile once the email is confirmed and
   * route to onboarding/dashboard by role. Full-page redirect avoids the
   * ProtectedRoute bounce-back race (same as AuthCallbackPage/EmailConfirmPage).
   * oauthMode=true keeps OAuth users on the role-selection mini-form path.
   */
  const goToAppDestination = useCallback(async () => {
    if (redirectedRef.current) return false;
    redirectedRef.current = true;

    // Session may not be established yet (fresh confirm in another tab/device) —
    // try getSession, then getUser + refreshSession as recovery fallbacks so the
    // redirect is never skipped because the session was momentarily missing.
    const { data } = await supabase.auth.getSession();
    let userId = data?.session?.user?.id;
    if (!userId) {
      const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      if (userData?.user?.id) {
        const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
        userId = refreshed?.session?.user?.id ?? userData.user.id;
      }
    }
    if (!userId) return false;

    let profile = await fetchUserProfile(userId).catch(() => null);
    if (!profile) {
      // Profile may be mid-creation (trigger/RPC race) — retry briefly
      for (let i = 0; i < 4 && !profile; i++) {
        await new Promise(r => setTimeout(r, 600));
        profile = await fetchUserProfile(userId).catch(() => null);
      }
    }
    redirectAfterAuth(profile, isOAuthMode);
    return true;
  }, [isOAuthMode]);

  // Auto-detect email provider
  const getEmailProviderUrl = (e: string): string => {
    const domain = e.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail')) return 'https://mail.google.com';
    if (domain.includes('outlook') || domain.includes('hotmail')) return 'https://outlook.live.com';
    if (domain.includes('yahoo')) return 'https://mail.yahoo.com';
    if (domain.includes('proton')) return 'https://mail.proton.me';
    if (domain.includes('icloud')) return 'https://icloud.com/mail';
    if (domain.includes('aol')) return 'https://mail.aol.com';
    if (domain.includes('zoho')) return 'https://mail.zoho.com';
    if (domain.includes('yandex')) return 'https://mail.yandex.com';
    return 'https://mail.google.com';
  };

  const getEmailProviderName = (e: string): string => {
    const domain = e.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail')) return 'Gmail';
    if (domain.includes('outlook')) return 'Outlook';
    if (domain.includes('hotmail')) return 'Hotmail';
    if (domain.includes('yahoo')) return 'Yahoo Mail';
    if (domain.includes('proton')) return 'Proton Mail';
    if (domain.includes('icloud')) return 'iCloud Mail';
    return 'your inbox';
  };

  const providerUrl = getEmailProviderUrl(email);
  const providerName = getEmailProviderName(email);

  // Check verification status automatically AND redirect in real time.
  // Two mechanisms work together:
  //   1. onAuthStateChange listener — fires the INSTANT Supabase confirms the
  //      email (same-tab confirm link, token refresh, or cross-tab sync), so the
  //      user is redirected to onboarding/dashboard without waiting for a poll.
  //   2. 3s polling fallback — catches confirmations in a different browser or
  //      device where no auth event reaches this tab.
  useEffect(() => {
    let cancelled = false;

    const confirmAndGo = async () => {
      if (cancelled) return;
      setVerified(true);
      // Brief success flash, then redirect (real-time but not jarring)
      setTimeout(() => {
        if (!cancelled) void goToAppDestination();
      }, 900);
    };

    async function checkVerification() {
      setVerifying(true);
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        if (data?.user?.email_confirmed_at) {
          void confirmAndGo();
        }
      } catch {
        // Silently retry
      } finally {
        if (!cancelled) setVerifying(false);
      }
    }

    // 🟢 Real-time listener — no polling lag once the email is confirmed
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user?.email_confirmed_at) {
          void confirmAndGo();
        } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          // User confirmed but session still carrying stale flags — re-check
          void checkVerification();
        }
      }
    });

    // Poll fallback (other browser/device confirmations)
    checkVerification();
    const interval = setInterval(() => {
      if (!cancelled) {
        supabase.auth.getUser().then(({ data }) => {
          if (cancelled) return;
          if (data?.user?.email_confirmed_at) {
            clearInterval(interval);
            void confirmAndGo();
          }
        }).catch(() => {});
      }
    }, 3000);

    return () => {
      cancelled = true;
      authListener?.subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [email, goToAppDestination]);

  const handleResendEmail = async () => {
    setResending(true);
    setResendMessage(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?type=signup`,
        },
      });
      if (error) {
        // For OAuth-created accounts (GitHub/LinkedIn) the provider may not have
        // exposed a verified email — resend can fail. Give the user a recovery hint.
        setResendMessage(
          isOAuthMode
            ? `${error.message} If you signed up with GitHub, make sure your email is public/verified on GitHub, or use Sign up with email instead.`
            : error.message
        );
      } else {
        setResendMessage('Verification email resent! Check your inbox.');
      }
    } catch {
      setResendMessage('Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleManualCheck = async () => {
    setVerifying(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email_confirmed_at) {
        setVerified(true);
        setTimeout(() => {
          void goToAppDestination();
        }, 900);
      } else {
        setResendMessage('Email not yet verified. Check your inbox and click the verification link.');
      }
    } catch {
      setResendMessage('Could not check verification status. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  // ── Success screen ──
  if (verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-[2rem] shadow-xl border border-emerald-100 p-8 md:p-10 text-center">
            <div className="flex justify-center mb-6">
              <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center animate-bounce-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Email Verified! 🎉</h1>
            <p className="text-slate-500 mb-6">Redirecting you to your dashboard...</p>
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  // ── Verify Email screen ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      {/* Background decorations */}
      <div className="fixed top-0 right-0 w-96 h-96 bg-emerald-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-96 h-96 bg-orange-100/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

      <div className="max-w-md w-full mx-4 relative">
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 p-8 md:p-10">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <img
              src="/UpdatedLogo.webp"
              alt="Growlancer"
              className="h-12 w-12 rounded-xl"
            />
          </div>

          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Mail className="w-8 h-8 text-emerald-600" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Check your inbox</h1>
            <p className="text-sm text-slate-500">We sent a verification email to</p>
            <p className="text-sm font-semibold text-slate-900 mt-1 break-all">{email || 'your email'}</p>
          </div>

          {/* Open Inbox Button */}
          <a
            href={providerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 active:translate-y-0 transition-all mb-4"
          >
            <ExternalLink className="w-5 h-5" />
            Open {providerName}
          </a>

          {/* Manual Check Button */}
          <button
            onClick={handleManualCheck}
            disabled={verifying}
            className="flex items-center justify-center gap-2 w-full h-11 bg-white border-2 border-emerald-600 text-emerald-700 font-semibold rounded-xl hover:bg-emerald-50 transition-all disabled:opacity-50 mb-6"
          >
            {verifying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {verifying ? 'Checking...' : "I've verified, continue"}
          </button>

          {/* Resend Section */}
          <div className="text-center mb-6">
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
              <p className={`text-xs mt-2 ${resendMessage.includes('Failed') || resendMessage.includes('error') || resendMessage.includes('not yet') ? 'text-red-500' : 'text-emerald-600'}`}>
                {resendMessage}
              </p>
            )}
          </div>

          {/* Info box */}
          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl mb-6">
            <p className="text-[11px] text-amber-700 text-center">
              Please verify your email to access your dashboard. The link expires in 24 hours.
            </p>
          </div>

          {/* Back to Login */}
          <div className="text-center border-t border-slate-100 pt-6">
            <p className="text-slate-600 text-sm">
              Already have an account?{' '}
              <button
                onClick={() => navigate('/?modal=login')}
                className="inline-flex items-center gap-1 text-emerald-600 font-semibold hover:text-emerald-700 transition-all"
              >
                Log in here
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
