import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchUserProfile } from '../lib/services/authService';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

type CallbackStatus = 'processing' | 'success' | 'error';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        // ── 1. Check for error in URL params (OAuth failure) ──
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

        // ── 2. Get the current session (Supabase already processed the OAuth) ──
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
            setStatus('error');
            setErrorMessage(
              'No session found. Please try logging in again.'
            );
            return;
          }
        }

        if (cancelled) return;

        const authUser = data.session?.user;

        // ── 3. Set success and redirect ──
        // Note: Email auto-confirmation is handled by the SQL trigger
        // on auth.users (see fix migration). OAuth providers also
        // typically return pre-verified emails.
        setStatus('success');

        // Wait briefly to show success animation
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (cancelled) return;

        // ── 4. Redirect based on onboarding status ──
        // The AuthContext will have synced the profile by now
        // Check if onboarding is needed
        const profile = authUser?.id ? await fetchUserProfile(authUser.id) : null;
        if (profile && !profile.onboardingCompleted) {
          // This page is only reached via OAuth redirects, so always use the mini form
          navigate('/onboarding?mode=oauth', { replace: true });
        } else {
          const dashboardRoute =
            profile?.role === 'client'
              ? '/client'
              : profile?.role === 'admin'
                ? '/admin'
                : '/dashboard';
          navigate(dashboardRoute, { replace: true });
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/Growlancer Logo (2).png"
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
                Signing you in...
              </h2>
              <p className="text-sm text-slate-500">
                Please wait while we complete your authentication.
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
                Authenticated successfully!
              </h2>
              <p className="text-sm text-slate-500">
                Redirecting you to your dashboard...
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


