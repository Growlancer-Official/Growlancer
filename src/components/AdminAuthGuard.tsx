import { useEffect, useState, ReactNode } from 'react';
import { AdminLoginPage } from '../pages/admin/AdminLoginPage';

/**
 * AdminAuthGuard — Checks for a valid admin session in localStorage.
 * If no valid session, shows the AdminLoginPage instead of children.
 */
export function AdminAuthGuard({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSession = () => {
      try {
        const raw = localStorage.getItem('growlancer_admin_session');
        if (!raw) {
          setAuthorized(false);
          return;
        }

        const session = JSON.parse(raw);
        const now = new Date().toISOString();

        // Check expiry
        if (session.expiresAt && session.expiresAt < now) {
          localStorage.removeItem('growlancer_admin_session');
          setAuthorized(false);
          return;
        }

        setAuthorized(true);
      } catch {
        localStorage.removeItem('growlancer_admin_session');
        setAuthorized(false);
      }
    };

    checkSession();

    // Re-check on visibility change (user comes back to tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Still checking
  if (authorized === null) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  // Not authorized → show login page
  if (!authorized) {
    return <AdminLoginPage />;
  }

  // Authorized → render children
  return <>{children}</>;
}

/**
 * Check if admin is currently logged in (for use in components, not guard).
 */
export function isAdminLoggedIn(): boolean {
  try {
    const raw = localStorage.getItem('growlancer_admin_session');
    if (!raw) return false;
    const session = JSON.parse(raw);
    const now = new Date().toISOString();
    if (session.expiresAt && session.expiresAt < now) {
      localStorage.removeItem('growlancer_admin_session');
      return false;
    }
    return true;
  } catch {
    localStorage.removeItem('growlancer_admin_session');
    return false;
  }
}

/**
 * Log out of admin session.
 */
export function adminLogout(): void {
  localStorage.removeItem('growlancer_admin_session');
  window.location.href = '/admin';
}

/**
 * Get current admin session info (includes token for API calls).
 */
export function getAdminSession(): { email: string; label: string; loggedInAt: string; token: string; expiresAt: string } | null {
  try {
    const raw = localStorage.getItem('growlancer_admin_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    const now = new Date().toISOString();
    if (session.expiresAt && session.expiresAt < now) {
      localStorage.removeItem('growlancer_admin_session');
      return null;
    }
    return {
      email: session.email,
      label: session.label,
      loggedInAt: session.loggedInAt,
      token: session.token || '',
      expiresAt: session.expiresAt || '',
    };
  } catch {
    return null;
  }
}
