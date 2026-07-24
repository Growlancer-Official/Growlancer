import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Cookie,
  Shield,
  Settings,
  BarChart3,
  Megaphone,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

export type ConsentCategory = 'necessary' | 'functional' | 'analytics' | 'marketing';

export interface ConsentPreferences {
  necessary: true; // Always required
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
  version: number;
}

const CONSENT_VERSION = 1;
const STORAGE_KEY = 'growlancer_consent';

const CATEGORY_INFO: {
  id: ConsentCategory;
  label: string;
  icon: typeof Shield;
  description: string;
  alwaysOn?: boolean;
}[] = [
  {
    id: 'necessary',
    label: 'Necessary',
    icon: Shield,
    description: 'Required for the platform to function. Includes authentication tokens, session management, and security features.',
    alwaysOn: true,
  },
  {
    id: 'functional',
    label: 'Functional',
    icon: Settings,
    description: 'Enables enhanced features like language preferences, theme selection, and saved settings.',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    description: 'Helps us understand how you use the platform — page views, feature usage, and error reports via Sentry.',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    description: 'Used for personalized advertisements and promotional content. We respect your privacy — this is off by default.',
  },
];

// ─── Load/Save ──────────────────────────────────────────────────────

function loadConsent(): ConsentPreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentPreferences;
    if (parsed.version === CONSENT_VERSION) return parsed;
    return null; // Stale version → show banner again
  } catch {
    return null;
  }
}

function saveConsent(prefs: Omit<ConsentPreferences, 'timestamp' | 'version'>): ConsentPreferences | null {
  try {
    const full: ConsentPreferences = {
      ...prefs,
      necessary: true,
      timestamp: new Date().toISOString(),
      version: CONSENT_VERSION,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    return full;
  } catch {
    return null;
  }
}

function getDefaultPreferences(): Omit<ConsentPreferences, 'timestamp' | 'version'> {
  return {
    necessary: true,
    functional: false,
    analytics: false,
    marketing: false,
  };
}

// ─── Component ──────────────────────────────────────────────────────

export function CookieConsent() {
  const [consent, setConsent] = useState<ConsentPreferences | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [customPrefs, setCustomPrefs] = useState(getDefaultPreferences());
  const [animateIn, setAnimateIn] = useState(false);

  // Load existing consent on mount
  useEffect(() => {
    const existing = loadConsent();
    if (existing) {
      setConsent(existing);
    } else {
      // Delay showing banner to let page render first
      const timer = setTimeout(() => {
        setShowBanner(true);
        // Trigger slide-in animation after mount
        requestAnimationFrame(() => setAnimateIn(true));
      }, 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = useCallback(() => {
    const prefs = saveConsent({
      necessary: true,
      functional: true,
      analytics: true,
      marketing: true,
    });
    if (!prefs) return; // localStorage unavailable
    setConsent(prefs);
    setShowCustomize(false);
    setTimeout(() => setShowBanner(false), 300);
  }, []);

  const handleRejectAll = useCallback(() => {
    const prefs = saveConsent(getDefaultPreferences());
    if (!prefs) return; // localStorage unavailable
    setConsent(prefs);
    setShowCustomize(false);
    setTimeout(() => setShowBanner(false), 300);
  }, []);

  const handleSaveCustom = useCallback(() => {
    const prefs = saveConsent(customPrefs);
    if (!prefs) return; // localStorage unavailable
    setConsent(prefs);
    setShowCustomize(false);
    setTimeout(() => setShowBanner(false), 300);
  }, [customPrefs]);

  const handleOpenCustomize = useCallback(() => {
    setCustomPrefs({
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    });
    setShowCustomize(true);
  }, []);

  const toggleCustom = (id: ConsentCategory) => {
    if (id === 'necessary') return; // Always on
    setCustomPrefs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // If consent is already given, don't show anything
  if (consent) return null;
  if (!showBanner) return null;

  return (
    <>
      {/* Backdrop overlay — only when customize is open */}
      {showCustomize && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
          onClick={() => setShowCustomize(false)}
        />
      )}

      {/* Main Banner */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-500 ease-out ${
          animateIn ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        }`}
      >
        <div className="mx-auto max-w-7xl px-3 sm:px-6 pb-3 sm:pb-6">
          <div
            className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            }}
          >
            {/* Decorative gradient orbs */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 p-4 sm:p-6 lg:p-8">
              {/* Banner Content — Two column on desktop */}
              <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-8">
                {/* Left: Icon + Text */}
                <div className="flex items-start gap-4 lg:flex-1">
                  <div className="hidden sm:flex h-12 w-12 shrink-0 rounded-xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center">
                    <Cookie className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-white mb-1.5 flex items-center gap-2">
                      <Cookie className="w-5 h-5 text-emerald-400 sm:hidden" />
                      Your Privacy Matters
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-2xl">
                      We use cookies and similar technologies to enhance your experience, analyze traffic, 
                      and personalize content. You can choose which categories to allow. 
                      Read our{' '}
                      <Link
                        to="/cookies"
                        className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors font-medium"
                      >
                        Cookie Policy
                      </Link>{' '}
                      for more details.
                    </p>
                  </div>
                </div>

                {/* Right: Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 shrink-0">
                  <button
                    onClick={handleOpenCustomize}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Customize
                  </button>
                  <button
                    onClick={handleRejectAll}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject All
                  </button>
                  <button
                    onClick={handleAcceptAll}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Accept All
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Customize Modal ─────────────────────────────────────────── */}
      {showCustomize && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-2xl border border-white/10 shadow-2xl transition-all duration-300 ${
              showCustomize ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
            }`}
            style={{
              background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 pb-4 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Cookie className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Cookie Preferences</h3>
                    <p className="text-[11px] text-slate-500">Choose which cookies to allow</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCustomize(false)}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body — Category Toggles */}
            <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
              {CATEGORY_INFO.map(cat => {
                const isOn = cat.alwaysOn ? true : customPrefs[cat.id];
                const Icon = cat.icon;
                return (
                  <div
                    key={cat.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isOn
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-white/[0.02] border-white/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${
                            isOn ? 'bg-emerald-500/10' : 'bg-white/5'
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 ${
                              isOn ? 'text-emerald-400' : 'text-slate-500'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">
                              {cat.label}
                            </span>
                            {cat.alwaysOn && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Always On
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                            {cat.description}
                          </p>
                        </div>
                      </div>

                      {/* Toggle Switch */}
                      {!cat.alwaysOn && (
                        <button
                          onClick={() => toggleCustom(cat.id)}
                          className={`relative shrink-0 w-10 h-6 rounded-full transition-all duration-200 ${
                            isOn ? 'bg-emerald-500' : 'bg-slate-700'
                          }`}
                          aria-label={`Toggle ${cat.label} cookies`}
                        >
                          <div
                            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              isOn ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-6 pt-4 border-t border-white/5">
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={handleRejectAll}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  Reject All
                </button>
                <button
                  onClick={handleSaveCustom}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save Preferences
                </button>
              </div>
              <div className="mt-3 text-center">
                <Link
                  to="/cookies"
                  onClick={() => setShowCustomize(false)}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-emerald-400 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  View Full Cookie Policy
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Check if user has consented to a specific cookie category.
 * Returns `true` for "necessary" since it's always required.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function hasConsent(category: ConsentCategory): boolean {
  if (category === 'necessary') return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const prefs = JSON.parse(raw) as ConsentPreferences;
    return prefs[category] === true;
  } catch {
    return false;
  }
}
