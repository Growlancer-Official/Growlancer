import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Check,
  Cookie,
  Lock,
  X,
} from 'lucide-react';
import {
  type ConsentPreferences,
  onOpenConsentPreferences,
  readConsent,
  writeConsent,
} from '../lib/consent';

// ────────────────────────────────────────────────────────────────────────────
// CookieConsent — the notice Growlanzo actually stands behind.
//
// Two categories, because two things exist:
//   • Strictly necessary — the Supabase auth session, the inactivity marker,
//     the OAuth return breadcrumb and this record. Signing in is impossible
//     without them, so they are not offered as a switch.
//   • Analytics — Vercel Analytics + Speed Insights. Cookieless, aggregate,
//     off by default, and not loaded until this says yes.
//
// There is no marketing/advertising category: nothing in the product embeds an
// ad pixel, builds a profile, or shares data with an ad network. Claiming
// otherwise to look "complete" would be the one thing a consent banner must
// never do.
//
// The choice survives reloads (localStorage, not a cookie — it never needs to
// reach the server). It is reopenable forever from the footer and the Cookie
// Policy, which is what makes "Reject optional" a real decision rather than a
// one-way door.
// ────────────────────────────────────────────────────────────────────────────

/** Delay before the notice appears so it never fights the first paint. */
const SHOW_DELAY_MS = 600;

export function CookieConsent() {
  const [decision, setDecision] = useState<ConsentPreferences | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // Draft state for the panel — nothing is persisted until Save/Reject.
  const [draftAnalytics, setDraftAnalytics] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const bannerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // ── Load the stored decision ──────────────────────────────────────────────
  useEffect(() => {
    const stored = readConsent();
    if (stored) {
      setDecision(stored);
      setDraftAnalytics(stored.analytics);
      return;
    }
    const timer = setTimeout(() => {
      setBannerVisible(true);
      // Next frame, so the transition actually runs instead of being skipped.
      requestAnimationFrame(() => setAnimateIn(true));
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // ── Reopen from anywhere (footer, Cookie Policy) ──────────────────────────
  useEffect(
    () =>
      onOpenConsentPreferences(() => {
        const stored = readConsent();
        setDraftAnalytics(stored?.analytics === true);
        setStorageError(null);
        previouslyFocused.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setPanelOpen(true);
        // A visitor who already answered gets the panel only — the notice is
        // not shown again (it would sit behind the backdrop and then flash as
        // the panel closes).
        if (!readConsent()) {
          setBannerVisible(true);
          setAnimateIn(true);
        }
      }),
    []
  );

  /**
   * Publish the notice's measured height so full-height dashboard sidebars can
   * subtract it from 100vh. Without this the sidebar's last actions (Homepage /
   * Logout) sit underneath the notice and cannot be clicked.
   */
  useEffect(() => {
    const el = bannerRef.current;
    if (!bannerVisible || !el) {
      document.documentElement.style.removeProperty('--consent-banner-h');
      return;
    }
    const apply = () => {
      document.documentElement.style.setProperty('--consent-banner-h', `${el.offsetHeight}px`);
    };
    apply();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty('--consent-banner-h');
    };
  }, [bannerVisible, panelOpen]);

  const dismissBanner = useCallback(() => {
    setAnimateIn(false);
    // Let the slide-out finish before unmounting, so it does not snap away.
    setTimeout(() => setBannerVisible(false), 300);
  }, []);

  const commit = useCallback(
    (analytics: boolean) => {
      const record = writeConsent(analytics);
      if (!record) {
        // Storage blocked. Keeping the notice up is the honest behaviour: the
        // answer could not be remembered, so pretending it was would silently
        // re-ask next page.
        setStorageError(
          'Your browser is blocking site storage, so this choice cannot be saved. Allow storage for this site, or change it in your browser settings.'
        );
        return;
      }
      setStorageError(null);
      setDecision(record);
      setDraftAnalytics(record.analytics);
      setPanelOpen(false);
      dismissBanner();
    },
    [dismissBanner]
  );

  const handleRejectOptional = useCallback(() => commit(false), [commit]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setStorageError(null);
    previouslyFocused.current?.focus?.();
    // If the visitor has never answered, the notice stays up behind the panel.
    if (decision) setBannerVisible(false);
  }, [decision]);

  // ── Panel keyboard behaviour: Escape closes, Tab stays inside ─────────────
  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    // Move focus into the panel so keyboard users are not left behind it.
    const firstControl = panelRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input, [href]'
    );
    firstControl?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [panelOpen, closePanel]);

  const answered = decision !== null;
  const showNotice = bannerVisible && (!answered || panelOpen);

  return (
    <>
      {/* ── Preferences panel ─────────────────────────────────────────────── */}
      {panelOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closePanel}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-prefs-title"
            className="relative w-full sm:max-w-lg overflow-hidden rounded-t-2xl sm:rounded-2xl border border-emerald-500/25 bg-[#08110D] shadow-2xl shadow-black/50"
          >
            <div className="flex items-start justify-between gap-4 p-5 pb-4 border-b border-white/10">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center">
                  <Cookie className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="cookie-prefs-title" className="text-base font-bold text-white">
                    Cookie preferences
                  </h2>
                  <p className="text-xs text-emerald-100/60 mt-0.5">
                    Choose what Growlanzo may store on this device.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="shrink-0 p-2 -m-1 rounded-lg text-emerald-100/60 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                aria-label="Close cookie preferences"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[52vh] overflow-y-auto">
              {/* Necessary — stated, not offered */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">Strictly necessary</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25">
                        Always on
                      </span>
                    </div>
                    <p className="text-xs text-emerald-100/60 mt-1 leading-relaxed">
                      Keeps you signed in, protects your session, and remembers this choice.
                      Without it GitHub/LinkedIn sign-in cannot work, so it cannot be turned off.
                    </p>
                  </div>
                </div>
              </div>

              {/* Analytics — the only optional thing, and it is real */}
              <div
                className={`rounded-xl border p-4 transition-colors ${
                  draftAnalytics
                    ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
                    : 'border-white/10 bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-white/5 flex items-center justify-center">
                      <BarChart3
                        className={`w-4 h-4 ${draftAnalytics ? 'text-emerald-400' : 'text-emerald-100/40'}`}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white">Analytics</h3>
                      <p className="text-xs text-emerald-100/60 mt-1 leading-relaxed">
                        Aggregate page views and real-user performance. Cookieless — it cannot
                        identify you, follow you to other sites, or build a profile. Off unless
                        you allow it.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draftAnalytics}
                    aria-label="Analytics"
                    onClick={() => setDraftAnalytics((value) => !value)}
                    className={`relative shrink-0 mt-1 w-11 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08110D] ${
                      draftAnalytics ? 'bg-emerald-500' : 'bg-white/20'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        draftAnalytics ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-emerald-100/40">
                No advertising, retargeting or cross-site tracking is used anywhere in Growlanzo.
                Full detail in the{' '}
                <Link
                  to="/cookies"
                  onClick={closePanel}
                  className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                >
                  Cookie Policy
                </Link>
                .
              </p>

              {storageError && (
                <p role="alert" className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-3 text-xs text-amber-200 leading-relaxed">
                  {storageError}
                </p>
              )}
            </div>

            <div className="p-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handleRejectOptional}
                className="sm:flex-1 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-semibold text-emerald-50 bg-white/5 ring-1 ring-white/15 hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Reject optional
              </button>
              <button
                type="button"
                onClick={() => commit(draftAnalytics)}
                className="sm:flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Save preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── The notice ────────────────────────────────────────────────────── */}
      {/* Deliberately small: one sentence, one cross, no choice buttons. The
          cross takes the safe decision (optional storage stays off), so
          dismissing can never be read as agreement. The full switches remain
          reachable from the footer and the Cookie Policy page — they are not
          offered here on purpose. */}
      {showNotice && (
        <div
          ref={bannerRef}
          role="dialog"
          aria-labelledby="cookie-notice-title"
          aria-describedby="cookie-notice-body"
          className={`fixed z-[60] bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-auto sm:w-[22rem] transition-all duration-300 ease-out ${
            animateIn ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
          }`}
        >
          <div className="relative overflow-hidden rounded-2xl bg-[#08110D] ring-1 ring-emerald-500/25 shadow-2xl shadow-black/40">
            <div className="pointer-events-none absolute -top-16 -right-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />

            <div className="relative flex items-start gap-3 p-4 pr-12">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center">
                <Cookie className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2
                  id="cookie-notice-title"
                  className="text-sm font-semibold text-white leading-snug"
                >
                  Cookies
                </h2>
                <p
                  id="cookie-notice-body"
                  className="mt-1 text-xs text-emerald-100/70 leading-relaxed"
                >
                  We use essential storage to keep you signed in and your session
                  secure. No advertising or cross-site tracking.
                </p>
                <Link
                  to="/cookies"
                  className="mt-1.5 inline-block text-[11px] font-medium text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                >
                  Cookie Policy
                </Link>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRejectOptional}
              aria-label="Close cookie notice"
              title="Close"
              className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-xl text-emerald-100/60 hover:text-white hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>

            {storageError && (
              <p
                role="alert"
                className="relative mx-4 mb-3 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-2.5 text-[11px] text-amber-200 leading-relaxed"
              >
                {storageError}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
