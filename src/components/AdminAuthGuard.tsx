import { useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AdminLoginPage } from '../pages/admin/AdminLoginPage';

interface AdminUser {
  id: string;
  email: string;
  name: string;
}

// Simple reactive admin state — no global listeners, no complexity
let _currentAdmin: AdminUser | null = null;

/**
 * AdminAuthGuard — Auth via Supabase session + profiles.is_admin.
 * Shows login page if not authenticated, renders children if admin.
 */
export function AdminAuthGuard({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAdminStatus = async (userId?: string) => {
      try {
        if (!userId) {
          const authResult = await supabase.auth.getSession();
          const session = authResult.data?.session ?? null;
          if (!session?.user) {
            if (!cancelled) { setAuthorized(false); setChecking(false); _currentAdmin = null; }
            return;
          }
          userId = session.user.id;
        }

        // Check admin status — first by ID, then fallback to email (handles ID mismatch)
        let { data: profile } = await supabase
          .from('profiles')
          .select('id, email, name, is_admin, role')
          .eq('id', userId)
          .maybeSingle();

        const isLegacyAdmin = (profile as any)?.is_admin === true;
        const hasAdminRole = (profile as any)?.role === 'admin';
        let isAdmin = isLegacyAdmin || hasAdminRole;

        // Fallback: check by email if not found by ID
        if (!isAdmin) {
          const { data: sessionData } = await supabase.auth.getSession();
          const userEmail = (sessionData as any)?.session?.user?.email;
          if (userEmail) {
            const { data: profileByEmail } = await supabase
              .from('profiles')
              .select('id, email, name, is_admin, role')
              .eq('email', userEmail)
              .maybeSingle();
            const emailIsLegacyAdmin = (profileByEmail as any)?.is_admin === true;
            const emailHasAdminRole = (profileByEmail as any)?.role === 'admin';
            if (emailIsLegacyAdmin || emailHasAdminRole) {
              profile = profileByEmail;
              isAdmin = true;
            }
          }
        }
        if (isAdmin) {
          _currentAdmin = {
            id: profile.id,
            email: (profile as any).email || '',
            name: profile.name || 'Admin',
          };
          if (!cancelled) { setAuthorized(true); setChecking(false); }
        } else {
          _currentAdmin = null;
          if (!cancelled) { setAuthorized(false); setChecking(false); }
        }
      } catch {
        if (!cancelled) { setAuthorized(false); setChecking(false); _currentAdmin = null; }
      }
    };

    checkAdminStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) checkAdminStatus(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        if (!cancelled) { setAuthorized(false); setChecking(false); _currentAdmin = null; }
      }
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

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

  if (!authorized) return <AdminLoginPage />;
  return <>{children}</>;
}

/** Check if admin is logged in (sync). */
export function isAdminLoggedIn(): boolean {
  return _currentAdmin !== null;
}

/** Get current admin user info. */
export function getAdminSession(): { email: string; label: string } | null {
  if (!_currentAdmin) return null;
  return { email: _currentAdmin.email, label: _currentAdmin.name };
}

/** Log out of admin session. */
export async function adminLogout(): Promise<void> {
  await supabase.auth.signOut();
  _currentAdmin = null;
  window.location.href = '/admin';
}
