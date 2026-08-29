import { createContext, useContext, useState, useEffect, useCallback, useRef, startTransition, ReactNode } from 'react';
import { Session, User as SupabaseUser, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase, clearSupabaseAuthStorage, isStaleSessionError } from '../lib/supabase';
import type { AuthUser, UserRole } from '../types/auth';
import {
  fetchUserProfile,
  createUserProfile,
  createReferralCode,
} from '../lib/services/authService';
import { shouldRedirectToAuthCallback } from '../lib/authAction';
import { captureError, captureInfo } from '../lib/telemetry';
import { recordBrowserAccount, clearBrowserAccount } from '../lib/browserIdentity';
import {
  recordLoginAttempt,
  resetLoginAttempts,
  getLoginDelay,
  getRemainingAttempts,
} from '../lib/rateLimiter';

// ═══════════════════════════════════════════════════════════════════
// BroadcastChannel — Cross-tab auth sync
// ═══════════════════════════════════════════════════════════════════
// When the user logs in, logs out, or their profile changes in one tab,
// all other tabs are notified in real-time and sync their state.
// This is more explicit than relying solely on localStorage events.
// ═══════════════════════════════════════════════════════════════════
const AUTH_BROADCAST_CHANNEL = 'growlancer_auth_sync';

type AuthBroadcastMessage =
  | { type: 'AUTH_SIGNED_IN'; userId: string }
  | { type: 'AUTH_SIGNED_OUT' }
  | { type: 'PROFILE_UPDATED'; userId: string }
  | { type: 'SESSION_REFRESHED'; userId: string };

function createAuthBroadcast(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
  } catch {
    return null;
  }
}

function broadcastAuthMessage(msg: AuthBroadcastMessage) {
  const channel = createAuthBroadcast();
  if (!channel) return;
  try {
    channel.postMessage(msg);
    channel.close();
  } catch {
    // BroadcastChannel may fail if the message is too complex or in private browsing
  }
}

// Re-export for backward compatibility (used by ProtectedRoute)
export type { UserRole };
// Re-export type alias for backward compatibility
export type User = AuthUser;

interface AuthContextType {
  user: AuthUser | null;
  supabaseUser: SupabaseUser | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  session: Session | null;
  signInWithOAuth: (provider: 'github' | 'linkedin_oidc', role?: UserRole) => Promise<{ success: boolean; error?: string; url?: string }>;
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; role?: UserRole; onboardingNeeded?: boolean }>;
  signup: (
    email: string,
    password: string,
    name: string,
    role: UserRole,
    referrerCode?: string    ) => Promise<{ success: boolean; error?: string; message?: string; needsVerification?: boolean }>;
  logout: () => Promise<void>;
  getDashboardRoute: (userRole?: UserRole) => string;
  updateUser: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const isDev = import.meta.env.DEV;

function devLog(...args: unknown[]) {
  if (isDev) console.log(...args);
}

function devWarn(...args: unknown[]) {
  if (isDev) console.warn(...args);
}

function devError(...args: unknown[]) {
  if (isDev) {
    const filteredArgs = args.filter(arg => arg !== undefined && arg !== null && arg !== '');
    if (filteredArgs.length > 0) {
      console.error(...filteredArgs);
    }
  }
}

/** True while on the OAuth callback page (AuthCallbackPage owns token processing there). */
function isOAuthCallbackPath(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/callback');
}

/**
 * True for GitHub/LinkedIn OAuth users — the provider already verified identity
 * at sign-in, so a missing profiles row is a data issue, never an auth failure.
 */
function isOAuthProviderUser(authUser: SupabaseUser): boolean {
  const provider = authUser.app_metadata?.provider as string | undefined;
  return provider === 'github' || provider === 'linkedin_oidc';
}

/**
 * Resolves the role for an OAuth (GitHub/LinkedIn) user: the role saved in
 * localStorage during the signup modal (growlancer_oauth_role) →
 * user_metadata.role → roleHint → 'freelancer'.
 *
 * Does NOT consume the localStorage value — callers remove it only AFTER a
 * successful profile creation so a failed creation + retry doesn't lose the
 * user's chosen role.
 */
function resolveOAuthRole(authUser: SupabaseUser, roleHint?: UserRole): UserRole {
  const meta = authUser.user_metadata || {};
  const savedOAuthRole = localStorage.getItem('growlancer_oauth_role');
  if (savedOAuthRole === 'freelancer' || savedOAuthRole === 'client') {
    return savedOAuthRole;
  }
  if (meta.role === 'freelancer' || meta.role === 'client') {
    return meta.role as UserRole;
  }
  return roleHint || 'freelancer';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const ensureUserProfile = useCallback(
    async (
      authUser: SupabaseUser,
      roleHint?: UserRole,
      allowCreate: boolean = true
    ): Promise<AuthUser | null> => {
      // 🛡️ Guard: prevent duplicate profile creation when ensureUserProfile and syncAuthUser
      // fire concurrently (e.g., on OAuth callback where both the onAuthStateChange listener
      // and the manual getSession flow try to create a profile)
      if (profileCreationInProgressRef.current) {
        devLog('[Auth] Profile creation already in progress — waiting...');
        // Wait up to 5s for the other creation to finish
        for (let wait = 0; wait < 10; wait++) {
          await new Promise(r => setTimeout(r, 500));
          const existing = await fetchUserProfile(authUser.id);
          if (existing) return existing;
          if (!profileCreationInProgressRef.current) break;
        }
      }

      // Try to fetch existing profile
      const profile = await fetchUserProfile(authUser.id);
      if (profile) return profile;

      // Only create profile if explicitly allowed (signup) and roleHint is provided
      if (!allowCreate || !roleHint) return null;

      // 🛡️ Set guard before creating
      profileCreationInProgressRef.current = true;

      try {
        const userEmail = authUser.email || '';
        const userName =
          (typeof authUser.user_metadata?.name === 'string' && authUser.user_metadata.name.trim()) ||
          userEmail.split('@')[0] ||
          'User';
        const referralCode =
          typeof authUser.user_metadata?.referral_code === 'string'
            ? authUser.user_metadata.referral_code
            : createReferralCode(roleHint.substring(0, 2).toUpperCase());

        return await createUserProfile(authUser.id, userEmail, userName, roleHint, referralCode);
      } finally {
        profileCreationInProgressRef.current = false;
      }
    },
    []
  );

  // ═══ Exponential backoff for session initialization ═══
  // 2 retries: 1s → 2s = max ~3s total wait.
  // Keeping retries low avoids artificial delays from backoff.
  // Timeout is 12s to accommodate profile fetch + stale session recovery
  // on slow connections without the timeout firing unnecessarily.
  const MAX_INIT_RETRIES = 2;
  const INIT_RETRY_BASE_MS = 1000;
  const AUTH_TIMEOUT_MS = 12000;

  // ═══ Refs for cross-tab BroadcastChannel sync ═══
  // Component-level ref updated synchronously when user changes.
  // The BroadcastChannel useEffect reads from this ref to avoid
  // stale closures and prevent unnecessary re-initialization.
  const userIdRef = useRef<string | null>(null);
  // 🛡️ Guard: prevents duplicate profile creation attempts (race condition between
  // ensureUserProfile and syncAuthUser firing simultaneously on OAuth callback)
  const profileCreationInProgressRef = useRef(false);

  // Update ref whenever user.id changes — synchronous, no stale closure
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // 🆕 Same-browser account detection: record the account email + browser
  // fingerprint whenever a real user is authenticated (login, signup, OAuth).
  // One browser = one account — prevents referral farming. The signup form
  // reads this marker and warns in real-time before a second account is made.
  useEffect(() => {
    if (user?.id && user?.email) {
      try {
        recordBrowserAccount(user.email, user.role, /* force */ false);
      } catch {
        // best-effort — never break auth over a storage marker
      }
    }
  }, [user?.id, user?.email, user?.role]);

  const syncAuthUser = useCallback(
    async (authUser: SupabaseUser, roleHint?: UserRole) => {
      // 🛡️ OAuth callback page guard — AuthCallbackPage OWNS profile creation, role
      // handling, country gate and redirect on /auth/callback. If AuthContext races
      // ahead and signs out (profile fetch fails) or consumes growlancer_oauth_role
      // here, the fresh OAuth session is destroyed → user bounces back to login
      // instead of onboarding (the 'GitHub/LinkedIn login works but goes back' bug).
      const isOAuthCallbackPage =
        typeof window !== 'undefined' &&
        window.location.pathname.startsWith('/auth/callback');

      if (isOAuthCallbackPage) {
        // Only surface an existing profile — never create, never sign out, never
        // consume the saved role. AuthCallbackPage handles all of that.
        const existing = await ensureUserProfile(authUser, roleHint, !!roleHint);
        if (existing) setUser(existing);
        return existing;
      }

      // Try to fetch existing profile
      let profile = await ensureUserProfile(authUser, roleHint, !!roleHint);

      // 🆕 Deferred profile creation: if no profile exists (signup RPC failed,
      // OAuth signup, or a profile row that hasn't propagated yet), create one now.
      // OAuth (GitHub/LinkedIn) users get this EVEN IF the provider didn't return
      // a confirmed email — the provider already verified identity at sign-in, and
      // signing an OAuth user out over a missing profiles row would destroy the
      // fresh session and bounce them back to login (the 'OAuth login works but
      // returns to login' bug). Uses saved role to preserve the user's choice.
      if (!profile && (authUser.email_confirmed_at || isOAuthProviderUser(authUser))) {
        devLog('[Auth] User without profile — auto-creating now (email confirmed)');
        const meta = authUser.user_metadata || {};
        const name =
          (typeof meta.name === 'string' && meta.name.trim()) ||
          (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
          authUser.email?.split('@')[0] ||
          'User';
        
        // 🆕 Use saved role from localStorage (preserved during OAuth), then
        // user_metadata, then roleHint, then default to 'freelancer'. Consumed
        // only after a successful creation (see below).
        const savedRole = resolveOAuthRole(authUser, roleHint);
        
        // 🆕 Check for saved referral code from localStorage (preserved during OAuth)
        let oauthRefCode: string | undefined;
        const savedRef = localStorage.getItem('growlancer_oauth_ref');
        if (savedRef) {
          oauthRefCode = savedRef;
          localStorage.removeItem('growlancer_oauth_ref');
        }
        
        const refCode = createReferralCode('FR');
        profile = await createUserProfile(
          authUser.id,
          authUser.email || '',
          name,
          savedRole,
          refCode,
        );
        if (profile) {
          // 🆕 Role consumed — only after a successful creation, so a failed
          // creation + retry (safety net below) still sees the saved role.
          localStorage.removeItem('growlancer_oauth_role');
        }

        // 🆕 Process referral if this OAuth signup came from a referral link
        if (oauthRefCode && profile) {
          try {
            const { data: refData, error: refError } = await supabase.rpc('process_referral', {
              p_referral_code: oauthRefCode,
              p_new_user_id: authUser.id,
              p_new_user_email: authUser.email || '',
            });
            if (refError || (refData as any)?.success !== true) {
              devWarn('[Auth] OAuth referral not recorded:', refError?.message || (refData as any)?.error);
            } else {
              devLog('[Auth] OAuth referral processed for code:', oauthRefCode);
              // 🆕 Grant referred OAuth user 5 free connects as welcome bonus
              try {
                await supabase.from('connects_transactions').insert({
                  user_id: authUser.id,
                  amount: 5,
                  type: 'bonus',
                  description: 'Welcome bonus - referred by friend',
                });
                devLog('[Auth] OAuth referred user granted 5 free connects');
              } catch (bonusErr) {
                devWarn('[Auth] OAuth referral bonus grant error:', bonusErr);
              }
            }
          } catch (refErr) {
            devWarn('[Auth] OAuth referral processing error:', refErr);
          }
        }
      }

      if (!profile) {
        if (roleHint) {
          devError('[Auth] Failed to sync user profile during login/signup');
          await supabase.auth.signOut().catch(() => {});
          clearSupabaseAuthStorage();
          setUser(null);
          setSession(null);
          setSupabaseUser(null);
          return null;
        } else {
          // Background refresh — retry once before concluding deletion
          devLog('[Auth] Profile fetch returned null during session refresh — retrying once after delay');
          await new Promise(resolve => setTimeout(resolve, 2000));
          profile = await ensureUserProfile(authUser, roleHint, !!roleHint);
          if (profile) {
            setUser(profile);
            return profile;
          }

          // 🛡️ OAuth (GitHub/LinkedIn) safety net: NEVER sign out an OAuth user
          // because their profile row is missing. The provider already verified
          // identity — a missing profiles row is a data issue, not an auth
          // failure. Auto-create the profile here (saved role → metadata role →
          // freelancer), and if creation still fails, keep the session alive so
          // the next page load retries. Signing out would destroy the OAuth
          // session and bounce the user back to the login page.
          if (isOAuthProviderUser(authUser)) {
            devLog('[Auth] OAuth user without profile — auto-creating (safety net)');
            const meta = authUser.user_metadata || {};
            const oauthRole = resolveOAuthRole(authUser);
            const oauthName =
              (typeof meta.name === 'string' && meta.name.trim()) ||
              (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
              authUser.email?.split('@')[0] ||
              'User';
            profile = await createUserProfile(authUser.id, authUser.email || '', oauthName, oauthRole);
            if (profile) {
              // 🆕 Role consumed — only after a successful creation
              localStorage.removeItem('growlancer_oauth_role');
              setUser(profile);
              return profile;
            }
            devWarn('[Auth] OAuth profile creation failed — keeping session (retry on next load)');
            return null; // 🚫 Do NOT sign out
          }
          
          // 🚫 Don't sign out admin users — AdminAuthGuard handles admin auth separately.
          // The admin profile might not have a standard role column, and signing out here
          // cascades to AdminAuthGuard's onAuthStateChange listener, logging admin out.
          if (authUser.email?.includes('admin')) {
            devLog('[Auth] Profile fetch failed for admin user — NOT signing out (AdminAuthGuard handles admin auth)');
            return null;
          }
          
          devError(
            '[Auth] Profile fetch failed during session refresh after retry — user likely deleted from backend. Signing out.'
          );
          await supabase.auth.signOut().catch(() => {});
          clearSupabaseAuthStorage();
          // Account deleted — drop the stale same-browser marker too.
          clearBrowserAccount();
          setUser(null);
          setSession(null);
          setSupabaseUser(null);
          return null;
        }
      }

      // 🆕 Deferred referral processing — email-verification signups can't call
      // process_referral at signup time (no session yet), so it's recorded here
      // on the user's first authenticated login. Idempotent: the RPC returns
      // 'User already referred' if a duplicate is detected. A per-user flag
      // prevents re-querying on every page load once recorded.
      try {
        const pendingRefRaw = localStorage.getItem('growlancer_pending_ref');
        const metaReferredBy =
          typeof authUser.user_metadata?.referred_by === 'string' &&
          authUser.user_metadata.referred_by
            ? authUser.user_metadata.referred_by
            : undefined;
        const refCode = pendingRefRaw
          ? (JSON.parse(pendingRefRaw) as { code?: string }).code
          : metaReferredBy;

        if (refCode && !localStorage.getItem(`growlancer_ref_done_${authUser.id}`)) {
          const { data: refData, error: refError } = await supabase.rpc('process_referral', {
            p_referral_code: refCode,
            p_new_user_id: authUser.id,
            p_new_user_email: authUser.email || '',
          });
          if (refError) {
            // Transient failure (network/RPC) — don't mark done so it retries later
            devWarn('[Auth] Deferred referral RPC error:', refError.message);
          } else if ((refData as any)?.success !== true) {
            // Definitive server answer (already referred / invalid code) — mark done
            devWarn('[Auth] Deferred referral not recorded:', (refData as any)?.error);
            localStorage.setItem(`growlancer_ref_done_${authUser.id}`, '1');
          } else {
            devLog('[Auth] Deferred referral processed for code:', refCode);
            localStorage.setItem(`growlancer_ref_done_${authUser.id}`, '1');
            // Grant the referred user 5 free connects as welcome bonus (once)
            try {
              await supabase.from('connects_transactions').insert({
                user_id: authUser.id,
                amount: 5,
                type: 'bonus',
                description: 'Welcome bonus - referred by friend',
              });
              devLog('[Auth] Deferred referred user granted 5 free connects');
            } catch (bonusErr) {
              devWarn('[Auth] Deferred referral bonus grant error:', bonusErr);
            }
          }
          localStorage.removeItem('growlancer_pending_ref');
        }
      } catch (refErr) {
        devWarn('[Auth] Deferred referral processing error:', refErr);
      }

      setUser(profile);
    },
    [ensureUserProfile]
  );

  useEffect(() => {
    let mounted = true;
    let authTimeout: ReturnType<typeof setTimeout> | null = null;
    let subscription: { unsubscribe: () => void } | null = null;

    async function initializeAuth() {
      try {
        devLog('[Auth] Initializing...');

        // 🛡️ Homepage-fallback rescue: if Supabase redirected the user to the site URL
        // (homepage) instead of /auth/callback because the exact callback URL wasn't in
        // the project's allowed Redirect URLs, the PKCE code / OTP token_hash / implicit
        // hash tokens are sitting in THIS page's URL. Bounce to the correct auth page
        // preserving the params so the token is exchanged and the flow continues —
        // instead of the user being stuck on the homepage with a silent session.
        // Email signup/email_change confirmations go to EmailConfirmPage (which shows
        // the "Email verified ✓ — close this window" screen and NEVER auto-redirects
        // to onboarding); OAuth / magic-link / recovery go to AuthCallbackPage.
        if (typeof window !== 'undefined' &&
            shouldRedirectToAuthCallback(
              window.location.pathname,
              window.location.search,
              window.location.hash
            )) {
          const search = window.location.search;
          const hash = window.location.hash;
          const typeParam =
            new URLSearchParams(search).get('type') ||
            new URLSearchParams(hash.replace(/^#/, '')).get('type') ||
            '';
          const isEmailConfirm =
            typeParam === 'signup' || typeParam === 'email_change';
          const target = isEmailConfirm ? '/auth/email-confirm' : '/auth/callback';
          devLog(`[Auth] Auth action params on non-auth page (type=${typeParam || 'none'}) — bouncing to ${target}`);
          window.location.replace(`${target}${search}${hash}`);
          return;
        }

        // Set up auth state listener
        try {
          const authListener = supabase.auth.onAuthStateChange(async (event, newSession) => {
            if (!mounted) return;

            try {
              devLog('[Auth] Auth state change event:', event);

              if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                setSession(newSession);
                setSupabaseUser(newSession?.user || null);

                if (newSession?.user) {
                  syncAuthUser(newSession.user).catch(err => {
                    devWarn('[Auth] Background sync failed:', err);
                  });
                } else {
                  setUser(null);
                }
                captureInfo('Auth state synchronized', {
                  source: 'auth',
                  event,
                });
              } else if (event === 'SIGNED_OUT') {
                setSession(null);
                setSupabaseUser(null);
                setUser(null);
              }
            } catch (error) {
              captureError('Auth state change handler failed', {
                source: 'auth',
                event,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          });
          subscription = authListener.data?.subscription ?? null;
          devLog('[Auth] onAuthStateChange listener registered');
        } catch (error) {
          devWarn('[Auth] onAuthStateChange setup failed:',
            error instanceof Error ? error.message : String(error));
          captureError('Auth state listener setup failed', {
            source: 'auth',
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // Retry loop with exponential backoff: 1s → 2s → 4s → 8s
        let currentSession: Session | null = null;
        let lastError: Awaited<ReturnType<typeof supabase.auth.getSession>>['error'] = null;

        for (let attempt = 0; attempt <= MAX_INIT_RETRIES; attempt++) {
          if (attempt > 0) {
            const delay = INIT_RETRY_BASE_MS * Math.pow(2, attempt - 1);
            devLog(`[Auth] Retry attempt ${attempt}/${MAX_INIT_RETRIES} (delay: ${delay}ms)...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          const result = await supabase.auth.getSession();
          const session = result.data?.session ?? null;
          const error = result.error;

          if (error) {
            lastError = error;
            devWarn(`[Auth] Session fetch attempt ${attempt + 1} failed:`, error.message);
            continue; // Retry with backoff
          }

          // Success — clear lastError and use this session
          lastError = null;
          currentSession = session;
          break;
        }

        if (lastError) {
          devWarn('[Auth] Session error after all retries:', lastError.message);
          captureError('Failed to load auth session', {
            source: 'auth',
            message: lastError.message,
          });
        }

        if (!mounted) return;

        // 🔥 Stale-session rescue: the cached session in localStorage may belong to a
        // user that was deleted from Supabase (e.g. test users removed from the
        // Auth dashboard while the browser kept the old token). `getSession()` only
        // reads localStorage — it does NOT verify the user still exists server-side.
        // `getUser()` does, so validate the session before restoring it. If the user
        // is gone, force-clear the persisted session so the app doesn't loop between
        // "Email not verified" and a logout that never sticks.
        if (currentSession?.user && !isOAuthCallbackPath()) {
          const { error: userError } = await supabase.auth.getUser();
          // 🔥 Only force-clear when the user genuinely no longer exists (401 /
          // 'user not found'). Transient network errors must NOT log out a
          // legitimately signed-in user — they fall through to the normal restore.
          if (mounted && isStaleSessionError(userError)) {
            devLog('[Auth] Stale session detected (user no longer exists server-side) — force-clearing');
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
            clearSupabaseAuthStorage();
            // The account is gone — the same-browser marker for it is stale too.
            clearBrowserAccount();
            setSession(null);
            setSupabaseUser(null);
            setUser(null);
            broadcastAuthMessage({ type: 'AUTH_SIGNED_OUT' });
          } else if (mounted && currentSession?.user) {
            // Valid user OR transient network error — restore normally (old behavior).
            setSession(currentSession);
            setSupabaseUser(currentSession.user);
            await syncAuthUser(currentSession.user);
            broadcastAuthMessage({ type: 'SESSION_REFRESHED', userId: currentSession.user.id });
          }
        } else {
          setSession(currentSession);
          setSupabaseUser(currentSession?.user || null);

          if (currentSession?.user) {
            await syncAuthUser(currentSession.user);
            // Broadcast that we have a session (for cross-tab sync)
            broadcastAuthMessage({ type: 'SESSION_REFRESHED', userId: currentSession.user.id });
          } else {
            setUser(null);
            setSession(null);
            setSupabaseUser(null);
          }
        }
        
        // ✅ Attempt to recover a stale session if user is authenticated but
        // supabase.auth.getSession() returned null (e.g., token expired while tab was closed)
        if (!currentSession && !lastError) {
          const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
          if (userData?.user && mounted) {
            devLog('[Auth] Stale session detected — attempting silent refresh');
            const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
            if (refreshed?.session) {
              currentSession = refreshed.session;
              setSession(currentSession);
              setSupabaseUser(currentSession.user || null);
              await syncAuthUser(currentSession.user);
              broadcastAuthMessage({ type: 'SESSION_REFRESHED', userId: currentSession.user.id });
            }
          }
        }
      } catch (error) {
        // Gracefully handle any auth initialization errors
        devWarn('[Auth] Initialization error (will retry if mounted):', 
          error instanceof Error ? error.message : String(error));
        captureError('Auth initialization failed', {
          source: 'auth',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (mounted) {
          startTransition(() => {
            setIsLoading(false);
          });
        }
      }
    }

    initializeAuth();

    // Add timeout to prevent infinite loading during auth initialization
    authTimeout = setTimeout(() => {
      if (!mounted) return;
      devWarn('[Auth] Initialization timeout - forcing loading to false');
      captureInfo('Auth initialization timeout', {
        source: 'auth',
        timeoutMs: AUTH_TIMEOUT_MS,
      });
      startTransition(() => {
        setIsLoading(false);
      });
    }, AUTH_TIMEOUT_MS);

    return () => {
      mounted = false;
      if (authTimeout) clearTimeout(authTimeout);
      if (subscription) subscription.unsubscribe();
    };
  }, [syncAuthUser]);

  // ═══ Cross-tab BroadcastChannel listener ═══
  // Runs once on mount. Reads userIdRef.current (updated synchronously
  // by a separate useEffect when user?.id changes) to avoid stale closures
  // while keeping the listener registered once.
  useEffect(() => {
    const bc = createAuthBroadcast();
    if (!bc) return;

    bc.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
      const msg = event.data;
      const currentUserId = userIdRef.current;
      devLog('[Auth] Cross-tab message received:', msg.type);

      switch (msg.type) {
        case 'AUTH_SIGNED_IN':
          // Another tab logged in — refresh session to stay in sync
          if (msg.userId !== currentUserId) {
            devLog('[Auth] Cross-tab login detected — refreshing session');
            supabase.auth.getSession().then(({ data: { session: s } }) => {
              if (s?.user) {
                setSession(s);
                setSupabaseUser(s.user);
                syncAuthUser(s.user).catch(() => {});
              }
            }).catch(() => {});
          }
          break;
        case 'AUTH_SIGNED_OUT':
          // Another tab signed out — clear state in this tab too
          devLog('[Auth] Cross-tab sign-out detected — signing out this tab');
          setUser(null);
          setSession(null);
          setSupabaseUser(null);
          break;
        case 'PROFILE_UPDATED':
          // Profile changed in another tab — re-fetch in this tab
          if (msg.userId === currentUserId) {
            devLog('[Auth] Cross-tab profile update detected — re-fetching profile');
            fetchUserProfile(currentUserId!).then(updated => {
              if (updated) setUser(updated);
            }).catch(() => {});
          }
          break;
        case 'SESSION_REFRESHED':
          // Session was refreshed in another tab — check if we need to sync
          if (msg.userId !== currentUserId && msg.userId && !currentUserId) {
            devLog('[Auth] Cross-tab session refresh — checking session');
            supabase.auth.getSession().then(({ data: { session: s } }) => {
              if (s?.user) {
                setSession(s);
                setSupabaseUser(s.user);
                syncAuthUser(s.user).catch(() => {});
              }
            }).catch(() => {});
          }
          break;
      }
    };

    return () => {
      bc.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    // 🚫 SKIP for admin users — AdminAuthGuard handles admin auth separately.
    // The periodic profile check below would fire signOut on repeated failures,
    // which cascades to AdminAuthGuard via onAuthStateChange and logs admin out.
    if (user.role === 'admin') return;

    const channel = supabase
      .channel(`profile_updates:${user.id}`)
      .on('system', { event: '*' }, (status: string) => {
        // Monitor channel health — log state transitions
        if (status === 'error') {
          devWarn('[Auth] Realtime channel error — will auto-reconnect');
        } else if (status === 'joined') {
          devLog('[Auth] Realtime channel connected for profile updates');
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          // If the profile was deleted (event: DELETE), sign out immediately
          if (payload.eventType === 'DELETE') {
            devLog('[Auth] Profile deleted from backend — signing out');
            await supabase.auth.signOut().catch(() => {});
            clearSupabaseAuthStorage();
            // Account deleted — drop the stale same-browser marker too.
            clearBrowserAccount();
            setUser(null);
            setSession(null);
            setSupabaseUser(null);
            return;
          }
          // Otherwise (INSERT/UPDATE), re-fetch the profile
          // Retry up to 3 times with increasing delays to handle transient failures
          let updated = await fetchUserProfile(user.id);
          let realtimeRetries = 0;
          while (!updated && realtimeRetries < 3) {
            realtimeRetries++;
            devLog('[Auth] Profile re-fetch returned null (retry', realtimeRetries, '/3)');
            await new Promise(resolve => setTimeout(resolve, realtimeRetries * 1500));
            updated = await fetchUserProfile(user.id);
          }
          if (updated) {
            setUser(updated);
            // 📡 Broadcast profile update cross-tab
            broadcastAuthMessage({ type: 'PROFILE_UPDATED', userId: user.id });
          } else {
            devLog('[Auth] Profile still not found after', realtimeRetries, 'retries — NOT signing out (suspected transient)');
            // ⚠️ Don't sign out on transient failure — just keep current user state.
            // The periodic check (higher threshold) will handle real deletion.
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          devLog('[Auth] Realtime profile subscription active');
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id, user?.role]);

  // Proactive user existence check: runs when the page becomes visible again
  // and on a periodic interval to detect backend-side user deletion.
  //
  // Uses a consecutive-failure counter to avoid signing out on transient
  // network hiccups or Supabase RLS timing issues. Only after N consecutive
  // null responses do we conclude the user profile was actually deleted.
  // ── Increased tolerance for transient failures ──
  // Higher threshold prevents auto-signout on brief network/RPC hiccups
  // (which would cascade to the admin session via onAuthStateChange).
  const MAX_PROFILE_CHECK_FAILURES = 8;
  const PROFILE_CHECK_INTERVAL_MS = 60000; // Check every 60 seconds
  useEffect(() => {
    if (!user?.id) return;

    // 🚫 SKIP periodic check for admin users — AdminAuthGuard handles admin auth separately.
    // The periodic check would fire fetchUserProfile → return null (admin profiles may not
    // have a standard role column) → after 8 failures → signOut → AdminAuthGuard logs out.
    if (user.role === 'admin') return;

    let isChecking = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let consecutiveFailures = 0;

    const checkProfileExists = async () => {
      // 🚫 Skip check if offline — prevents unnecessary failures when network is down
      if (!navigator.onLine) {
        devLog('[Auth] Skipping periodic check — browser is offline');
        return;
      }
      if (isChecking || !user?.id) return;
      isChecking = true;
      try {
        const profile = await fetchUserProfile(user.id);
        if (!profile) {
          consecutiveFailures++;
          if (consecutiveFailures >= MAX_PROFILE_CHECK_FAILURES) {
            devLog('[Auth] Periodic check: Profile not found after', MAX_PROFILE_CHECK_FAILURES, 'attempts — signing out');
            await supabase.auth.signOut().catch(() => {});
            clearSupabaseAuthStorage();
            // Profile is gone — the account was deleted; drop the stale same-browser marker too.
            clearBrowserAccount();
            broadcastAuthMessage({ type: 'AUTH_SIGNED_OUT' });
            setUser(null);
            setSession(null);
            setSupabaseUser(null);
          } else {
            devLog('[Auth] Periodic check: Profile fetch returned null (failure', consecutiveFailures, '/', MAX_PROFILE_CHECK_FAILURES, ') — retrying');
          }
        } else {
          // Reset counter on success
          consecutiveFailures = 0;
        }
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_PROFILE_CHECK_FAILURES) {
          devLog('[Auth] Periodic check: Profile fetch error after', MAX_PROFILE_CHECK_FAILURES, 'attempts — signing out');
          await supabase.auth.signOut().catch(() => {});
          clearSupabaseAuthStorage();
          // Profile is gone — the account was deleted; drop the stale same-browser marker too.
          clearBrowserAccount();
          broadcastAuthMessage({ type: 'AUTH_SIGNED_OUT' });
          setUser(null);
          setSession(null);
          setSupabaseUser(null);
        }
      } finally {
        isChecking = false;
      }
    };

    // Check every 60 seconds
    intervalId = setInterval(checkProfileExists, PROFILE_CHECK_INTERVAL_MS);

    // Also check when page becomes visible again (user switches back to tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkProfileExists();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // ── Online/offline detection ──
    // When coming back online, immediately revalidate the profile.
    // When going offline, reset the consecutive failure counter to
    // prevent accidental signout from network errors.
    const handleOnline = () => {
      devLog('[Auth] Browser is online — revalidating profile');
      consecutiveFailures = 0; // Reset counter when coming back online
      checkProfileExists();
    };
    const handleOffline = () => {
      devLog('[Auth] Browser is offline — pausing periodic checks');
      consecutiveFailures = 0; // Reset counter so offline time doesn't count as failures
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user?.id, user?.role]);

  // ═══════════════════════════════════════════════════════════════════
  // Session Timeout — Auto-logout after 24 hours of inactivity
  // ═══════════════════════════════════════════════════════════════════
  // Tracks user activity (mouse, keyboard, touch, scroll) and resets
  // a timer. If no activity is detected for 24 consecutive hours,
  // the user is automatically signed out for security.
  //
  // The last-activity timestamp is persisted in localStorage so it
  // survives page refreshes and tab switches.
  // ═══════════════════════════════════════════════════════════════════
  const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
  const SESSION_CHECK_INTERVAL_MS = 60000; // Check every 60 seconds
  const LAST_ACTIVITY_KEY = 'growlancer_last_activity';

  useEffect(() => {
    if (!user?.id) return;

    // 🚫 Skip for admin users — AdminAuthGuard handles admin auth separately
    if (user.role === 'admin') return;

    // ── Initialize last activity timestamp ──
    // On mount, load from localStorage (survives page refresh).
    // If none exists, set it now (fresh session).
    const stored = localStorage.getItem(LAST_ACTIVITY_KEY);
    let lastActivity = stored ? parseInt(stored, 10) : Date.now();
    if (!stored) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivity));
    }

    // ── Update last activity timestamp ──
    // In-memory `lastActivity` is updated on EVERY event (no throttle).
    // localStorage writes are throttled to 30s to avoid excessive I/O.
    // This prevents a false timeout where the user is active but within
    // the throttle window.
    const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    let lastActivityUpdate = 0;
    const ACTIVITY_THROTTLE_MS = 30000; // 30 seconds

    const handleActivity = () => {
      const now = Date.now();
      lastActivity = now; // Always update in-memory (no throttle)
      // Only write to localStorage if throttle period has passed
      if (now - lastActivityUpdate >= ACTIVITY_THROTTLE_MS) {
        lastActivityUpdate = now;
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    devLog('[Auth] Session timeout tracking started (24h inactivity)');

    // ── Periodic timeout check ──
    // Every 60 seconds, check if 24 hours have passed since last activity.
    // If so, sign out the user automatically.
    const checkSessionTimeout = () => {
      // Re-read from localStorage on each check — another tab may have updated
      // the activity timestamp, and the closure variable won't reflect that.
      const storedActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (storedActivity) {
        const storedTs = parseInt(storedActivity, 10);
        if (storedTs > lastActivity) lastActivity = storedTs;
      }
      const elapsed = Date.now() - lastActivity;
      if (elapsed >= SESSION_TIMEOUT_MS) {
        devLog('[Auth] Session expired after', Math.round(elapsed / 3600000), 'hours of inactivity — signing out');
        captureInfo('Session timed out after inactivity', {
          source: 'auth',
          elapsedHours: Math.round(elapsed / 3600000),
        });
        localStorage.removeItem(LAST_ACTIVITY_KEY);
        broadcastAuthMessage({ type: 'AUTH_SIGNED_OUT' });
        supabase.auth.signOut().catch(() => {});
        setUser(null);
        setSession(null);
        setSupabaseUser(null);
      }
    };

    // ⚡ Check immediately on mount (user may have been away for 24+ hours)
    checkSessionTimeout();

    const intervalId = setInterval(checkSessionTimeout, SESSION_CHECK_INTERVAL_MS);

    // Also check when page becomes visible (user returns after hours away)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Re-read from localStorage in case another tab updated it
        const storedActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
        if (storedActivity) {
          lastActivity = parseInt(storedActivity, 10);
        }
        checkSessionTimeout();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [user?.id, user?.role, SESSION_TIMEOUT_MS]);

  const signInWithOAuth = async (
    provider: 'github' | 'linkedin_oidc',
    role?: UserRole
  ): Promise<{ success: boolean; error?: string; url?: string }> => {
    try {
      // 🆕 Preserve referral code from URL before OAuth redirect
      const refParam = new URLSearchParams(window.location.search).get('ref');
      if (refParam) {
        localStorage.setItem('growlancer_oauth_ref', refParam);
      }

      // 🆕 Save selected role to localStorage so AuthCallbackPage can read it on return
      if (role) {
        localStorage.setItem('growlancer_oauth_role', role);
      }

      const redirectTo = `${window.location.origin}/auth/callback`;
      devLog('[Auth] OAuth signInWithOAuth — provider:', provider, 'redirectTo:', redirectTo);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) {
        devWarn('[Auth] OAuth error:', error.message);
        // Surface actionable diagnostics so the user knows whether this is
        // a Supabase Dashboard config issue vs. a provider-side issue.
        const isRedirect = error.message?.toLowerCase().includes('redirect');
        const hint = isRedirect
          ? ' The redirect URL may not be configured in the Supabase Dashboard (Authentication → URL Configuration → Redirect URLs). Add: ' + redirectTo
          : '';
        return { success: false, error: error.message + hint };
      }

      // OAuth redirects the browser. The library calls window.location.assign
      // internally, but on some setups that navigation doesn't fire (user stays
      // on the login modal). Force it explicitly with window.location.href so
      // the browser ALWAYS leaves for the provider authorize page.
      if (data?.url) {
        devLog('[Auth] OAuth initiated for provider:', provider, 'role:', role, 'url:', data.url);
        window.location.href = data.url;
      } else {
        devWarn('[Auth] OAuth returned no URL — provider may not be configured. Check Supabase Dashboard.');
        return { success: false, error: `OAuth could not start. The ${provider} provider may not be configured correctly in the Supabase Dashboard.` };
      }
      return { success: true, url: data?.url };
    } catch (error) {
      devError('[Auth] OAuth exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : `${provider} login failed`,
      };
    }
  };

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string; role?: UserRole; onboardingNeeded?: boolean }> => {
    try {
      setIsLoading(true);
      devLog('[Auth] Login attempt started');

      // ── Rate limiting check ──
      const normalizedEmail = email.trim().toLowerCase();
      const delay = getLoginDelay(normalizedEmail);
      if (delay > 0) {
        devLog(`[Auth] Rate limit delay: ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const remaining = getRemainingAttempts(normalizedEmail);
      if (remaining <= 0) {
        setIsLoading(false);
        return {
          success: false,
          error: 'Too many login attempts. Please try again in 15 minutes.',
        };
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

      if (error) {
        recordLoginAttempt(normalizedEmail);
        devWarn('[Auth] Login error:', error.message);
        setIsLoading(false);
        return { success: false, error: error.message };
      }

      // Rate limit: reset on success
      resetLoginAttempts(normalizedEmail);

      if (data.user) {
        setSession(data.session);
        setSupabaseUser(data.user);

        // Fetch existing profile first
        let profile = await ensureUserProfile(data.user, undefined, false);

        // If profile not found, retry once after short delay
        if (!profile) {
          await new Promise(resolve => setTimeout(resolve, 500));
          profile = await ensureUserProfile(data.user, undefined, false);
        }

        // If still no profile, auto-create from the authenticated user's metadata.
        // This covers edge cases where the profile row was never created or was
        // deleted/duplicated during a failed signup or prior auth recovery.
        if (!profile) {
          const meta = data.user?.user_metadata || {};
          const roleHint = (meta.role === 'freelancer' || meta.role === 'client'
            ? meta.role as UserRole
            : undefined);

          if (roleHint) {
            devLog('[Auth] No profile found during login — auto-creating from user metadata');
            profile = await ensureUserProfile(data.user, roleHint, true);
          } else {
            devLog('[Auth] No profile found during login — trying a direct recovery with fallback role');
            profile = await ensureUserProfile(data.user, 'freelancer', true);
          }
        }

        if (profile) {
          setUser(profile);
          setIsLoading(false);
          devLog('[Auth] Login successful:', profile.email, 'role:', profile.role);
          // 📡 Broadcast cross-tab auth sync
          broadcastAuthMessage({ type: 'AUTH_SIGNED_IN', userId: data.user.id });
          return {
            success: true,
            role: profile.role,
            onboardingNeeded: profile.onboardingCompleted === false,
          };
        }

        devWarn('[Auth] Profile still missing after recovery attempt; trying createUserProfile as last resort');
        // 🌟 Final fallback: use the createUserProfile RPC (idempotent upsert via
        // SECURITY DEFINER — works even if RLS would block a direct insert).
        try {
          const meta = data.user?.user_metadata || {};
          const savedRole = (meta.role === 'freelancer' || meta.role === 'client') ? meta.role as UserRole : 'freelancer';
          const savedName = (typeof meta.name === 'string' && meta.name.trim()) || data.user.email?.split('@')[0] || 'User';
          
          profile = await createUserProfile(data.user.id, normalizedEmail, savedName, savedRole);
          if (profile) {
            devLog('[Auth] Profile recovered via createUserProfile for:', normalizedEmail);
          }
        } catch (directErr) {
          devWarn('[Auth] createUserProfile recovery failed:', directErr);
        }

        if (profile) {
          setUser(profile);
          setIsLoading(false);
          devLog('[Auth] Login recovered after final retry:', profile.email, 'role:', profile.role);
          // 📡 Broadcast cross-tab auth sync
          broadcastAuthMessage({ type: 'AUTH_SIGNED_IN', userId: data.user.id });
          return {
            success: true,
            role: profile.role,
            onboardingNeeded: profile.onboardingCompleted === false,
          };
        }

        devWarn('[Auth] Profile not found after all recovery attempts; keeping session intact for manual support');
        setUser(null);
        setSession(null);
        setSupabaseUser(null);
        setIsLoading(false);
        return { success: false, error: 'We could not restore your profile. Please try again in a moment or contact support.' };
      }

      setIsLoading(false);
      return { success: false, error: 'Login failed. Please try again.' };
    } catch (error) {
      devError('[Auth] Login exception:', error);
      setIsLoading(false);
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
    }
  };

  const signup = async (
    email: string,
    password: string,
    name: string,
    role: UserRole,
    referrerCode?: string
  ): Promise<{ success: boolean; error?: string; message?: string; needsVerification?: boolean }> => {
    try {
      setIsLoading(true);
      devLog('[Auth] Signup attempt started for role:', role);

      if (!role) {
        return { success: false, error: 'Please select a role' };
      }

      const referralCode = createReferralCode(role.substring(0, 2).toUpperCase());

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role, referral_code: referralCode, referred_by: referrerCode || null },
          // 🎯 Email confirmation links land DIRECTLY on the EmailConfirmPage —
          // a plain "Email verified ✓ — you can now close this window" screen.
          // NEVER /auth/callback (which auto-redirects to onboarding before the
          // user has returned to the original tab and clicked "I've verified").
          // ⚠️ NO ?type=signup query here: GoTrue's redirect allowlist uses glob
          // matching against the FULL URL including the query string, so adding
          // ?type=signup made the link fail validation → GoTrue fell back to the
          // Site URL (homepage) → ugly homepage flash before the verify page.
          // GoTrue appends type=signup itself in the final redirect, so the
          // plain URL both matches the allowlist AND still carries the type.
          emailRedirectTo: `${window.location.origin}/auth/email-confirm`,
        },
      });

      if (error) {
        devWarn('[Auth] Signup error:', error.message);
        
        // 🆕 Friendly message when the built-in email sender is rate-limited (429)
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          setIsLoading(false);
          return {
            success: false,
            error: 'Too many verification emails were sent recently. Please wait a while and try again.',
          };
        }
        
        // 🆕 If email sending fails (SMTP not configured), try auto-login anyway
        // Supabase still creates the user in auth.users even when email fails.
        if (error.message.includes('confirmation email') || error.message.includes('Error sending')) {
          devLog('[Auth] Email sending failed but user may be created — attempting auto-login');
          
          // Try to auto-login immediately
          const { data: loginData } = await supabase.auth.signInWithPassword({ email, password });
          
          if (loginData?.user) {
            devLog('[Auth] Auto-login succeeded after email failure');
            setSession(loginData.session);
            setSupabaseUser(loginData.user);
            
            // Create profile (use the already-generated referralCode)
            let created = await createUserProfile(loginData.user.id, email, name, role, referralCode);
            if (!created) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              created = await createUserProfile(loginData.user.id, email, name, role, referralCode);
            }
            
            if (created) {
              setUser(created);
              // 📧 Welcome email disabled — Brevo removed (Supabase Auth built-in sender handles verification)
              setIsLoading(false);
              return { 
                success: true, 
                message: 'Account created successfully! Welcome to Growlancer.' 
              };
            }
          }
          
          // If auto-login also failed, guide the user to verify via email
          setIsLoading(false);
          return { 
            success: false, 
            error: 'Account created! Please check your inbox (and spam folder) for the verification email and click the link to activate your account, then log in with your email and password.'
          };
        }
        
        setIsLoading(false);
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Try to create profile immediately
        let created = await createUserProfile(data.user.id, email, name, role, referralCode);

        // Retry once if profile creation failed
        if (!created) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          created = await createUserProfile(data.user.id, email, name, role, referralCode);
        }

        if (created) {
          devLog('[Auth] Profile created immediately for:', email);
        } else {
          devWarn('[Auth] Profile creation deferred');
        }

        // ✅ Auto-login: only attempt when email is already confirmed (auto-confirm
        // is enabled or the user verified via a different path). With real email
        // verification enabled and unconfirmed email, signInWithPassword always
        // fails — skip it to avoid wasting ~1s of latency and a confusing error.
        let loginData: { user: import('@supabase/supabase-js').User; session: import('@supabase/supabase-js').Session } | null = null;
        const emailConfirmed = !!data.user?.email_confirmed_at;
        if (emailConfirmed) {
          devLog('[Auth] Email already confirmed — attempting auto-login after signup for:', email);
          const { data: autoLogin, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
          if (autoLogin?.user && !loginError) {
            loginData = autoLogin;
            setSession(autoLogin.session);
            setSupabaseUser(autoLogin.user);
            if (created) setUser(created);
            devLog('[Auth] Auto-login succeeded after signup');
          } else {
            devLog('[Auth] Auto-login failed (email confirmed but login rejected):', loginError?.message);
          }
        } else {
          devLog('[Auth] Email not confirmed yet — skipping auto-login, user must verify email first');
        }

        // Process referral if this signup came from a referral link.
        // process_referral now requires an authenticated session (auth.uid() ==
        // p_new_user_id). With email verification ON there is no session at signup
        // time, so the referral is deferred and recorded on first login instead.
        if (referrerCode) {
          if (loginData?.user) {
            try {
              const { data: refData, error: refError } = await supabase.rpc('process_referral', {
                p_referral_code: referrerCode,
                p_new_user_id: data.user.id,
                p_new_user_email: email,
              });
              if (refError || (refData as any)?.success !== true) {
                devWarn('[Auth] Referral not recorded:', refError?.message || (refData as any)?.error);
              } else {
                devLog('[Auth] Referral processed successfully for code:', referrerCode);
                // Mark done so the deferred syncAuthUser path doesn't re-query
                localStorage.setItem(`growlancer_ref_done_${data.user.id}`, '1');
                try {
                  await supabase.from('connects_transactions').insert({
                    user_id: data.user.id,
                    amount: 5,
                    type: 'bonus',
                    description: 'Welcome bonus - referred by friend',
                  });
                  devLog('[Auth] Referred user granted 5 free connects');
                } catch (bonusErr) {
                  devWarn('[Auth] Referral bonus grant error:', bonusErr);
                }
              }
            } catch (refErr) {
              devWarn('[Auth] Referral processing exception:', refErr);
            }
          } else {
            // Email verification required — process the referral on first login
            // (syncAuthUser picks up the pending flag + user_metadata.referred_by).
            try {
              localStorage.setItem('growlancer_pending_ref', JSON.stringify({ code: referrerCode }));
              devLog('[Auth] Referral deferred until first login');
            } catch {
              // localStorage unavailable — referral is best-effort only
            }
          }
        }

        // 📧 Welcome email disabled — Brevo completely removed.
        // Verification emails are handled by Supabase Auth built-in sender.

        setIsLoading(false);
        return {
          success: true,
          message: loginData?.user
            ? 'Account created successfully! Welcome to Growlancer.'
            : 'Account created! Check your inbox for a verification link, then log in with your email and password.',
          needsVerification: !loginData?.user,
        };
      }

      setIsLoading(false);
      return { success: false, error: 'Signup failed. Please try again.' };
    } catch (error) {
      devError('[Auth] Signup exception:', error);
      setIsLoading(false);
      return { success: false, error: error instanceof Error ? error.message : 'Signup failed' };
    }
  };

  const logout = async (): Promise<void> => {
    // 🔥 Bulletproof logout: first try the normal server-side signOut, but ALWAYS
    // force-clear the persisted session afterwards. For deleted users signOut()
    // returns early without clearing localStorage — without this the stale token
    // survives and re-logs the user in on the next page load.
    await supabase.auth.signOut().catch(() => {});

    // 🔥 Guaranteed cleanup — removes every sb-*-auth-token key.
    clearSupabaseAuthStorage();

    // 📡 Broadcast cross-tab auth sync BEFORE clearing state
    // Other tabs need to know BEFORE we navigate away
    broadcastAuthMessage({ type: 'AUTH_SIGNED_OUT' });

    setUser(null);
    setSession(null);
    setSupabaseUser(null);

    window.location.href = '/';
  };

  const getDashboardRoute = (userRole?: UserRole): string => {
    const roleToUse = userRole || user?.role;
    if (!roleToUse) return '/';
    switch (roleToUse) {
      case 'freelancer':
        return '/dashboard';
      case 'client':
        return '/client';
      case 'admin':
        return '/admin';
      default:
        return '/';
    }
  };

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser(prev => (prev ? { ...prev, ...updates } : null));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseUser,
        role: (user?.role || 'freelancer') as UserRole,
        isAuthenticated: !!user && !!session,
        isLoading,
        session,
        signInWithOAuth,
        login,
        signup,
        logout,
        getDashboardRoute,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}