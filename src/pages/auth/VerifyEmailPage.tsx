import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mail, ExternalLink, RefreshCw, Loader2, CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchUserProfile, createUserProfile } from '../../lib/services/authService';
import { redirectAfterAuth } from '../../lib/authAction';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') || '';
  // mode=oauth → this is a GitHub/LinkedIn signup whose email needs confirming.
  // OAuth users go to the role-selection mini-form when onboarding is pending.
  const isOAuthMode = searchParams.get('mode') === 'oauth';

  const [verifying, setVerifying] = useState(false);
  // Server-side verification detected (this tab or another) — the user STAYS
  // on this page and clicks "I've verified, continue" to proceed. No
  // auto-redirect, never a bounce to a login modal.
  const [confirmed, setConfirmed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  // Guards against double-redirect when the realtime listener and the poll
  // both observe the confirmation in the same tick.
  const redirectedRef = useRef(false);

  /**
   * Establish a session and route to the destination — called ONLY from the
   * user's "I've verified, continue" click (and manual re-checks). A verified
   * user is NEVER bounced to a login modal:
   *   'redirected'   → session found, redirecting to onboarding/dashboard
   *   'need-login'   → email verified but no way to sign in on this device —
   *                     caller shows an inline message, user stays on the page
   *   'not-verified' → server says the email is NOT confirmed yet
   */
  const establishAndGo = useCallback(async (emailToCheck?: string): Promise<'redirected' | 'need-login' | 'not-verified'> => {
    // Only mark redirectedRef when we ACTUALLY redirect — a failed attempt
    // (no session yet) must not permanently block a later successful one.
    if (redirectedRef.current) return 'redirected';

    // 1) Existing session (same-tab confirm or cross-tab sync already delivered)
    const { data } = await supabase.auth.getSession();
    let userId = data?.session?.user?.id ?? null;

    // 2) Recovery fallbacks — session may be momentarily missing
    if (!userId) {
      const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      if (userData?.user?.id) {
        const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
        userId = refreshed?.session?.user?.id ?? userData.user.id;
      }
    }

    // 3) Auto sign-in with the credentials saved at signup (verification
    //    happened in a new tab — this device may not have the session yet).
    if (!userId && emailToCheck) {
      const storedEmail = sessionStorage.getItem('gw_signup_email');
      const storedPassword = sessionStorage.getItem('gw_signup_password');
      if (storedEmail && storedPassword && storedEmail.toLowerCase() === emailToCheck.toLowerCase()) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: storedEmail,
          password: storedPassword,
        });
        if (!signInError && signInData.session?.user?.email_confirmed_at) {
          sessionStorage.removeItem('gw_signup_email');
          sessionStorage.removeItem('gw_signup_password');
          userId = signInData.session.user.id;
        }
      }
    }

    if (!userId) {
      // No session possible on this device — decide the message by server truth
      if (emailToCheck) {
        const { data: confirmed } = await (supabase.rpc as any)('is_email_confirmed', {
          p_email: emailToCheck,
        });
        if (confirmed !== true) return 'not-verified';
      }
      return 'need-login';
    }

    let profile = await fetchUserProfile(userId).catch(() => null);
    if (!profile) {
      // Profile may be mid-creation (trigger/RPC race) — retry briefly
      for (let i = 0; i < 4 && !profile; i++) {
        await new Promise(r => setTimeout(r, 600));
        profile = await fetchUserProfile(userId).catch(() => null);
      }
    }
    if (!profile) {
      // Safety net — if the profile was never created (e.g. signup hiccup),
      // create a minimal one from the confirmed auth user metadata so the
      // user is never stuck at an empty redirect.
      const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      const u = userData?.user;
      if (u?.id) {
        const name = u.user_metadata?.name || u.email?.split('@')[0] || 'User';
        const role = u.user_metadata?.role === 'client' ? 'client' : 'freelancer';
        profile = await createUserProfile(u.id, u.email || '', name, role).catch(() => null);
      }
    }
    // 🎯 ONE onboarding for everyone — role is chosen on the onboarding
    // welcome step (no separate OAuth mini-form anymore).
    redirectedRef.current = true;
    redirectAfterAuth(profile);
    return 'redirected';
  }, []);

  /**
   * Server-side truth check: is this email confirmed in auth.users?
   * Needed because the confirmation may have happened in ANOTHER tab/browser —
   * this tab has no local session, so getUser() would wrongly report
   * "email not verified". Pure read-only check — NO navigation, NO sign-in
   * here. The session is established later in establishAndGo (only when the
   * user clicks "I've verified, continue").
   */
  const checkServerConfirmed = useCallback(async (emailToCheck: string): Promise<boolean> => {
    try {
      // ⚠️ supabase.rpc() resolves to { data, error } — NOT a raw boolean.
      // Unwrap .data to get the actual boolean.
      const { data: confirmed } = await (supabase.rpc as any)('is_email_confirmed', {
        p_email: emailToCheck,
      });
      return confirmed === true;
    } catch {
      return false;
    }
  }, []);

  // 🔒 Clear the temporarily-stored signup credentials when this page unmounts
  // (they are only meant to bridge the confirm-in-new-tab gap).
  useEffect(() => {
    return () => {
      sessionStorage.removeItem('gw_signup_email');
      sessionStorage.removeItem('gw_signup_password');
    };
  }, []);

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

    // 🎯 Verification detected (real-time) — the user STAYS on this page and
    // clicks "I've verified, continue" to proceed to the next steps. No
    // auto-redirect, and NEVER a bounce to a login modal.
    const markConfirmed = () => {
      if (cancelled) return;
      setConfirmed(true);
    };

    async function checkVerification() {
      setVerifying(true);
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        if (data?.user?.email_confirmed_at) {
          markConfirmed();
        } else {
          // No local session — confirmation may have happened in another tab/browser
          const serverConfirmed = await checkServerConfirmed(email);
          if (!cancelled && serverConfirmed) {
            markConfirmed();
          }
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
          markConfirmed();
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
            markConfirmed();
          } else {
            // cross-tab / cross-browser fallback — ask the database directly
            checkServerConfirmed(email).then((ok) => {
              if (!cancelled && ok) {
                clearInterval(interval);
                markConfirmed();
              }
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    }, 3000);

    return () => {
      cancelled = true;
      authListener?.subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [email, checkServerConfirmed]);

  const handleResendEmail = async () => {
    setResending(true);
    setResendMessage(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          // 🎯 Same as signup — the confirm link lands on EmailConfirmPage
          // ("Email verified ✓ — close this window"), never auto-onboarding.
          // NO ?type= query: GoTrue glob-matches redirect_to against the
          // allowlist INCLUDING the query string — a ?type=signup suffix breaks
          // the match and GoTrue falls back to the Site URL (homepage flash).
          // The flow type is appended to the URL fragment by GoTrue itself.
          emailRedirectTo: `${window.location.origin}/auth/email-confirm`,
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
    setResendMessage(null);
    try {
      // Establish the session and go to the next steps (onboarding/dashboard).
      // Never lands on a login modal — see establishAndGo.
      const outcome = await establishAndGo(email);
      if (outcome === 'not-verified') {
        setResendMessage('Email not yet verified. Check your inbox and click the verification link.');
      } else if (outcome === 'need-login') {
        // Verified, but no session/credentials on this device — stay on this
        // page and let the user log in via the "Log in here" link below.
        setResendMessage('Your email is verified! Please log in below to continue.');
      }
    } catch {
      setResendMessage('Could not check verification status. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  // ── Verify Email screen (user stays here after verification — the inline
  //    green banner appears in real time, then "I've verified, continue"
  //    takes them to the next steps) ──
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

          {/* 🎯 Real-time verified banner — user stays on this page and clicks
              "I've verified, continue" to proceed (no auto-redirect, no login modal) */}
          {confirmed && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-xs font-medium text-emerald-700">
                Your email is verified! Click "I've verified, continue" below to proceed to the next steps.
              </p>
            </div>
          )}

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
