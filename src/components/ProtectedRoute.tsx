import { Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, clearSupabaseAuthStorage, isStaleSessionError } from '../lib/supabase';
import type { UserRole } from '../types/auth';
import { captureInfo, captureError } from '../lib/telemetry';
import { LayoutSkeleton } from './LayoutSkeleton';

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
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 text-center">
          <div className="flex justify-center mb-3">
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-12 w-12 rounded-xl" />
          </div>

          <div className="flex justify-center mb-2">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
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
          <p className="text-sm text-slate-500 mb-3">
            We sent a verification link to <strong className="text-slate-700">{email}</strong>
          </p>

          <a
            href={providerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl transition-all mb-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

/** Fields required for profile completion gating */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, role, getDashboardRoute, user } = useAuth();
  const [serverRole, setServerRole] = useState<UserRole | null>(null);
  const [verifying, setVerifying] = useState(true);
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
          .select('role')
          .eq('id', user.id)
          .single();
        const { data: privResult } = await supabase
          .from('profiles_private')
          .select('suspended_at')
          .eq('id', user.id)
          .maybeSingle();
        const suspended_at = privResult?.suspended_at;

        // Check if user is suspended
        if (suspended_at) {
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

  // ── Loading state — full layout skeleton (matches actual dashboard) ──
  if (isLoading) {
    return <LayoutSkeleton />;
  }

  // ── Unauthenticated → redirect to login ──
  if (!isAuthenticated || !user) {
    captureInfo('Protected route blocked unauthenticated access', {
      routeType: 'protected',
    });
    return <Navigate to="/?modal=login" replace />;
  }

  if (checkingEmail) {
    return <LayoutSkeleton />;
  }

  // Block access if email not verified (email/password signups only — OAuth
  // users already passed above, so they never land here)
  if (!emailConfirmed) {
    return <EmailNotVerifiedPage />;
  }

  // ── Verifying server role ──
  if (verifying) {
    return <LayoutSkeleton />;
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
