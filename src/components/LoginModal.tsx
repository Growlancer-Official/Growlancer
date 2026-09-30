import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ShieldCheck, X } from 'lucide-react';
import { supabase, clearSupabaseAuthStorage, isStaleSessionError } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
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
 * Growlancer has no email/password login: identity comes from the provider,
 * and the session + profile are created by the shared OAuth callback flow.
 * Removing the password form also removes that attack surface entirely —
 * there is no password to phish, spray or reset.
 */
export function LoginModal({ isOpen, onClose, onSwitchToSignup }: LoginModalProps) {
  const navigate = useNavigate();
  const { signInWithOAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [existingUser, setExistingUser] = useState(false);

  // Check if there's already a VALID session on this device.
  // Uses getUser() (server-validated) instead of getSession() (localStorage
  // only) — a stale token for a deleted user would otherwise show the
  // "Already logged in" banner forever. Dead sessions are force-cleared.
  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) return;
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (isStaleSessionError(userError)) {
        // 🔥 Stale session for a deleted user — clear it so it stops blocking auth.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        clearSupabaseAuthStorage();
        setExistingUser(false);
        return;
      }
      if (userError || !userData?.user) return; // transient network — don't show banner
      setExistingUser(true);
    }
    checkSession();
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Welcome back">
      {/* Subtle Background Decorations */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/50 rounded-full blur-2xl -mr-12 -mt-12 opacity-60 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-100/50 rounded-full blur-2xl -ml-12 -mb-12 opacity-60 pointer-events-none"></div>

      <div className="relative animate-fade-in-content">
        <p className="text-slate-500 mb-5 text-sm">
          Sign in to manage your projects, contracts and payouts.
        </p>

        {/* ⚠️ Existing Session Banner — Dismissible, NOT blocking */}
        {existingUser && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">Already logged in</p>
                <p className="text-xs text-amber-600 leading-relaxed">
                  You can still sign in with a different account below.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { onClose(); navigate('/dashboard'); }}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline px-2 py-1"
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    onClose();
                    await supabase.auth.signOut().catch(() => {});
                    clearSupabaseAuthStorage();
                    window.location.href = '/';
                  }}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline px-2 py-1"
                >
                  Logout
                </button>
                <button
                  type="button"
                  onClick={() => setExistingUser(false)}
                  className="p-1 rounded-lg hover:bg-amber-100 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4 text-amber-500" />
                </button>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-amber-200/50">
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut().catch(() => {});
                  clearSupabaseAuthStorage();
                  setExistingUser(false);
                }}
                className="w-full py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                ← Log out &amp; use a different account
              </button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

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

        {/* Trust note — honest, Growlancer-branded */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-100 p-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Growlancer uses GitHub and LinkedIn for secure sign-in — we never see or store your
            password, and we never post anything to your accounts.
          </p>
        </div>

        {/* Signup Redirect */}
        <div className="mt-5 text-center">
          <p className="text-slate-600 text-sm">
            New to Growlancer?{' '}
            <button
              onClick={onSwitchToSignup}
              className="text-emerald-600 font-semibold hover:text-emerald-700 transition-all duration-200 hover:scale-105"
            >
              Create an account
            </button>
          </p>
        </div>
      </div>
    </Modal>
  );
}
