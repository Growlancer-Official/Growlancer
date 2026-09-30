import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Briefcase, AlertCircle, ShieldCheck, X } from 'lucide-react';
import { supabase, clearSupabaseAuthStorage, isStaleSessionError } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';
import { OAuthButtons } from './OAuthButtons';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin: () => void;
  initialRole?: 'freelancer' | 'client';
}

/**
 * SignupModal — GitHub / LinkedIn sign-up only.
 *
 * The user picks how they want to use Growlancer (freelance or hire talent),
 * then continues with a provider. The chosen role is persisted by
 * `signInWithOAuth` (localStorage → read back by AuthCallbackPage after the
 * redirect) and the profile row is created from the provider's name/email —
 * there is no signup form to fill.
 *
 * Referral links keep working: `signInWithOAuth` also captures `?ref=…` from
 * the URL before leaving for the provider, and AuthContext applies it on the
 * way back.
 */
export function SignupModal({ isOpen, onClose, onSwitchToLogin, initialRole }: SignupModalProps) {
  const navigate = useNavigate();
  const { signInWithOAuth } = useAuth();

  const [role, setRole] = useState<'freelancer' | 'client' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingUser, setExistingUser] = useState(false);

  // Sync role from initialRole when modal opens (only if explicitly provided via URL)
  useEffect(() => {
    if (isOpen && initialRole) {
      setRole(initialRole);
    } else if (isOpen && !initialRole) {
      setRole(null);
    }
  }, [isOpen, initialRole]);

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
    <Modal isOpen={isOpen} onClose={onClose} title="Create your account">
      {/* Subtle Background Decorations */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/50 rounded-full blur-2xl -mr-12 -mt-12 opacity-60 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-100/50 rounded-full blur-2xl -ml-12 -mb-12 opacity-60 pointer-events-none"></div>

      <div className="relative animate-fade-in-content">
        <p className="text-slate-500 mb-5 text-sm">
          Tell us how you want to use Growlancer, then continue with GitHub or LinkedIn. Your
          profile is created automatically.
        </p>

        {/* ⚠️ Existing Session Banner — Dismissible, NOT blocking */}
        {existingUser && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">Already logged in</p>
                <p className="text-xs text-amber-600 leading-relaxed">
                  You can still create a new account below. Logging out first is recommended.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { onClose(); navigate(role === 'client' ? '/client' : '/dashboard'); }}
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
                ← Log out of the current account
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

        {/* Role Selection */}
        <div className="space-y-1.5 mb-5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">
            I want to…
          </label>
          <div className="grid grid-cols-2 gap-3.5 sm:gap-3">
            <label
              className={`cursor-pointer flex items-center gap-3 sm:gap-3.5 p-2.5 sm:p-3.5 border-2 rounded-xl transition-all min-w-0 ${
                role === 'freelancer'
                  ? 'border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-500/10'
                  : role === null
                  ? 'border-slate-200 hover:border-orange-300 bg-slate-50/50 hover:bg-orange-50/30'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-100/50'
              }`}
            >
              <input
                type="radio"
                name="role"
                value="freelancer"
                checked={role === 'freelancer'}
                onChange={() => { setRole('freelancer'); setError(null); }}
                className="sr-only"
              />
              <div className={`shrink-0 flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-lg border ${
                role === 'freelancer'
                  ? 'bg-emerald-100 border-emerald-200 text-emerald-600'
                  : role === null
                  ? 'bg-white border-orange-200 text-slate-400'
                  : 'bg-white border-slate-200 text-slate-400'
              } transition-all`}>
                <User className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">Freelance</span>
                <span className="text-xs text-slate-400 hidden sm:block truncate">Work &amp; earn</span>
              </div>
            </label>
            <label
              className={`cursor-pointer flex items-center gap-3 sm:gap-3.5 p-2.5 sm:p-3.5 border-2 rounded-xl transition-all min-w-0 ${
                role === 'client'
                  ? 'border-emerald-500 bg-emerald-50/50 shadow-sm shadow-emerald-500/10'
                  : role === null
                  ? 'border-slate-200 hover:border-orange-300 bg-slate-50/50 hover:bg-orange-50/30'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-100/50'
              }`}
            >
              <input
                type="radio"
                name="role"
                value="client"
                checked={role === 'client'}
                onChange={() => { setRole('client'); setError(null); }}
                className="sr-only"
              />
              <div className={`shrink-0 flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-lg border ${
                role === 'client'
                  ? 'bg-emerald-100 border-emerald-200 text-emerald-600'
                  : role === null
                  ? 'bg-white border-orange-200 text-slate-400'
                  : 'bg-white border-slate-200 text-slate-400'
              } transition-all`}>
                <Briefcase className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate">Hire Talent</span>
                <span className="text-xs text-slate-400 hidden sm:block truncate">Find &amp; hire</span>
              </div>
            </label>
          </div>
          {role === null && (
            <p className="text-xs text-orange-500 font-medium ml-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Please select a role to continue
            </p>
          )}
        </div>

        {/* GitHub & LinkedIn — the only sign-up methods */}
        <OAuthButtons
          onSelect={async (provider) => {
            setError(null);
            if (!role) {
              setError('Please choose Freelance or Hire Talent to continue.');
              return { success: false };
            }
            return signInWithOAuth(provider, role);
          }}
          onError={setError}
        />

        {/* Trust note — honest, Growlancer-branded */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-100 p-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            We use the name and email from your provider to create your Growlancer profile. We
            never see your password and never post anything to your accounts.
          </p>
        </div>

        {/* Terms */}
        <p className="mt-4 text-center text-xs text-slate-400 leading-relaxed">
          By creating an account, you agree to our{' '}
          <Link to="/terms" className="text-emerald-600 font-medium hover:text-emerald-700 transition-colors">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="text-emerald-600 font-medium hover:text-emerald-700 transition-colors">
            Privacy Policy
          </Link>
          .
        </p>

        {/* Login Redirect */}
        <div className="mt-5 text-center">
          <p className="text-slate-600 text-sm">
            Already have an account?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-emerald-600 font-semibold hover:text-emerald-700 transition-all duration-200 hover:scale-105"
            >
              Log in here
            </button>
          </p>
        </div>
      </div>
    </Modal>
  );
}
