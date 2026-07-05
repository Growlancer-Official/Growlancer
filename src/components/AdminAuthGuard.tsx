import { useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AdminLoginPage } from '../pages/admin/AdminLoginPage';

interface AdminUser {
  id: string;
  email: string;
  name: string;
}

// Track admin state globally so all components react instantly
let _globalAdmin: AdminUser | null = null;
let _globalListeners: Array<(admin: AdminUser | null) => void> = [];

function notifyListeners(admin: AdminUser | null) {
  _globalAdmin = admin;
  _globalListeners.forEach(fn => fn(admin));
}

export function subscribeAdmin(cb: (admin: AdminUser | null) => void) {
  _globalListeners.push(cb);
  cb(_globalAdmin);
  return () => {
    _globalListeners = _globalListeners.filter(fn => fn !== cb);
  };
}

/**
 * AdminAuthGuard — Real-time admin auth via Supabase Auth.
 * Uses onAuthStateChange for instant (< 1 sec) redirect after login/signup.
 * Checks profiles.is_admin flag for authorization.
 */
export function AdminAuthGuard({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAdminStatus = async (userId?: string) => {
      try {
        if (!userId) {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.user) {
            if (!cancelled) { setAuthorized(false); setChecking(false); notifyListeners(null); }
            return;
          }
          userId = session.user.id;
        }

        // Check if user has admin flag
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('id, email, name, is_admin')
          .eq('id', userId)
          .single();

        if (error || !profile) {
          if (!cancelled) { setAuthorized(false); setChecking(false); notifyListeners(null); }
          return;
        }

        const isAdmin = (profile as any).is_admin === true;
        if (isAdmin) {
          const adminUser: AdminUser = {
            id: profile.id,
            email: (profile as any).email || '',
            name: profile.name || 'Admin',
          };
          if (!cancelled) { setAuthorized(true); setChecking(false); notifyListeners(adminUser); }
        } else {
          if (!cancelled) { setAuthorized(false); setChecking(false); notifyListeners(null); }
        }
      } catch {
        if (!cancelled) { setAuthorized(false); setChecking(false); notifyListeners(null); }
      }
    };

    // Initial check
    checkAdminStatus();

    // Real-time auth state listener — instant redirect (< 1 sec)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          checkAdminStatus(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        if (!cancelled) { setAuthorized(false); setChecking(false); notifyListeners(null); }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Still checking
  if (checking || authorized === null) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
          <p className="text-slate-400 text-sm">Authenticating...</p>
        </div>
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
 * Check if admin is logged in (sync, for non-guard use).
 */
export function isAdminLoggedIn(): boolean {
  return _globalAdmin !== null;
}

/**
 * Get current admin user info.
 */
export function getAdminSession(): { email: string; label: string } | null {
  if (!_globalAdmin) return null;
  return {
    email: _globalAdmin.email,
    label: _globalAdmin.name,
  };
}

/**
 * Log out of admin session.
 */
export async function adminLogout(): Promise<void> {
  await supabase.auth.signOut();
  notifyListeners(null);
  window.location.href = '/admin';
}
