import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { AuthUser, UserRole } from '../types/auth';
import {
  fetchUserProfile,
  createUserProfile,
  createReferralCode,
} from '../lib/services/authService';
import { captureError, captureInfo } from '../lib/telemetry';
import {
  recordLoginAttempt,
  resetLoginAttempts,
  getLoginDelay,
  getRemainingAttempts,
} from '../lib/rateLimiter';

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
  signInWithOAuth: (provider: 'google' | 'linkedin_oidc') => Promise<{ success: boolean; error?: string }>;
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; role?: UserRole; onboardingNeeded?: boolean }>;
  signup: (
    email: string,
    password: string,
    name: string,
    role: UserRole,
    referrerCode?: string
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
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
      // Try to fetch existing profile
      const profile = await fetchUserProfile(authUser.id);
      if (profile) return profile;

      // Only create profile if explicitly allowed (signup) and roleHint is provided
      if (!allowCreate || !roleHint) return null;

      const userEmail = authUser.email || '';
      const userName =
        (typeof authUser.user_metadata?.name === 'string' && authUser.user_metadata.name.trim()) ||
        userEmail.split('@')[0] ||
        'User';
      const referralCode =
        typeof authUser.user_metadata?.referral_code === 'string'
          ? authUser.user_metadata.referral_code
          : createReferralCode(roleHint.substring(0, 2).toUpperCase());

      return createUserProfile(authUser.id, userEmail, userName, roleHint, referralCode);
    },
    []
  );

  const MAX_INIT_RETRIES = 0;
  const INIT_RETRY_DELAY_MS = 2000;
  const AUTH_TIMEOUT_MS = 8000;

  const syncAuthUser = useCallback(
    async (authUser: SupabaseUser, roleHint?: UserRole) => {
      // Try to fetch existing profile
      let profile = await ensureUserProfile(authUser, roleHint, !!roleHint);

      // 🆕 Deferred profile creation: if email is confirmed but no profile exists
      // (e.g., signup RPC failed, or OAuth signup), create one now.
      // Uses saved role from user_metadata to preserve user's choice.
      if (!profile && authUser.email_confirmed_at) {
        devLog('[Auth] User without profile — auto-creating now (email confirmed)');
        const meta = authUser.user_metadata || {};
        const name =
          (typeof meta.name === 'string' && meta.name.trim()) ||
          (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
          authUser.email?.split('@')[0] ||
          'User';
        
        // 🆕 Use saved role from user_metadata if available, else default to 'freelancer'
        const savedRole = (meta.role === 'freelancer' || meta.role === 'client')
          ? meta.role as UserRole
          : (roleHint || 'freelancer');
        
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

        // 🆕 Process referral if this OAuth signup came from a referral link
        if (oauthRefCode && profile) {
          try {
            await supabase.rpc('process_referral', {
              p_referral_code: oauthRefCode,
              p_new_user_id: authUser.id,
              p_new_user_email: authUser.email || '',
            });
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
          } catch (refErr) {
            devWarn('[Auth] OAuth referral processing error:', refErr);
          }
        }
      }

      if (!profile) {
        if (roleHint) {
          devError('[Auth] Failed to sync user profile during login/signup');
          await supabase.auth.signOut().catch(() => {});
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
          setUser(null);
          setSession(null);
          setSupabaseUser(null);
          return null;
        }
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

        // Retry loop: attempt session fetch up to MAX_INIT_RETRIES + 1 times
        let currentSession: Session | null = null;
        let lastError: Awaited<ReturnType<typeof supabase.auth.getSession>>['error'] = null;

        for (let attempt = 0; attempt <= MAX_INIT_RETRIES; attempt++) {
          if (attempt > 0) {
            devLog(`[Auth] Retry attempt ${attempt}/${MAX_INIT_RETRIES}...`);
            await new Promise(resolve => setTimeout(resolve, INIT_RETRY_DELAY_MS));
          }

          const result = await supabase.auth.getSession();
          const session = result.data?.session ?? null;
          const error = result.error;

          if (error) {
            lastError = error;
            devWarn(`[Auth] Session fetch attempt ${attempt + 1} failed:`, error.message);
            continue; // Retry
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

        setSession(currentSession);
        setSupabaseUser(currentSession?.user || null);

        if (currentSession?.user) {
          await syncAuthUser(currentSession.user);
        } else {
          setUser(null);
          setSession(null);
          setSupabaseUser(null);
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
          setIsLoading(false);
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
      setIsLoading(false);
    }, AUTH_TIMEOUT_MS);

    return () => {
      mounted = false;
      if (authTimeout) clearTimeout(authTimeout);
      if (subscription) subscription.unsubscribe();
    };
  }, [syncAuthUser]);

  useEffect(() => {
    if (!user?.id) return;

    // 🚫 SKIP for admin users — AdminAuthGuard handles admin auth separately.
    // The periodic profile check below would fire signOut on repeated failures,
    // which cascades to AdminAuthGuard via onAuthStateChange and logs admin out.
    if (user.role === 'admin') return;

    const channel = supabase
      .channel(`profile_updates:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        async (payload) => {
          // If the profile was deleted (event: DELETE), sign out immediately
          if (payload.eventType === 'DELETE') {
            devLog('[Auth] Profile deleted from backend — signing out');
            await supabase.auth.signOut().catch(() => {});
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
          } else {
            devLog('[Auth] Profile still not found after', realtimeRetries, 'retries — NOT signing out (suspected transient)');
            // ⚠️ Don't sign out on transient failure — just keep current user state.
            // The periodic check (higher threshold) will handle real deletion.
          }
        }
      )
      .subscribe();

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
      if (isChecking || !user?.id) return;
      isChecking = true;
      try {
        const profile = await fetchUserProfile(user.id);
        if (!profile) {
          consecutiveFailures++;
          if (consecutiveFailures >= MAX_PROFILE_CHECK_FAILURES) {
            devLog('[Auth] Periodic check: Profile not found after', MAX_PROFILE_CHECK_FAILURES, 'attempts — signing out');
            await supabase.auth.signOut().catch(() => {});
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
          setUser(null);
          setSession(null);
          setSupabaseUser(null);
        }
      } finally {
        isChecking = false;
      }
    };

    // Check every 60 seconds (was 30s — reduced frequency to prevent accidental signout)
    intervalId = setInterval(checkProfileExists, PROFILE_CHECK_INTERVAL_MS);

    // Also check when page becomes visible again (user switches back to tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkProfileExists();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id, user?.role]);

  const signInWithOAuth = async (
    provider: 'google' | 'linkedin_oidc'
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // 🆕 Preserve referral code from URL before OAuth redirect
      const refParam = new URLSearchParams(window.location.search).get('ref');
      if (refParam) {
        localStorage.setItem('growlancer_oauth_ref', refParam);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        devWarn('[Auth] OAuth error:', error.message);
        return { success: false, error: error.message };
      }

      // OAuth redirects the browser — no need to set state here
      devLog('[Auth] OAuth initiated for provider:', provider);
      return { success: true };
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
          return {
            success: true,
            role: profile.role,
            onboardingNeeded: profile.onboardingCompleted === false,
          };
        }

        devWarn('[Auth] Profile still missing after recovery attempt; retrying once with a fresh profile lookup');
        await new Promise(resolve => setTimeout(resolve, 1000));
        profile = await ensureUserProfile(data.user, 'freelancer', true);

        if (profile) {
          setUser(profile);
          setIsLoading(false);
          devLog('[Auth] Login recovered after final retry:', profile.email, 'role:', profile.role);
          return {
            success: true,
            role: profile.role,
            onboardingNeeded: profile.onboardingCompleted === false,
          };
        }

        devWarn('[Auth] Profile not found after recovery attempts; keeping session intact for manual support');
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
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
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
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        devWarn('[Auth] Signup error:', error.message);
        
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
              setIsLoading(false);
              return { 
                success: true, 
                message: 'Account created successfully! Welcome to Growlancer.' 
              };
            }
          }
          
          // If auto-login also failed, tell user about email settings
          setIsLoading(false);
          return { 
            success: false, 
            error: 'Account created but email confirmation failed. Please go to Supabase Dashboard → Authentication → Providers → Email and turn OFF "Confirm email", then try again. Or try logging in with your email and password.'
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

        // Process referral if this signup came from a referral link
        if (referrerCode) {
          try {
            const { error: refError } = await supabase.rpc('process_referral', {
              p_referral_code: referrerCode,
              p_new_user_id: data.user.id,
              p_new_user_email: email,
            });
            if (refError) {
              devWarn('[Auth] Referral processing error:', refError.message);
            } else {
              devLog('[Auth] Referral processed successfully for code:', referrerCode);
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
        }

        // Auto sign-in — bypass email confirmation (temporary fix until email service is set up)
        await supabase.auth.signInWithPassword({ email, password });

        // Re-fetch session and sync
        const { data: freshSession } = await supabase.auth.getSession();
        if (freshSession?.session?.user) {
          setSession(freshSession.session);
          setSupabaseUser(freshSession.session.user);
          await syncAuthUser(freshSession.session.user, role);
        }

        setIsLoading(false);
        return { 
          success: true, 
          message: 'Account created successfully! Welcome to Growlancer.' 
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
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        captureError('Sign out failed', {
          source: 'auth',
          message: error.message,
        });
      }

      setUser(null);
      setSession(null);
      setSupabaseUser(null);

      window.location.href = '/';
    } catch (error) {
      devError('[Auth] Logout exception:', error);
      setUser(null);
      setSession(null);
      setSupabaseUser(null);
      window.location.href = '/';
    }
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