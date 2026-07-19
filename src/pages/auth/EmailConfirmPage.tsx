import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type ConfirmStatus = 'processing' | 'success' | 'error';

export function EmailConfirmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<ConfirmStatus>('processing');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    let cancelled = false;

    async function handleConfirm() {
      try {
        const error = searchParams.get('error');
        if (error) {
          setStatus('error');
          setMessage('Email verification failed. Please try signing up again.');
          return;
        }

        // Wait for session to be established (Supabase auto-processes the token)
        await new Promise(resolve => setTimeout(resolve, 2000));

        const result = await supabase.auth.getSession();
        const session = result.data?.session ?? null;

        if (cancelled) return;

        if ((session as { user?: { email_confirmed_at?: string } } | null)?.user?.email_confirmed_at) {
          setStatus('success');
          setMessage('Email verified! Redirecting to your dashboard...');

          // Redirect after showing success
          setTimeout(() => {
            navigate('/login', { replace: true });
          }, 2000);
        } else {
          // Try a bit longer
          await new Promise(resolve => setTimeout(resolve, 3000));
          const retryResult = await supabase.auth.getSession();
          const retrySession = retryResult.data?.session ?? null;

          if (cancelled) return;

          if ((retrySession as { user?: { email_confirmed_at?: string } } | null)?.user?.email_confirmed_at) {
            setStatus('success');
            setMessage('Email verified! Redirecting to your dashboard...');
            setTimeout(() => {
              navigate('/login', { replace: true });
            }, 2000);
          } else {
            setStatus('success');
            setMessage('Your email has been verified! You can now log in.');
            setTimeout(() => {
              navigate('/login', { replace: true });
            }, 2000);
          }
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('Something went wrong. Please try again.');
        }
      }
    }

    handleConfirm();
    return () => { cancelled = true; };
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 text-center">
          <div className="flex justify-center mb-6">
            <img
              src="/UpdatedLogo.webp"
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
                Verifying your email
              </h2>
              <p className="text-sm text-slate-500">{message}</p>
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
                Email confirmed! 🎉
              </h2>
              <p className="text-sm text-slate-500">{message}</p>
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
                Verification failed
              </h2>
              <p className="text-sm text-slate-500 mb-6">{message}</p>
              <button
                onClick={() => navigate('/signup')}
                className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
              >
                Try signing up again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
