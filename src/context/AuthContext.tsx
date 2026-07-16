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

  const MAX_INIT_RETRIES = 1;
  const INIT_RETRY_DELAY_MS = 3000;
  const AUTH_TIMEOUT_MS = 15000;

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
            await supabase.rpc('process_referral' as any, {
              p_referral_code: oauthRefCode,
              p_new_user_id: authUser.id,
              p_new_user_email: authUser.email || '',
            } as any);
            devLog('[Auth] OAuth referral processed for code:', oauthRefCode);
            // 🆕 Grant referred OAuth user 5 free connects as welcome bonus
            try {
              await supabase.from('connects_transactions' as any).insert({
                user_id: authUser.id,
                amount: 5,
                type: 'bonus',
                description: 'Welcome bonus - referred by friend',
              } as any);
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
        } else {
          devError(
            '[Auth] Profile fetch failed during session refresh — user likely deleted from backend. Signing out.'
          );
        }
        // Profile doesn't exist in the database — user was deleted from backend.
        // Clear all auth state and sign out instead of creating a stale minimal user.
        await supabase.auth.signOut().catch(() => {});
        setUser(null);
        setSession(null);
        setSupabaseUser(null);
        return null;
      }

      setUser(profile);
    },
    [ensureUserProfile, createUserProfile, createReferralCode]
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
          const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
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
          subscription = sub;
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

          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();

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
            window.location.href = '/';
            return;
          }
          // Otherwise (INSERT/UPDATE), re-fetch the profile
          const updated = await fetchUserProfile(user.id);
          if (updated) {
            setUser(updated);
          } else {
            // Profile no longer exists — sign out
            devLog('[Auth] Profile disappeared — signing out');
            await supabase.auth.signOut().catch(() => {});
            setUser(null);
            setSession(null);
            setSupabaseUser(null);
            window.location.href = '/';
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id]);

  // Proactive user existence check: runs when the page becomes visible again
  // and on a periodic interval to detect backend-side user deletion.
  useEffect(() => {
    if (!user?.id) return;

    let isChecking = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkProfileExists = async () => {
      if (isChecking || !user?.id) return;
      isChecking = true;
      try {
        const profile = await fetchUserProfile(user.id);
        if (!profile) {
          devLog('[Auth] Periodic check: Profile not found — user deleted from backend');
          await supabase.auth.signOut().catch(() => {});
          setUser(null);
          setSession(null);
          setSupabaseUser(null);
          window.location.href = '/';
        }
      } catch {
        // Silently ignore — retry on next interval
      } finally {
        isChecking = false;
      }
    };

    // Check every 30 seconds
    intervalId = setInterval(checkProfileExists, 30000);

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
  }, [user?.id]);

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

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        devWarn('[Auth] Login error:', error.message);
        setIsLoading(false);
        return { success: false, error: error.message };
      }

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

        // 🆕 If still no profile, auto-create from user_metadata (handles missing profile case)
        if (!profile && data.user?.user_metadata?.role) {
          devLog('[Auth] No profile found during login — auto-creating from user_metadata');
          profile = await ensureUserProfile(
            data.user,
            data.user.user_metadata.role as UserRole,
            true
          );
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

        devWarn('[Auth] Profile not found after retry, signing out user');
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setSupabaseUser(null);
        setIsLoading(false);
        return { success: false, error: 'Profile not found. Please contact support.' };
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
            const { error: refError } = await supabase.rpc('process_referral' as any, {
              p_referral_code: referrerCode,
              p_new_user_id: data.user.id,
              p_new_user_email: email,
            } as any);
            if (refError) {
              devWarn('[Auth] Referral processing error:', refError.message);
            } else {
              devLog('[Auth] Referral processed successfully for code:', referrerCode);
              try {
                await supabase.from('connects_transactions' as any).insert({
                  user_id: data.user.id,
                  amount: 5,
                  type: 'bonus',
                  description: 'Welcome bonus - referred by friend',
                } as any);
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
        if (freshSession.session?.user) {
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