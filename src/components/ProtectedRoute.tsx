import { Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type { UserRole } from '../types/auth';
import { captureInfo, captureError } from '../lib/telemetry';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

/** Fields required for profile completion gating */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, role, getDashboardRoute, user } = useAuth();
  const location = useLocation();
  const [serverRoleVerified, setServerRoleVerified] = useState(false);
  const [serverRole, setServerRole] = useState<UserRole | null>(null);
  const [verifying, setVerifying] = useState(true);

  // ── Server-side role verification (ALWAYS called) ──
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

        if (cancelled) return;

        // Handle role check
        if (profileError) {
          captureError('ProtectedRoute: server role verification failed', {
            source: 'auth', userId: user.id, message: profileError.message,
          });
          setServerRole(role);
          setServerRoleVerified(false);
        } else if (profileResult) {
          const dbRole = profileResult.role as UserRole;
          setServerRole(dbRole);
          if (dbRole !== role) {
            captureInfo('ProtectedRoute: client/server role mismatch detected', {
              clientRole: role, serverRole: dbRole, userId: user.id,
            });
          }
          setServerRoleVerified(dbRole === role);
        }
      } catch (err) {
        if (!cancelled) {
          captureError('ProtectedRoute: server role verification threw', {
            source: 'auth', userId: user.id,
            error: err instanceof Error ? err.message : String(err),
          });
          setServerRole(role);
          setServerRoleVerified(false);
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    }

    verifyServerRole();
    return () => { cancelled = true; };
  }, [user?.id, role]);

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
