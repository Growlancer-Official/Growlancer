import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { supabase, clearSupabaseAuthStorage, isStaleSessionError } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getPostAuthPath } from '../lib/authAction';
import { Modal } from './Modal';
import { OAuthButtons } from './OAuthButtons';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToSignup: () => void;
}

/**
 * LoginModal — GitHub / LinkedIn sign-in only.
 *
 * Growlanzo has no email/password login: identity comes from the provider,
 * and the session + profile are created by the shared OAuth callback flow.
 * Removing the password form also removes that attack surface entirely —
 * there is no password to phish, spray or reset.
 *
 * 🔁 RETURNING USERS NEVER SEE THIS FORM. Once someone has signed up, their
 * session is persisted (supabase-js `persistSession`), so opening the login
 * entry point again walks them straight into the app: no provider chooser, no
 * second GitHub/LinkedIn round trip, no "Processing…" page. The form only ever
 * renders for a visitor with no valid session. Switching accounts stays
 * possible through the explicit "use a different account" action, which signs
 * out first.
 */
export function LoginModal({ isOpen, onClose, onSwitchToSignup }: LoginModalProps) {
  const navigate = useNavigate();
  const { signInWithOAuth, user, isAuthenticated, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  // Auto-resume: a valid session outranks the sign-in form. getUser() (not
  // getSession()) is the trigger because it is the server-validated check — a
  // token for a deleted account must never "resume" into a broken dashboard.
  // Stale sessions are force-cleared, which leaves the provider buttons in
  // place so the person can sign in again.
  useEffect(() => {
    if (!isOpen) {
      setResuming(false);
      return;
    }
    if (isLoading || !isAuthenticated || !user) return;

    let cancelled = false;
    setResuming(true);

    (async () => {
      const { error: userError } = await supabase.auth.getUser();
      if (cancelled) return;

      if (isStaleSessionError(userError)) {
        // 🔥 Dead session (user deleted server-side) — clear it and fall back
        // to the provider buttons instead of resuming into a dead account.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        clearSupabaseAuthStorage();
        setResuming(false);
        return;
      }

      // Transient network errors still resume: the token in storage is what
      // ProtectedRoute will use, and bouncing the user to a provider chooser
      // for a flaky connection is exactly the friction this removes.
      onClose();
      navigate(getPostAuthPath(user), { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isLoading, isAuthenticated, user, navigate, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Welcome back" brand>
      {/* Subtle Background Decorations */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/50 rounded-full blur-2xl -mr-12 -mt-12 opacity-60 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-100/50 rounded-full blur-2xl -ml-12 -mb-12 opacity-60 pointer-events-none"></div>

      <div className="relative animate-fade-in-content">
        <p className="text-slate-500 mb-5 text-sm">
          Sign in to manage your projects, contracts and payouts.
        </p>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Returning session — skip the provider round trip entirely. */}
        {resuming ? (
          <div className="mb-4 flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
            <Loader2 className="w-5 h-5 text-emerald-600 animate-spin shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-800">Taking you to your dashboard…</p>
              <p className="text-xs text-emerald-700/80 leading-relaxed mt-0.5">
                You're already signed in as {user?.email || 'your account'} — no need to sign in again.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { onClose(); navigate(getPostAuthPath(user), { replace: true }); }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                >
                  Open dashboard
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setResuming(false);
                    await supabase.auth.signOut().catch(() => {});
                    clearSupabaseAuthStorage();
                    window.location.replace('/?modal=login');
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 hover:underline"
                >
                  Use a different account
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* GitHub & LinkedIn — the only sign-in methods */}
            <OAuthButtons
              onSelect={async (provider) => {
                setError(null);
                // A returning user keeps their existing role — clear any role left
                // behind by an unfinished signup so it cannot override it.
                localStorage.removeItem('growlancer_oauth_role');
                return signInWithOAuth(provider);
              }}
              onError={setError}
            />

            {/* Trust note — honest, Growlanzo-branded */}
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-100 p-3">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Growlanzo uses GitHub and LinkedIn for secure sign-in — we never see or store your
                password, and we never post anything to your accounts.
              </p>
            </div>

            {/* Signup Redirect */}
            <div className="mt-5 text-center">
              <p className="text-slate-600 text-sm">
                New to Growlanzo?{' '}
                <button
                  onClick={onSwitchToSignup}
                  className="text-emerald-600 font-semibold hover:text-emerald-700 transition-all duration-200 hover:scale-105"
                >
                  Create an account
                </button>
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
