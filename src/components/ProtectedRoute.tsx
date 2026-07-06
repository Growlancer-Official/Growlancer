import { Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { UserRole } from '../types/auth';
import { captureInfo, captureError } from '../lib/telemetry';

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
            <img src="/UpdatedLogo.png" alt="Growlancer" className="h-12 w-12 rounded-xl" />
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
          .select('role, suspended_at')
          .eq('id', user.id)
          .single();

        // Check if user is suspended
        if (profileResult?.suspended_at) {
          captureInfo('ProtectedRoute: suspended user blocked', { userId: user.id });
          await supabase.auth.signOut();
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
  useEffect(() => {
    let cancelled = false;
    async function checkEmailVerified() {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        setEmailConfirmed(!!data?.user?.email_confirmed_at);
      } catch {
        if (!cancelled) setEmailConfirmed(false);
      } finally {
        if (!cancelled) setCheckingEmail(false);
      }
    }
    checkEmailVerified();
    return () => { cancelled = true; };
  }, []);

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

  // Block access if email not verified
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
  if (user.onboardingCompleted === false) {
    const onboardingPath = user.role === 'client' ? '/onboarding/client' : '/onboarding/freelancer';
    if (!window.location.pathname.startsWith('/onboarding')) {
      return <Navigate to={onboardingPath} replace />;
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
