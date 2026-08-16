import { Navigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, clearSupabaseAuthStorage, isStaleSessionError } from '../lib/supabase';
import type { UserRole } from '../types/auth';
import { captureInfo, captureError } from '../lib/telemetry';
import { ShieldCheck } from 'lucide-react';

// ── KYC Verification Page — shown when the user has not completed identity
// verification yet. Professional message + benefits + encouragement, with a
// clear CTA to the KYC page. Both freelancers and clients must verify.
function KycRequiredPage({ redirect }: { redirect: string }) {
  const { user } = useAuth();
  const isClient = user?.role === 'client';
  const kycPath = isClient ? '/client/verification' : '/dashboard/identity-verification';
  const to = `${kycPath}?redirect=${encodeURIComponent(redirect)}`;

  const benefits = isClient
    ? [
        { icon: '🛡️', text: 'Trusted payments — your money stays protected in escrow with verified partners' },
        { icon: '✅', text: 'Verified freelancers only — work with professionals who passed identity checks' },
        { icon: '⚡', text: 'Faster hiring — verified clients get priority attention from top freelancers' },
      ]
    : [
        { icon: '🛡️', text: 'Unlock payments — escrow payouts release only to verified freelancers' },
        { icon: '✅', text: 'Verified badge on your profile — clients trust you more, you win more' },
        { icon: '⚡', text: 'Priority matching — verified freelancers rank higher in AI project matching' },
      ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 sm:p-10 text-center">
          <div className="flex justify-center mb-5">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-600/25">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">
            Verify Your Identity to Continue
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            To keep Growlancer safe and scam-free for everyone, all {isClient ? 'clients' : 'freelancers'} must
            complete a quick identity check before using the full platform. It takes under a minute and your
            documents are verified instantly.
          </p>

          <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5 mb-6 text-left space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-1">
              Why verify? Here's what you unlock
            </p>
            {benefits.map((b, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-base leading-6">{b.icon}</span>
                <p className="text-sm text-slate-600">{b.text}</p>
              </div>
            ))}
          </div>

          <Link
            to={to}
            className="flex items-center justify-center gap-2 w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl transition-all"
          >
            <ShieldCheck className="w-5 h-5" />
            Verify My Identity Now
          </Link>
          <p className="text-[11px] text-slate-400 mt-3">
            Government ID required (Aadhaar, PAN, Passport or Driver's License) — encrypted & never shared.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Email Verification Page ──
function EmailNotVerifiedPage() {
  const { logout } = useAuth();

  const getEmailProviderUrl = (email: string): string => {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail')) return 'https://mail.google.com';
    if (domain.includes('outlook') || domain.includes('hotmail')) return 'https://outlook.live.com';
    if (domain.includes('yahoo')) return 'https://mail.yahoo.com';
    if (domain.includes('proton')) return 'https://mail.proton.me';
    return 'https://mail.google.com';
  };

  const getEmailProviderName = (email: string): string => {
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail')) return 'Gmail';
    if (domain.includes('outlook')) return 'Outlook';
    if (domain.includes('hotmail')) return 'Hotmail';
    if (domain.includes('yahoo')) return 'Yahoo Mail';
    if (domain.includes('proton')) return 'Proton Mail';
    return 'your inbox';
  };

  // Get email from AuthContext via user
  const { user } = useAuth();
  const email = user?.email || '';
  const providerUrl = getEmailProviderUrl(email);
  const providerName = getEmailProviderName(email);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 text-center">
          <div className="flex justify-center mb-6">
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-12 w-12 rounded-xl" />
          </div>

          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
            Email not verified
          </h2>
          <p className="text-sm text-slate-500 mb-1">
            Please verify your email to access your dashboard.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            We sent a verification link to <strong className="text-slate-700">{email}</strong>
          </p>

          <a
            href={providerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl transition-all mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open {providerName}
          </a>

          <button
            onClick={logout}
            className="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

/** Paths that must stay reachable even before KYC is complete (the KYC page
 *  itself, profile/settings so the user can finish their profile, and the
 *  notification center so they never miss KYC updates). Everything else in
 *  the dashboards requires a verified identity. */
const KYC_EXEMPT_PATHS = [
  '/dashboard/identity-verification',
  '/client/verification',
  '/dashboard/profile',
  '/client/settings',
  '/dashboard/notifications',
  '/client/notifications',
  '/dashboard/ai-assistant',
  '/client/ai-assistant',
];

function isKycExemptPath(pathname: string): boolean {
  return KYC_EXEMPT_PATHS.some((p) => pathname.startsWith(p));
}

/** Fields required for profile completion gating */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, role, getDashboardRoute, user } = useAuth();
  const [serverRole, setServerRole] = useState<UserRole | null>(null);
  const [verifying, setVerifying] = useState(true);
  // ── KYC verification state (server-side source of truth: profiles.verification_status) ──
  // Stores the raw status ('none' | 'pending' | 'verified' | 'rejected' | 'blocked')
  // so the gate can show different UX: never-submitted users get the benefits
  // gate screen, while pending-review users go straight to the in-progress stepper.
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [checkingKyc, setCheckingKyc] = useState(true);
  // ── Email verification state (ALWAYS declared before any early return) ──
  const [emailConfirmed, setEmailConfirmed] = useState<boolean | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(true);

  // ── Server-side role verification + suspension check (ALWAYS called) ──
  useEffect(() => {
    let cancelled = false;

    async function verifyServerRole() {
      try {
        if (!user?.id) {
          if (!cancelled) setVerifying(false);
          return;
        }

        const { data: profileResult, error: profileError } = await supabase
          .from('profiles')
          .select('role, suspended_at')
          .eq('id', user.id)
          .single();

        // Check if user is suspended
        if (profileResult?.suspended_at) {
          captureInfo('ProtectedRoute: suspended user blocked', { userId: user.id });
          await supabase.auth.signOut().catch(() => {});
          clearSupabaseAuthStorage();
          window.location.href = '/?modal=login';
          if (!cancelled) { setVerifying(false); }
          return;
        }

        if (cancelled) return;

        // Handle role check
        if (profileError) {
          captureError('ProtectedRoute: server role verification failed', {
            source: 'auth', userId: user.id, message: profileError.message,
          });
          setServerRole(role);
        } else if (profileResult) {
          const dbRole = profileResult.role as UserRole;
          setServerRole(dbRole);
          if (dbRole !== role) {
            captureInfo('ProtectedRoute: client/server role mismatch detected', {
              clientRole: role, serverRole: dbRole, userId: user.id,
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          captureError('ProtectedRoute: server role verification threw', {
            source: 'auth', userId: user.id,
            error: err instanceof Error ? err.message : String(err),
          });
          setServerRole(role);
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    }

    verifyServerRole();
    return () => { cancelled = true; };
  }, [user?.id, role]);

  // ── KYC verification check — both freelancers and clients must complete
  // identity verification to use the platform. Fetched from the server once
  // per route mount; admin users are never gated.
  useEffect(() => {
    let cancelled = false;
    async function checkKyc() {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('verification_status, role')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          // Fail open on transient errors — never lock a user out of the whole
          // platform because of a network blip; the KYC gate re-checks on the
          // next navigation.
          setKycStatus('verified');
        } else if (data?.role === 'admin') {
          setKycStatus('verified');
        } else {
          setKycStatus(data?.verification_status || 'none');
        }
      } catch {
        if (!cancelled) setKycStatus('verified');
      } finally {
        if (!cancelled) setCheckingKyc(false);
      }
    }
    checkKyc();
    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Email verification check effect (ALWAYS called before early returns) ──
  // GitHub/LinkedIn OAuth already verified identity at the provider — those
  // users ALWAYS pass regardless of email_confirmed_at (no "Open Gmail"
  // block, no verify-email redirect). They can verify their email later from
  // Settings. Only email/password signups with an unconfirmed email are gated.
  //
  // 🔥 STALE SESSION: if getUser() fails or returns no user, the session in
  // localStorage belongs to a user that no longer exists server-side (deleted
  // from Supabase). That is NOT "email not verified" — it's a dead session.
  // Force-clear it and redirect to login so the user isn't stuck on the
  // "Email not verified" screen with a logout that never sticks.
  useEffect(() => {
    let cancelled = false;
    async function checkEmailVerified() {
      // Skip until the session user is loaded — avoids a redundant getUser()
      // call on mount and a possible content flash before a blocked user is
      // bounced (the [user?.id] dep re-runs this once the user resolves).
      if (!user?.id) return;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;

        if (isStaleSessionError(error)) {
          // User no longer exists server-side (401 / 'user not found') → dead
          // session → force logout. Transient network errors are NOT stale —
          // they fall through to the normal (cached) email check below.
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          clearSupabaseAuthStorage();
          if (!cancelled) {
            setCheckingEmail(false);
            window.location.replace('/?modal=login');
          }
          return;
        }
        if (error && !data?.user) {
          // Transient network error — fall back to the session cached in local
          // storage (getSession resolves locally, no network) so OAuth users are
          // never falsely blocked, and cached email state for everyone else.
          const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
          const cachedUser = sessionData?.session?.user ?? null;
          const cachedProvider = cachedUser?.app_metadata?.provider as string | undefined;
          const cachedIsOAuth =
            cachedProvider === 'github' || cachedProvider === 'linkedin_oidc';
          setEmailConfirmed(cachedIsOAuth || !!cachedUser?.email_confirmed_at);
          return;
        }

        const provider = data.user.app_metadata?.provider as string | undefined;
        const isOAuthProvider =
          provider === 'github' || provider === 'linkedin_oidc';
        const confirmed = !!data.user.email_confirmed_at;
        // GitHub/LinkedIn OAuth → always pass (provider verified identity at
        // sign-in; app-level confirmation is optional, done later from Settings).
        // Only email/password signups require email confirmation.
        setEmailConfirmed(confirmed || isOAuthProvider);
      } catch {
        if (!cancelled) setEmailConfirmed(false);
      } finally {
        if (!cancelled) setCheckingEmail(false);
      }
    }
    checkEmailVerified();
    return () => { cancelled = true; };
    // user?.id dep: re-run once the session user is loaded so the check (and
    // its storage-cached fallback) always runs with the real session in place.
  }, [user?.id]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  // ── Unauthenticated → redirect to login ──
  if (!isAuthenticated || !user) {
    captureInfo('Protected route blocked unauthenticated access', {
      routeType: 'protected',
    });
    return <Navigate to="/?modal=login" replace />;
  }

  if (checkingEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  // Block access if email not verified (email/password signups only — OAuth
  // users already passed above, so they never land here)
  if (!emailConfirmed) {
    return <EmailNotVerifiedPage />;
  }

  // ── Verifying server role ──
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  // ── Onboarding check ──
  // ONE onboarding route for everyone (email, OAuth, invite) — the role is
  // chosen on the onboarding welcome step, so there are no role-specific
  // onboarding paths anymore.
  if (user.onboardingCompleted === false) {
    if (!window.location.pathname.startsWith('/onboarding')) {
      return <Navigate to="/onboarding" replace />;
    }
  }

  // ── KYC check (after onboarding, before role gate) ──
  // Both freelancers and clients must complete identity verification to use
  // the platform. The KYC page itself (and a few maintenance routes) are
  // exempt so the user can actually complete verification. On completion the
  // page redirects back to the original destination via the ?redirect= param.
  if (checkingKyc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }
  if (kycStatus && kycStatus !== 'verified' && !isKycExemptPath(window.location.pathname)) {
    const kycPath = user?.role === 'client' ? '/client/verification' : '/dashboard/identity-verification';
    const kycTo = `${kycPath}?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    captureInfo('ProtectedRoute: unverified user gated on KYC', {
      userId: user.id,
      path: window.location.pathname,
      status: kycStatus,
    });
    // Submitted & in review → go straight to the KYC page, which shows the
    // "Verification In Progress" stepper (no point showing the start-verification
    // gate — the user has already done their part and is waiting on the review).
    if (kycStatus === 'pending') {
      return <Navigate to={kycTo} replace />;
    }
    return <KycRequiredPage redirect={window.location.pathname + window.location.search} />;
  }

  // ── Role-based access ──
  const effectiveRole = serverRole ?? role;
  if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
    captureInfo('ProtectedRoute: role-based access denied', {
      requiredRoles: allowedRoles,
      userRole: effectiveRole,
      userId: user.id,
    });
    return <Navigate to={getDashboardRoute()} replace />;
  }

  // ── Render protected content ──
  return <>{children}</>;
}
