import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchUserProfile } from '../lib/services/authService';
import { CheckCircle2, Loader2, XCircle, Mail, KeyRound, ShieldCheck, MapPin, ArrowRight } from 'lucide-react';

type CallbackStatus = 'processing' | 'success' | 'error' | 'country_gate';
type AuthAction = 'signup' | 'recovery' | 'magiclink' | 'email_change' | 'invite' | 'reauthentication' | 'unknown';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [action, setAction] = useState<AuthAction>('unknown');

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        // ── 1. Detect auth action type ──
        const typeParam = searchParams.get('type') as AuthAction | null;
        const detectedAction = typeParam || 'unknown';
        setAction(detectedAction);

        // ── 2. Check for OAuth error ──
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          setStatus('error');
          setErrorMessage(
            errorDescription?.replace(/\+/g, ' ') ||
              'Authentication failed. Please try again.'
          );
          return;
        }

        // ── 3. Handle magiclink type specially (has token_hash) ──
        if (detectedAction === 'magiclink') {
          const tokenHash = searchParams.get('token_hash');
          if (tokenHash) {
            const { error: verifyError } = await supabase.auth.verifyOtp({
              type: 'magiclink',
              token_hash: tokenHash,
            });

            if (verifyError) {
              setStatus('error');
              setErrorMessage(verifyError.message);
              return;
            }
          }
        }

        // ── 4. Handle signup/email_change verification via token_hash ──
        if (detectedAction === 'signup' || detectedAction === 'email_change') {
          const tokenHash = searchParams.get('token_hash');
          if (tokenHash) {
            await supabase.auth.verifyOtp({
              type: detectedAction === 'email_change' ? 'email_change' : 'signup',
              token_hash: tokenHash,
            });
          }
        }

        // ── 4b. After signup verification, send professional welcome email via Brevo ──
        if (detectedAction === 'signup') {
          // Get user data for the welcome email
          const { data: userData } = await supabase.auth.getUser();
          const userEmail = userData?.user?.email || searchParams.get('email') || '';
          const userName = userData?.user?.user_metadata?.name || userEmail.split('@')[0] || 'there';

          // Fire-and-forget: send welcome email
          supabase.functions.invoke('admin-data', {
            method: 'POST',
            body: {
              action: 'send_welcome_email',
              recipient_email: userEmail,
              recipient_name: userName,
            },
          }).catch(() => {
            // Silent fail — welcome email is non-critical
          });
        }

        // ── 5. Get the current session ──
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setStatus('error');
          setErrorMessage(sessionError.message);
          return;
        }

        if (!data.session?.user) {
          // No session yet — wait a bit and retry
          await new Promise(resolve => setTimeout(resolve, 2000));
          const { data: retryData } = await supabase.auth.getSession();

          if (!retryData.session?.user) {
            // For signup/verification, still show success (email verified)
            if (detectedAction === 'signup' || detectedAction === 'email_change') {
              setStatus('success');
              await new Promise(resolve => setTimeout(resolve, 1500));
              if (cancelled) return;
              navigate(detectedAction === 'email_change' ? '/login' : '/login', { replace: true });
              return;
            }

            setStatus('error');
            setErrorMessage('No session found. Please try logging in again.');
            return;
          }
        }

        if (cancelled) return;

        const authUser = data.session?.user;

        // ── 6. Handle specific actions ──
        if (detectedAction === 'recovery') {
          // Password reset — stay on page, show success, redirect to reset page
          setStatus('success');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (cancelled) return;
          navigate('/auth/reset-password', { replace: true });
          return;
        }

        if (detectedAction === 'email_change') {
          setStatus('success');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (cancelled) return;
          navigate('/login', { replace: true });
          return;
        }

        if (detectedAction === 'invite') {
          // User was invited — redirect to onboarding
          setStatus('success');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (cancelled) return;
          navigate('/onboarding', { replace: true });
          return;
        }

        // ── 7. Country gate for OAuth signups ──
        // If user authenticated via OAuth and has no country set, show country confirmation.
        setStatus('success');

        await new Promise(resolve => setTimeout(resolve, 1000));

        if (cancelled) return;

        // Retry fetching profile (AuthContext may still be syncing)
        let profile = null;
        for (let i = 0; i < 5; i++) {
          profile = authUser?.id ? await fetchUserProfile(authUser.id) : null;
          if (profile) break;
          await new Promise(r => setTimeout(r, 600));
        }

        // 🆕 Country gate: If user has no profile country set (first-time OAuth), show country confirmation
        // Only for OAuth signups (detectedAction === 'signup' or profile was just created)
        if (profile && !profile.country) {
          setStatus('country_gate');
          if (cancelled) return;
          return; // Stop — country confirmation UI will handle the redirect
        }

        if (profile && !profile.onboardingCompleted) {
          navigate('/onboarding?mode=oauth', { replace: true });
        } else if (profile) {
          const dashboardRoute =
            profile.role === 'client'
              ? '/client'
              : profile.role === 'admin'
                ? '/admin'
                : '/dashboard';
          navigate(dashboardRoute, { replace: true });
        } else {
          navigate('/onboarding?mode=oauth', { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'An unexpected error occurred. Please try again.'
          );
        }
      }
    }

    handleCallback();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  // ── Country Gate State ──
  const [countryGateLoading, setCountryGateLoading] = useState(false);
  const [countryGateError, setCountryGateError] = useState<string | null>(null);

  const handleCountrySelect = async (selectedCountry: string) => {
    setCountryGateLoading(true);
    setCountryGateError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        setCountryGateError('Session expired. Please log in again.');
        setCountryGateLoading(false);
        return;
      }

      if (selectedCountry === 'IN') {
        // Save country as India — proceed normally
        await supabase.rpc('update_user_country' as any, {
          p_user_id: userId,
          p_country: 'IN',
        } as any);

        // Now determine redirect based on profile
        const profile = await fetchUserProfile(userId);
        if (profile && !profile.onboardingCompleted) {
          navigate('/onboarding?mode=oauth', { replace: true });
        } else if (profile) {
          const dashboardRoute =
            profile.role === 'client' ? '/client' :
            profile.role === 'admin' ? '/admin' :
            '/dashboard';
          navigate(dashboardRoute, { replace: true });
        } else {
          navigate('/onboarding?mode=oauth', { replace: true });
        }
      } else {
        // Non-India country — insert into waitlist, redirect to /waitlist
        const email = sessionData.session?.user?.email || '';
        await supabase.rpc('join_waitlist' as any, {
          p_email: email,
          p_country: selectedCountry,
          p_signup_source: 'oauth',
          p_user_id: userId,
        } as any);

        navigate('/waitlist', { replace: true });
      }
    } catch (err) {
      setCountryGateError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
      setCountryGateLoading(false);
    }
  };

  const actionIcons: Record<AuthAction, React.ReactNode> = {
    signup: <Mail className="w-8 h-8 text-emerald-600" />,
    recovery: <KeyRound className="w-8 h-8 text-emerald-600" />,
    magiclink: <ShieldCheck className="w-8 h-8 text-emerald-600" />,
    email_change: <Mail className="w-8 h-8 text-emerald-600" />,
    invite: <ShieldCheck className="w-8 h-8 text-emerald-600" />,
    reauthentication: <ShieldCheck className="w-8 h-8 text-emerald-600" />,
    unknown: <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />,
  };

  const actionTitles: Record<AuthAction, string> = {
    signup: 'Email verified successfully!',
    recovery: 'Password reset link verified!',
    magiclink: 'Signing you in...',
    email_change: 'Email updated successfully!',
    invite: 'Welcome to Growlancer!',
    reauthentication: 'Identity verified!',
    unknown: 'Processing...',
  };

  const actionDescriptions: Record<AuthAction, string> = {
    signup: 'Your email has been confirmed. Redirecting to login...',
    recovery: 'Redirecting you to set a new password...',
    magiclink: 'You will be signed in automatically...',
    email_change: 'Your email has been changed. Redirecting to login...',
    invite: 'Setting up your account. Redirecting to onboarding...',
    reauthentication: 'Your identity has been verified.',
    unknown: 'Please wait while we process your request...',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/UpdatedLogo.png"
              alt="Growlancer"
              className="h-12 w-12 rounded-xl"
            />
          </div>

          {status === 'processing' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                </div>
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                {actionTitles[action]}
              </h2>
              <p className="text-sm text-slate-500">
                {actionDescriptions[action]}
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                {actionTitles[action]}
              </h2>
              <p className="text-sm text-slate-500">
                {actionDescriptions[action]}
              </p>
            </div>
          )}

          {/* 🆕 Country Gate UI — shown after OAuth for users without country set */}
          {status === 'country_gate' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                Where are you located?
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Growlancer is currently available in <strong>India</strong>. Select your country to continue.
              </p>

              {/* Country Options */}
              <div className="space-y-3 mb-6">
                {/* India — Enabled */}
                <button
                  onClick={() => handleCountrySelect('IN')}
                  disabled={countryGateLoading}
                  className="w-full flex items-center gap-4 p-4 bg-emerald-50 border-2 border-emerald-500 rounded-xl hover:bg-emerald-100 transition-colors text-left group disabled:opacity-50"
                >
                  <span className="text-3xl">🇮🇳</span>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">India</p>
                    <p className="text-xs text-emerald-600 font-medium">Available now</p>
                  </div>
                  {countryGateLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  ) : (
                    <ArrowRight className="w-5 h-5 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>

                {/* Other Countries — Click to join waitlist (Coming Soon) */}
                {[
                  { code: 'US', flag: '🇺🇸', name: 'United States' },
                  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
                  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
                  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
                  { code: 'AE', flag: '🇦🇪', name: 'United Arab Emirates' },
                  { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
                  { code: 'OTHER', flag: '🌍', name: 'Other Country' },
                ].map((country) => (
                  <button
                    key={country.code}
                    onClick={() => handleCountrySelect(country.code)}
                    disabled={countryGateLoading}
                    className="w-full flex items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 hover:border-amber-300 transition-colors text-left group"
                  >
                    <span className="text-3xl">{country.flag}</span>
                    <div className="flex-1">
                      <p className="font-medium text-slate-700 group-hover:text-slate-900">{country.name}</p>
                      <p className="text-xs text-amber-600 font-medium">Coming soon — join waitlist →</p>
                    </div>
                  </button>
                ))}
              </div>

              {countryGateError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-600">{countryGateError}</p>
                </div>
              )}

              <p className="text-[10px] text-slate-400">
                By continuing, you agree to our{' '}
                <a href="/terms" className="text-emerald-600 hover:underline">Terms of Service</a>
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-red-100 flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-500" />
                </div>
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                Authentication failed
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                {errorMessage || 'Something went wrong. Please try again.'}
              </p>
              <button
                onClick={() => navigate('/?modal=login', { replace: true })}
                className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
              >
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
