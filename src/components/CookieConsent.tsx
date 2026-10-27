import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Check,
  Cookie,
  Lock,
  Settings2,

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

  const handleAcceptAll = useCallback(() => commit(true), [commit]);
  const handleRejectOptional = useCallback(() => commit(false), [commit]);

  const openPanel = useCallback(() => {
    const stored = readConsent();
    setDraftAnalytics(stored?.analytics === true);
    setStorageError(null);
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPanelOpen(true);
  }, []);

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
      {/* A small, playful box rather than a wall of legal text: the mascot has
          already eaten the cookies, the promise is one sentence long, and the
          cross is a first-class action (it dismisses AND keeps optional storage
          off — hiding the box can never be mistaken for "allowed everything"). */}
      {showNotice && (
        <div
          ref={bannerRef}
          role="dialog"
          aria-labelledby="cookie-notice-title"
          aria-describedby="cookie-notice-body"
          className={`fixed bottom-0 left-0 right-0 z-[60] px-3 pb-3 sm:px-6 sm:pb-5 transition-all duration-300 ease-out ${
            animateIn ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
          }`}
        >
          <div className="mx-auto max-w-[62rem]">
            <div className="relative overflow-hidden rounded-2xl bg-[#08110D] ring-1 ring-emerald-500/25 shadow-2xl shadow-black/40">
              <div className="pointer-events-none absolute -top-20 -right-12 h-44 w-44 rounded-full bg-emerald-500/10 blur-3xl" />

              <div className="relative flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5 sm:px-5">
                {/* Identity: the cookie icon + the joke, kept to two lines */}
                <div className="flex items-start gap-3 sm:flex-1 min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25 flex items-center justify-center">
                    <Cookie className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="cookie-notice-title"
                      className="text-sm font-bold text-white leading-snug"
                    >
                      We ate your cookies <span aria-hidden="true">🍪</span>
                    </h2>
                    <p
                      id="cookie-notice-body"
                      className="mt-0.5 text-xs text-emerald-100/60 leading-relaxed"
                    >
                      For a better experience. Sign-in and security storage stays on; nothing
                      optional runs unless you allow it.
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-100/40">
                      No advertising or cross-site tracking.{' '}
                      <Link
                        to="/cookies"
                        className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium"
                      >
                        Cookie Policy
                      </Link>
                    </p>
                  </div>
                </div>

                {/* Actions.
                    Mobile: full-width, stacked column-reverse so the primary
                    "Accept all" sits ABOVE the secondary control, with padding
                    reserved on the right for the absolutely-positioned cross.
                    `flex-wrap` means any future label change degrades into a
                    second line instead of pushing past the card edge.
                    ≥sm: back to a normal horizontal row that hugs the right. */}
                <div className="w-full sm:w-auto flex flex-col-reverse sm:flex-row flex-wrap items-center justify-center sm:justify-end gap-2 sm:shrink-0 pr-12 sm:pr-0">
                  <button
                    type="button"
                    onClick={openPanel}
                    className="hidden sm:inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl text-xs font-semibold text-emerald-100/70 hover:text-white hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Manage
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectOptional}
                    className="inline-flex items-center justify-center min-h-[40px] px-3.5 rounded-xl text-xs font-semibold text-emerald-50 bg-white/5 ring-1 ring-white/10 hover:bg-white/10 hover:ring-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    Reject optional
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptAll}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    Accept all
                  </button>
                  {/* The cross: same decision as "Reject optional", so it can
                      never be read as agreement. Parked in the card's
                      bottom-right corner on mobile so it does not consume any
                      of the button row's width; inline again from `sm`. */}
                  <button
                    type="button"
                    onClick={handleRejectOptional}
                    aria-label="Close — reject optional cookies"
                    title="Close"
                    className="absolute bottom-2 right-2 sm:static inline-flex items-center justify-center h-10 w-10 sm:-mr-1 rounded-xl text-emerald-100/60 hover:text-white hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {storageError && (
                <p
                  role="alert"
                  className="relative mx-4 mb-3 sm:mx-5 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 p-2.5 text-[11px] text-amber-200 leading-relaxed"
                >
                  {storageError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
