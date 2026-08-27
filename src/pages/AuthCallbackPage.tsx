import { useEffect, useState, startTransition } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { fetchUserProfile, createUserProfile as createProfile } from '../lib/services/authService';
import { redirectAfterAuth } from '../lib/authAction';
import { CheckCircle2, Loader2, XCircle, MapPin, ArrowRight } from 'lucide-react';

const isDev = import.meta.env.DEV;
function devLog(...args: unknown[]) {
  if (isDev) console.log('[AuthCallback]', ...args);
}

/** Safe navigation wrapper — prevents React state-update-on-unmounted errors */
function safeNavigate(navFn: () => void) {
  startTransition(() => {
    setTimeout(navFn, 50);
  });
}

// ⚠️ redirectAfterAuth is imported from ../lib/authAction (shared with
// EmailConfirmPage + VerifyEmailPage) so every auth entry point converges on
// the SAME destination rules: role selection → onboarding → dashboard.
// Full-page window.location.replace avoids the ProtectedRoute bounce-back race.

type CallbackStatus = 'processing' | 'success' | 'error' | 'country_gate';
type AuthAction = 'signup' | 'recovery' | 'magiclink' | 'email_change' | 'invite' | 'reauthentication' | 'unknown';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [action, setAction] = useState<AuthAction>('unknown');

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        // ── 1. Detect auth action type ──
        // With flowType 'implicit', session tokens arrive in the URL hash
        // (#access_token=...&type=signup). React fires child effects before parent
        // effects, so THIS effect runs BEFORE AuthProvider's getSession() — the hash
        // is still present here and supabase-js hasn't stripped it yet. Read `type`
        // from BOTH the search string (email links carry ?type=signup) and the hash.
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const typeParam = (searchParams.get('type') || hashParams.get('type') || null) as
          | AuthAction
          | null;
        const detectedAction = typeParam || 'unknown';
        setAction(detectedAction);

        // ── 2. Check for OAuth error (search or hash) ──
        const error = searchParams.get('error') || hashParams.get('error');
        const errorDescription =
          searchParams.get('error_description') || hashParams.get('error_description');

        if (error) {
          setStatus('error');
          setErrorMessage(
            errorDescription?.replace(/\+/g, ' ') ||
              'Authentication failed. Please try again.'
          );
          return;
        }

        // ── 3. Handle magiclink type specially (has token_hash) ──
        if (detectedAction === 'magiclink') {
          const tokenHash = searchParams.get('token_hash');
          if (tokenHash) {
            const { error: verifyError } = await supabase.auth.verifyOtp({
              type: 'magiclink',
              token_hash: tokenHash,
            });

            if (verifyError) {
              setStatus('error');
              setErrorMessage(verifyError.message);
              return;
            }
          }
        }

        // ── 4. Handle signup/email_change verification via token_hash ──
        if (detectedAction === 'signup' || detectedAction === 'email_change') {
          const tokenHash = searchParams.get('token_hash');
          if (tokenHash) {
            const { error: verifyOtpError } = await supabase.auth.verifyOtp({
              type: detectedAction === 'email_change' ? 'email_change' : 'signup',
              token_hash: tokenHash,
            });

            // 🛡️ Invalid / expired verification link — show a clear error instead of
            // a misleading success (this is the primary email signup path now that
            // real email verification is enabled).
            if (verifyOtpError) {
              setStatus('error');
              setErrorMessage(
                verifyOtpError.message.includes('expired')
                  ? 'This verification link has expired. Please sign up again to receive a fresh link.'
                  : 'This verification link is invalid. Please sign up again to receive a fresh link.'
              );
              return;
            }
          }
        }

        // 4b. Welcome email disabled — Brevo removed. Verification handled by Supabase Auth.

        // ── 5. Get the current session (with retry + fallbacks) ──
        let authUser: import('@supabase/supabase-js').User | null = null;
        let sessionFound = false;

        // Try getSession with retry first — supabase-js's detectSessionInUrl usually
        // auto-exchanges the PKCE `code` on load, so getSession is the common path.
        // ⚡ Fast retries (400ms) — no artificial multi-second waits.
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 400));
          try {
            const { data, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) continue;
            if (data.session?.user) {
              authUser = data.session.user;
              sessionFound = true;
              break;
            }
          } catch (sessionThrow) {
            devLog('[AuthCallback] getSession threw (attempt', attempt, '):',
              sessionThrow instanceof Error ? sessionThrow.message : String(sessionThrow));
          }
        }

        // 🆕 PKCE explicit exchange fallback: if no session after getSession retries
        // and a `code` param is present (e.g. the redirect chain through the homepage
        // fallback bounced here and the auto-detection was missed), exchange it now.
        if (!sessionFound) {
          const pkceCode = searchParams.get('code');
          if (pkceCode) {
            try {
              const { data: exchanged, error: exchangeError } = await supabase.auth
                .exchangeCodeForSession(pkceCode);
              if (!exchangeError && exchanged?.session?.user) {
                authUser = exchanged.session.user;
                sessionFound = true;
                devLog('[AuthCallback] PKCE code exchanged successfully');
              } else {
                devLog('[AuthCallback] PKCE exchange failed (may already be exchanged):',
                  exchangeError?.message || 'unknown');
              }
            } catch (pkceThrow) {
              devLog('[AuthCallback] PKCE exchange threw:',
                pkceThrow instanceof Error ? pkceThrow.message : String(pkceThrow));
            }
          }
        }

        // 🛡️ DIRECT implicit-flow session from the URL hash — run BEFORE the
        // getUser fallback. getSession() only reads localStorage; if supabase-js's
        // detectSessionInUrl hasn't persisted the OAuth tokens (or failed to),
        // there's no session in storage and getSession returns null. Building the
        // session here with setSession() PERSISTS it, so the post-callback redirect
        // actually has a session — otherwise ProtectedRoute bounces the user back
        // to login even though the GitHub/LinkedIn user exists.
        // (Confirmed via console: user found via getUser, but no session in
        //  storage → 'Protected route blocked unauthenticated' → back to login.)
        if (!sessionFound) {
          const hashAccessToken = hashParams.get('access_token');
          const hashRefreshToken = hashParams.get('refresh_token');
          if (hashAccessToken && hashRefreshToken) {
            devLog('[AuthCallback] Implicit-flow hash tokens present — setting session directly');
            try {
              const { data: setSessionData, error: setSessionErr } = await supabase.auth.setSession({
                access_token: hashAccessToken,
                refresh_token: hashRefreshToken,
              });
              if (!setSessionErr && setSessionData?.session?.user) {
                authUser = setSessionData.session.user;
                sessionFound = true;
                devLog('[AuthCallback] Session established from hash tokens');
              } else {
                devLog('[AuthCallback] setSession from hash failed:',
                  setSessionErr?.message || 'unknown');
              }
            } catch (setSessionThrow) {
              devLog('[AuthCallback] setSession from hash threw:',
                setSessionThrow instanceof Error ? setSessionThrow.message : String(setSessionThrow));
            }
          }
        }

        // If still no session, try silent refresh via getUser — but ONLY a real
        // session counts. A bare user (no persisted session) does NOT survive the
        // next page load and would bounce back to login.
        if (!sessionFound) {
          devLog('[AuthCallback] getSession failed — trying getUser + refresh');
          try {
            const { data: userData } = await supabase.auth.getUser();
            if (userData?.user) {
              const { data: refreshed } = await supabase.auth.refreshSession();
              if (refreshed?.session?.user) {
                authUser = refreshed.session.user;
                sessionFound = true;
              }
            }
          } catch (getUserThrow) {
            devLog('[AuthCallback] getUser/refresh threw:',
              getUserThrow instanceof Error ? getUserThrow.message : String(getUserThrow));
          }
        }

        // 🆕 localStorage-direct recovery: if supabase-js saved the OAuth session
        // to storage but the in-memory state is missing (e.g. _initialize raced or
        // failed partway), read the raw stored session and re-establish it. The
        // stored value is the full Session JSON (user included) under
        // sb-<project-ref>-auth-token.
        if (!sessionFound) {
          let storedKey = '';
          try {
            storedKey = `sb-${new URL(import.meta.env.VITE_SUPABASE_URL || '').host.split('.')[0]}-auth-token`;
          } catch {
            // env missing — skip
          }
          try {
            const raw = storedKey ? localStorage.getItem(storedKey) : null;
            if (raw && raw !== 'null') {
              const parsed = JSON.parse(raw) as
                | { access_token?: string; refresh_token?: string; user?: { id: string } | null }
                | null;
              if (parsed?.access_token && parsed?.refresh_token) {
                devLog('[AuthCallback] Recovered session from localStorage — re-establishing');
                await supabase.auth
                  .setSession({
                    access_token: parsed.access_token,
                    refresh_token: parsed.refresh_token,
                  })
                  .catch(() => ({ data: { session: null } }));
                const { data: recovered } = await supabase.auth
                  .getSession()
                  .catch(() => ({ data: { session: null } }));
                if (recovered?.session?.user) {
                  authUser = recovered.session.user;
                  sessionFound = true;
                  devLog('[AuthCallback] Session re-established from localStorage');
                }
              }
            }
          } catch (localRecoveryThrow) {
            devLog('[AuthCallback] localStorage session recovery failed:',
              localRecoveryThrow instanceof Error ? localRecoveryThrow.message : String(localRecoveryThrow));
          }
        }

        // ── 5b. 🛡️ Email verification gate ──
        // For a signup confirmation, the email MUST be confirmed before we route
        // the user onward. Never trust the frontend — supabase.auth.getUser() only
        // returns email_confirmed_at once Supabase has actually confirmed it.
        // OAuth providers (github/linkedin) auto-confirm the email at account
        // creation, so the gate only applies to email/password signups.
        const authProvider = (authUser?.app_metadata?.provider as string | undefined) ?? '';
        const isProviderOAuth =
          authProvider === 'github' || authProvider === 'linkedin_oidc';
        const isOAuthFlow =
          detectedAction === 'unknown' || isProviderOAuth;

        if (sessionFound && authUser && detectedAction === 'signup' && !isOAuthFlow && !authUser.email_confirmed_at) {
          devLog('[AuthCallback] Signup session but email NOT confirmed yet');
          setStatus('error');
          setErrorMessage(
            'Your email is not confirmed yet. Check your inbox (and spam folder) for the verification link, then click it to activate your account.'
          );
          return;
        }

        // 🎯 Email/password signup with CONFIRMED email — show the plain "Email
        // verified ✓ — you can now close this window" screen and STOP. NEVER
        // auto-redirect this tab to onboarding: the user finishes in the ORIGINAL
        // tab via VerifyEmailPage's "I've verified, continue" button (or its
        // real-time listener), which routes to onboarding. This is the exact flow
        // requested: the confirm tab only ever says "verified, close this window".
        // (Covers confirm links that still point at /auth/callback — e.g. emails
        //  sent before the redirect target was switched to /auth/email-confirm.)
        if (sessionFound && authUser && detectedAction === 'signup' && !isOAuthFlow) {
          devLog('[AuthCallback] Email signup confirmed — showing close-window screen (no auto-onboarding)');
          // Brief success flash, then land on EmailConfirmPage's dedicated
          // "Email verified ✓ — close this window" screen (session is already
          // persisted, so it shows success instantly).
          setStatus('success');
          await new Promise(resolve => setTimeout(resolve, 1200));
          if (cancelled) return;
          window.location.replace('/auth/email-confirm');
          return;
        }

        // ✅ OAuth (GitHub/LinkedIn) users NEVER hit an email-confirmation gate —
        // the provider already verified identity at sign-in, so requiring another
        // app-level email confirmation would block brand-new users from onboarding
        // (the 'logged in but stuck on verify-email' bug). They proceed straight to
        // role selection → onboarding → dashboard. Verification can be done later
        // from Settings (email shows 'Not Verified' with a resend button).
        // Email/password signups keep their confirmation gate (handled above).

        if (!sessionFound) {
          // 🛡️ PKCE flow: if a `code` param is present in the URL but no session was
          // established, the verification link was expired/invalid — show a clear
          // error instead of a misleading success.
          const hasPkceCode = searchParams.get('code');

          // For signup/verification, handle success vs expired-link error properly
          if (detectedAction === 'signup' || detectedAction === 'email_change') {
            if (hasPkceCode) {
              devLog('[AuthCallback] PKCE code present but no session — link likely expired/invalid');
              setStatus('error');
              setErrorMessage(
                'This verification link is invalid or has expired. Please sign up again to receive a fresh link, or request a resend from the verify-email page.'
              );
              return;
            }

            // 🛡️ OAuth signup callbacks can arrive with type=signup in the URL.
            // NEVER send an OAuth (GitHub/LinkedIn) user back to /login — show a
            // clear, actionable error instead (the login redirect was a big part
            // of the 'OAuth login works but bounces back to login' bug).
            if (isProviderOAuth) {
              devLog('[AuthCallback] OAuth signup callback without session — showing error');
              setStatus('error');
              setErrorMessage(
                'Your GitHub/LinkedIn sign-in did not complete. Please try signing in again.'
              );
              return;
            }

            // No code in URL — plain visit (e.g., user navigated here directly).
            // Email is confirmed; guide them to log in.
            setStatus('success');
            await new Promise(resolve => setTimeout(resolve, 1500));
            if (cancelled) return;
            safeNavigate(() => navigate('/login', { replace: true }));
            return;
          }

          // For OAuth (unknown), try one more thing — check URL hash directly
          devLog('[AuthCallback] All session recovery failed — showing error');
          setStatus('error');
          setErrorMessage('No session found. Please try logging in again.');
          return;
        }

        if (cancelled) return;

        // ── 6. Handle specific actions ──
        if (detectedAction === 'recovery') {
          // Password reset — stay on page, show success, redirect to reset page
          setStatus('success');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (cancelled) return;
          safeNavigate(() => navigate('/auth/reset-password', { replace: true }));
          return;
        }

        if (detectedAction === 'email_change') {
          // 🆕 Sync the new email into profiles_private (email column moved from profiles)
          if (authUser?.id && authUser.email) {
            const { error: emailSyncErr } = await supabase
              .from('profiles_private')
              .update({ email: authUser.email, updated_at: new Date().toISOString() })
              .eq('id', authUser.id);
            if (emailSyncErr) devLog('[AuthCallback] email_change profile sync warning:', emailSyncErr.message);
          }
          setStatus('success');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (cancelled) return;
          safeNavigate(() => navigate('/login', { replace: true }));
          return;
        }

        if (detectedAction === 'invite') {
          // 🆕 Accept the invitation in real time — mark accepted + apply the invited
          // role, then route the invitee through onboarding with role pre-selected.
          const inviteToken = searchParams.get('invite_token');
          const inviteRole = searchParams.get('invite_role');
          const invitedRole = inviteRole === 'client' ? 'client' : 'freelancer';

          if (authUser?.id && inviteToken) {
            // 1. Mark the invitation accepted (only if it's still pending)
            const { error: acceptErr } = await supabase
              .from('user_invitations' as any)
              .update({ status: 'accepted', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('invite_token', inviteToken)
              .eq('status', 'pending');
            if (acceptErr) devLog('[AuthCallback] invite accept warning:', acceptErr.message);

            // 2. Apply the invited role to the profile — fetch it first, and create
            //    it with the invited role if it doesn't exist yet (brand-new
            //    invitee). No localStorage dependency — the role is persisted in
            //    the DB so onboarding and the dashboard both see it.
            let inviteProfile = authUser.id ? await fetchUserProfile(authUser.id) : null;
            if (!inviteProfile && authUser.id) {
              const name = authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User';
              inviteProfile = await createProfile(authUser.id, authUser.email || '', name, invitedRole);
            }
            if (inviteProfile) {
              const { error: roleErr } = await supabase
                .from('profiles')
                .update({ role: invitedRole })
                .eq('id', authUser.id);
              if (roleErr) devLog('[AuthCallback] invite role warning:', roleErr.message);
            }
          }

          setStatus('success');
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (cancelled) return;
          safeNavigate(() => navigate('/onboarding', { replace: true }));
          return;
        }

        // ── 7. Country gate for OAuth signups ──
        // If user authenticated via OAuth and has no country set, show country confirmation.
        setStatus('success');

        // ⚡ Fast for OAuth (350ms), but keep the "Email verified successfully!"
        // milestone visible for ~1s on the email/password signup path.
        await new Promise(resolve => setTimeout(resolve, isProviderOAuth ? 350 : 1000));

        if (cancelled) return;

        // 🆕 Read saved role from localStorage (preserved during OAuth signup)
        const savedRole = localStorage.getItem('growlancer_oauth_role');
        const oauthRole = (savedRole === 'freelancer' || savedRole === 'client') ? savedRole : 'freelancer';
        if (savedRole) {
          localStorage.removeItem('growlancer_oauth_role');
        }

        // 🛡️ Only OAuth flows (detectedAction === 'unknown' OR a real OAuth provider)
        // get role correction from localStorage. Email signup users chose their role in
        // the signup form and it's already stored in the profile — never overwrite it
        // here (prevents a 'client' email signup being silently flipped to 'freelancer'
        // after email verification).
        // (isOAuthFlow computed above — includes provider-based detection so GitHub/
        //  LinkedIn signups keep their chosen role even when Supabase sends type=signup.)

        // ⚡ Fast profile fetch — the DB trigger creates the profile row synchronously on
        // auth.users insert, so a single fetch (plus one quick retry) is enough. No more
        // 5×600ms polling loop (was adding up to 3s of artificial delay).
        let profile = authUser?.id ? await fetchUserProfile(authUser.id) : null;
        if (!profile && authUser?.id) {
          await new Promise(r => setTimeout(r, 300));
          profile = await fetchUserProfile(authUser.id);
        }
        if (profile && isOAuthFlow && savedRole && profile.role !== oauthRole) {
          // 🆕 Role correction ONLY when the user explicitly chose a role in the signup
          // modal (savedRole is set). Returning OAuth users (login flow, no savedRole)
          // keep their existing profile role — never flip a client to freelancer.
          try {
            const { error: roleUpdateErr } = await supabase
              .from('profiles')
              .update({ role: oauthRole })
              .eq('id', authUser!.id);
            if (!roleUpdateErr) {
              profile = { ...profile, role: oauthRole as 'freelancer' | 'client' | 'admin' };
            }
          } catch {
            // Non-critical — will be corrected on onboarding
          }
        }

        // 🆕 If profile still doesn't exist after retries, create one with the correct role
        // (OAuth: saved role; email signup: role from user_metadata set in the signup form)
        if (!profile && authUser?.id) {
          const name = authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User';
          const metaRole = authUser.user_metadata?.role;
          const createRole = isOAuthFlow
            ? oauthRole
            : (metaRole === 'freelancer' || metaRole === 'client' ? metaRole : oauthRole);
          profile = await createProfile(
            authUser.id,
            authUser.email || '',
            name,
            createRole as 'freelancer' | 'client'
          );
          // 🆕 Retry once — the DB trigger and the RPC insert can race; a second
          // attempt usually lands (create_user_profile is idempotent via upsert).
          if (!profile && authUser?.id) {
            await new Promise(r => setTimeout(r, 500));
            profile = await createProfile(
              authUser.id,
              authUser.email || '',
              name,
              createRole as 'freelancer' | 'client'
            );
          }
        }

        // 🆕 Country gate: If user has no profile country set (first-time OAuth), show country confirmation
        // Only for OAuth flows (unknown action) / invites — email signups already
        // provided an India phone number in the signup modal, so skip the gate.
        if (profile && !profile.country && detectedAction === 'unknown') {
          setStatus('country_gate');
          if (cancelled) return;
          return; // Stop — country confirmation UI will handle the redirect
        }

        // 🎯 ONE onboarding for everyone (email + OAuth + invite): redirectAfterAuth
        // always lands on /onboarding where the role is chosen on the welcome step.
        // 🛡️ GUARANTEE the session is in localStorage before redirecting.
        // getSession() can return an in-memory session even when supabase-js
        // didn't finish writing storage — the next page load had no session →
        // ProtectedRoute bounced back to login ("login works but back to login").
        // So we write the session + user directly under supabase-js's storage
        // keys, then confirm it reads back before redirecting.
        const sbUrl = import.meta.env.VITE_SUPABASE_URL || '';
        const sbKey = `sb-${new URL(sbUrl).host.split('.')[0]}-auth-token`;

        const sessionReady = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        let session = sessionReady.data?.session ?? null;

        // If no session in-memory (or storage), re-establish from URL tokens.
        if (!session?.user && hashParams.get('access_token') && hashParams.get('refresh_token')) {
          const re = await supabase.auth.setSession({
            access_token: hashParams.get('access_token')!,
            refresh_token: hashParams.get('refresh_token')!,
          }).catch(() => ({ data: { session: null } }));
          session = re.data?.session ?? null;
        }

        if (session?.access_token && session?.refresh_token) {
          // Write both the session and the separate user object supabase-js uses.
          localStorage.setItem(sbKey, JSON.stringify(session));
          localStorage.setItem(`${sbKey}-user`, JSON.stringify({ user: session.user }));
        }

        // Confirm the write actually landed in storage.
        const check = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        const rawStored = localStorage.getItem(sbKey);
        if (!check.data?.session?.user && (!rawStored || rawStored === 'null')) {
          setStatus('error');
          setErrorMessage('Session could not be persisted. Please try again.');
          return;
        }

        devLog('[AuthCallback] redirectAfterAuth', {
          hasProfile: !!profile,
          role: profile?.role,
        });
        // 🎯 ONE onboarding for everyone — role chosen on the onboarding
        // welcome step (no separate OAuth role-selection mini-form).
        redirectAfterAuth(profile);
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'An unexpected error occurred. Please try again.'
          );
        }
      }
    }

    handleCallback();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  // ── Country Gate State ──
  const [countryGateLoading, setCountryGateLoading] = useState(false);
  const [countryGateError, setCountryGateError] = useState<string | null>(null);

  const handleCountrySelect = async (selectedCountry: string) => {
    setCountryGateLoading(true);
    setCountryGateError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        setCountryGateError('Session expired. Please log in again.');
        setCountryGateLoading(false);
        return;
      }

      if (selectedCountry === 'IN') {
        // Save country as India — proceed normally
        const { error: countryErr } = await supabase.rpc('update_user_country', {
          p_user_id: userId,
          p_country: 'IN',
        });
        if (countryErr) {
          // Non-blocking: still continue to onboarding, but log so we can fix silently
          devLog('[AuthCallback] update_user_country RPC warning:', countryErr.message);
        }

        // Now determine redirect based on profile
        // 🛡️ FULL PAGE redirect — same reason as the main callback flow above.
        // Avoids the ProtectedRoute bounce-back race after country selection.
        // Country gate is only reachable for OAuth flows — one onboarding for
        // everyone (role chosen on the welcome step).
        const profile = await fetchUserProfile(userId);
        redirectAfterAuth(profile);
      } else {
        // Non-India country — insert into waitlist, redirect to /waitlist
        const email = sessionData.session?.user?.email || '';
        const oauthName = sessionData.session?.user?.user_metadata?.name
          || sessionData.session?.user?.user_metadata?.full_name
          || sessionData.session?.user?.user_metadata?.user_name
          || null;
        await supabase.rpc('join_waitlist', {
          p_email: email,
          p_country: selectedCountry,
          p_signup_source: 'oauth',
          p_user_id: userId,
          p_name: oauthName,
        });

        safeNavigate(() => navigate('/waitlist', { replace: true }));
      }
    } catch (err) {
      setCountryGateError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
      setCountryGateLoading(false);
    }
  };

  const actionTitles: Record<AuthAction, string> = {
    signup: 'Email verified successfully!',
    recovery: 'Password reset link verified!',
    magiclink: 'Signing you in...',
    email_change: 'Email updated successfully!',
    invite: 'Welcome to Growlancer!',
    reauthentication: 'Identity verified!',
    unknown: 'Processing...',
  };

  const actionDescriptions: Record<AuthAction, string> = {
    signup: 'Your email has been confirmed. Setting up your account...',
    recovery: 'Redirecting you to set a new password...',
    magiclink: 'You will be signed in automatically...',
    email_change: 'Your email has been changed. Redirecting to login...',
    invite: 'Setting up your account. Redirecting to onboarding...',
    reauthentication: 'Your identity has been verified.',
    unknown: 'Please wait while we process your request...',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/UpdatedLogo.webp"
              alt="Growlancer"
              className="h-12 w-12 rounded-xl"
            />
          </div>

          {status === 'processing' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                </div>
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                {actionTitles[action]}
              </h2>
              <p className="text-sm text-slate-500">
                {actionDescriptions[action]}
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                {actionTitles[action]}
              </h2>
              <p className="text-sm text-slate-500">
                {actionDescriptions[action]}
              </p>
            </div>
          )}

          {/* 🆕 Country Gate UI — shown after OAuth for users without country set */}
          {status === 'country_gate' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                Where are you located?
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Growlancer is currently available in <strong>India</strong>. Select your country to continue.
              </p>

              {/* Country Options */}
              <div className="space-y-3 mb-6">
                {/* India — Enabled */}
                <button
                  onClick={() => handleCountrySelect('IN')}
                  disabled={countryGateLoading}
                  className="w-full flex items-center gap-4 p-4 bg-emerald-50 border-2 border-emerald-500 rounded-xl hover:bg-emerald-100 transition-colors text-left group disabled:opacity-50"
                >
                  <span className="text-3xl">🇮🇳</span>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">India</p>
                    <p className="text-xs text-emerald-600 font-medium">Available now</p>
                  </div>
                  {countryGateLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  ) : (
                    <ArrowRight className="w-5 h-5 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>

                {/* Other Countries — Click to join waitlist (Coming Soon) */}
                {[
                  { code: 'US', flag: '🇺🇸', name: 'United States' },
                  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
                  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
                  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
                  { code: 'AE', flag: '🇦🇪', name: 'United Arab Emirates' },
                  { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
                  { code: 'OTHER', flag: '🌍', name: 'Other Country' },
                ].map((country) => (
                  <button
                    key={country.code}
                    onClick={() => handleCountrySelect(country.code)}
                    disabled={countryGateLoading}
                    className="w-full flex items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 hover:border-amber-300 transition-colors text-left group"
                  >
                    <span className="text-3xl">{country.flag}</span>
                    <div className="flex-1">
                      <p className="font-medium text-slate-700 group-hover:text-slate-900">{country.name}</p>
                      <p className="text-xs text-amber-600 font-medium">Coming soon — join waitlist →</p>
                    </div>
                  </button>
                ))}
              </div>

              {countryGateError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-600">{countryGateError}</p>
                </div>
              )}

              <p className="text-[10px] text-slate-400">
                By continuing, you agree to our{' '}
                <a href="/terms" className="text-emerald-600 hover:underline">Terms of Service</a>
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="animate-fade-in">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-red-100 flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-500" />
                </div>
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 mb-2">
                Authentication failed
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                {errorMessage || 'Something went wrong. Please try again.'}
              </p>
              <button
                onClick={() => safeNavigate(() => navigate('/?modal=login', { replace: true }))}
                className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
              >
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
