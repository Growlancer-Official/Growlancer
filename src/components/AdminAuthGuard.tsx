import { useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AdminLoginPage } from '../pages/admin/AdminLoginPage';

interface AdminSession {
  id: string;
  email: string;
  name: string;
}

// ── localStorage helpers ─────────────────────────────────────────────────────

const ADMIN_SESSION_KEY = 'growlancer_admin_session';

function saveAdminSession(admin: AdminSession): void {
  try {
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(admin));
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
}

function loadAdminSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (parsed && parsed.id && parsed.email) return parsed;
    return null;
  } catch {
    return null;
  }
}

function clearAdminSession(): void {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // noop
  }
}

// ── Profile row type (subset used by admin checks) ────────────────────────────

interface ProfileAdminRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  is_admin: boolean | null;
}

/**
 * AdminAuthGuard — Auth via Supabase session + profiles.role = 'admin'.
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
            if (!cancelled) { setAuthorized(false); setChecking(false); clearAdminSession(); }
            return;
          }
          userId = session.user.id;
        }

        // Check admin status — first by ID, then fallback to email (handles ID mismatch)
        let profile: ProfileAdminRow | null = null;

        const { data: profileById } = await supabase
          .from('profiles')
          .select('id, email, name, is_admin, role')
          .eq('id', userId)
          .maybeSingle();

        if (profileById) {
          profile = profileById as ProfileAdminRow;
        }

        const isLegacyAdmin = profile?.is_admin === true;
        const hasAdminRole = profile?.role === 'admin';
        let isAdmin = isLegacyAdmin || hasAdminRole;

        // Fallback: check by email if not found by ID
        if (!isAdmin) {
          const { data: sessionData } = await supabase.auth.getSession();
          const userEmail = sessionData.session?.user?.email;
          if (userEmail) {
            const { data: profileByEmail } = await supabase
              .from('profiles')
              .select('id, email, name, is_admin, role')
              .eq('email', userEmail)
              .maybeSingle();

            if (profileByEmail) {
              const emailProfile = profileByEmail as ProfileAdminRow;
              const emailIsLegacyAdmin = emailProfile.is_admin === true;
              const emailHasAdminRole = emailProfile.role === 'admin';
              if (emailIsLegacyAdmin || emailHasAdminRole) {
                profile = emailProfile;
                isAdmin = true;
              }
            }
          }
        }

        if (isAdmin && profile) {
          const adminSession: AdminSession = {
            id: profile.id,
            email: profile.email || '',
            name: profile.name || 'Admin',
          };
          saveAdminSession(adminSession);
          if (!cancelled) { setAuthorized(true); setChecking(false); }
        } else {
          clearAdminSession();
          if (!cancelled) { setAuthorized(false); setChecking(false); }
        }
      } catch {
        if (!cancelled) { setAuthorized(false); setChecking(false); clearAdminSession(); }
      }
    };

    checkAdminStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) checkAdminStatus(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        if (!cancelled) { setAuthorized(false); setChecking(false); clearAdminSession(); }
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
// eslint-disable-next-line react-refresh/only-export-components
export function isAdminLoggedIn(): boolean {
  return loadAdminSession() !== null;
}

/** Get current admin user info. */
// eslint-disable-next-line react-refresh/only-export-components
export function getAdminSession(): { email: string; label: string } | null {
  const session = loadAdminSession();
  if (!session) return null;
  return { email: session.email, label: session.name };
}

/** Log out of admin session. */
// eslint-disable-next-line react-refresh/only-export-components
export async function adminLogout(): Promise<void> {
  await supabase.auth.signOut();
  clearAdminSession();
  window.location.href = '/admin';
}
