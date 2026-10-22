import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertCircle, ArrowRight, RotateCcw, ShieldCheck } from 'lucide-react';
import { Modal } from './Modal';
import { useAuth } from '../context/AuthContext';
import {
  alternateProvider,
  clearOAuthAttempt,
  describeOAuthFailure,
  isStaleAttempt,
  providerDisplayName,
  readOAuthAttempt,
  type OAuthProvider,
} from '../lib/oauthDiagnostics';

/**
 * OAuthReturnNotice — the honest answer to an unanswered provider round-trip.
 *
 * The failure it was built for (founder report, Oct 14 2026): "LinkedIn se
 * signup nahi ho raha". The live logs showed the redirect to LinkedIn and then
 * nothing — the browser never came back to /auth/callback, so no code path in
 * the app could react. The user saw a dead end and the founder had nothing to
 * debug.
 *
 * `signInWithOAuth` now writes a breadcrumb before leaving for the provider.
 * This component checks it on load: if a sign-in was started in an earlier page
 * load, the visitor is back, and still has no session — the provider did not
 * complete the handshake. We say so plainly, name the provider, confirm that
 * nothing was created or changed, and offer both a retry and the other
 * provider. On /auth/callback the callback page owns the messaging, so this
 * stays out of its way.
 */
export function OAuthReturnNotice() {
  const { user, isAuthenticated, signInWithOAuth } = useAuth();
  const location = useLocation();
  const [attemptProvider, setAttemptProvider] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<OAuthProvider | null>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (dismissedRef.current) return;
    if (isAuthenticated || user) {
      // Signed in — whatever happened, it resolved. Never nag a logged-in user.
      clearOAuthAttempt();
      setAttemptProvider(null);
      return;
    }
    // The callback page renders its own truthful state; don't stack on top of it.
    if (location.pathname.startsWith('/auth/')) return;

    const attempt = readOAuthAttempt();
    if (!attempt || !isStaleAttempt(attempt)) return;
    setAttemptProvider(attempt.provider);
  }, [isAuthenticated, user, location.pathname]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    clearOAuthAttempt();
    setAttemptProvider(null);
  }, []);

  const retry = useCallback(
    async (provider: OAuthProvider) => {
      setRetrying(provider);
      // Keep the breadcrumb until we actually leave; beginOAuthAttempt refreshes
      // its timestamp so a second stall is still detected.
      const result = await signInWithOAuth(provider);
      if (!result.success) {
        setRetrying(null);
        console.error('[oauth] retry could not start:', result.error ?? 'unknown error');
      }
    },
    [signInWithOAuth]
  );

  if (!attemptProvider) return null;

  const providerName = providerDisplayName(attemptProvider);
  const otherProvider = alternateProvider(attemptProvider);
  const otherName = providerDisplayName(otherProvider);
  const copy = describeOAuthFailure({ provider: attemptProvider });

  return (
    <Modal isOpen onClose={dismiss} title={copy.title}>
      <div className="animate-fade-in-content">
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-relaxed">{copy.message}</p>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => retry(attemptProvider as OAuthProvider)}
            disabled={retrying !== null}
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            <RotateCcw className="w-4 h-4" />
            {retrying === attemptProvider ? `Opening ${providerName}…` : `Try ${providerName} again`}
          </button>
          <button
            type="button"
            onClick={() => retry(otherProvider)}
            disabled={retrying !== null}
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            {retrying === otherProvider ? `Opening ${otherName}…` : `Continue with ${otherName} instead`}
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full h-10 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Dismiss
          </button>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-100 p-3">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">
            No account was created and nothing on Growlanzo was changed — an unfinished sign-in
            leaves no trace. Support can see which provider was started if you need help.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export default OAuthReturnNotice;
