import { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, Mail, Loader2, ShieldCheck, AlertCircle, X, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

import { isReauthValid, markReauthVerified, getReauthRemainingMs, OTP_ATTEMPT_LIMIT, OTP_RESEND_COOLDOWN_S } from '../lib/reauth';

type Mode = 'password' | 'otp';
type Phase = 'form' | 'verifying' | 'success' | 'error';

interface ReauthDialogProps {
  open: boolean;
  onClose: () => void;
  onVerified: () => void | Promise<void>;
  title?: string;
  description?: string;
}

export function ReauthDialog({
  open,
  onClose,
  onVerified,
  title = 'Confirm your identity',
  description = 'For your security, please verify your identity to continue.',
}: ReauthDialogProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const busyRef = useRef(false);

  // Reset state each time the dialog opens
  useEffect(() => {
    if (open) {
      setMode('password');
      setPassword('');
      setOtp('');
      setOtpSent(false);
      setPhase('form');
      setError(null);
      setAttempts(0);
      setCooldown(0);
    }
  }, [open]);

  // OTP resend cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown, open]);

  const verifyPassword = useCallback(async () => {
    if (!user?.email || !password) {
      setError('Please enter your current password.');
      return;
    }
    setPhase('verifying');
    setError(null);
    try {
      // Real verification: attempt a password sign-in with the user's own
      // credentials. On success, supabase-js replaces the session with a
      // fresh one for the SAME user — identity is proven, session is refreshed.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (signInError) {
        const left = OTP_ATTEMPT_LIMIT - attempts - 1;
        setError(
          left > 0
            ? `Incorrect password. ${left} attempt${left === 1 ? '' : 's'} remaining.`
            : 'Too many incorrect attempts. Try again later or use an OTP instead.'
        );
        setAttempts(a => a + 1);
        if (left <= 0) setPhase('error');
        else setPhase('form');
        return;
      }
      markReauthVerified();
      setPhase('success');
      await onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
      setPhase('form');
    }
  }, [user?.email, password, attempts, onVerified]);

  const sendOtp = useCallback(async () => {
    if (!user?.email) return;
    setSendingOtp(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: user.email,
        options: { shouldCreateUser: false },
      });
      if (error) {
        setError(error.message.includes('rate limit')
          ? 'Too many OTPs were sent recently. Please wait a few minutes.'
          : error.message);
        return;
      }
      setOtpSent(true);
      setCooldown(OTP_RESEND_COOLDOWN_S);
      setAttempts(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally {
      setSendingOtp(false);
    }
  }, [user?.email]);

  const verifyOtp = useCallback(async () => {
    if (!user?.email || otp.trim().length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setPhase('verifying');
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: user.email,
        token: otp.trim(),
        type: 'email',
      });
      if (verifyError) {
        const left = OTP_ATTEMPT_LIMIT - attempts - 1;
        setError(
          left > 0
            ? `Invalid code. ${left} attempt${left === 1 ? '' : 's'} remaining.`
            : 'Too many incorrect attempts. Please request a new code later.'
        );
        setAttempts(a => a + 1);
        setPhase(left <= 0 ? 'error' : 'form');
        return;
      }
      markReauthVerified();
      setPhase('success');
      await onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
      setPhase('form');
    }
  }, [user?.email, otp, attempts, onVerified]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 p-4 animate-fade-in">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex justify-center mb-2.5">
          <div className="h-14 w-14 rounded-xl bg-emerald-100 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-emerald-600" />
          </div>
        </div>

        <h2 className="text-center font-display text-xl font-bold text-slate-900 mb-1.5">{title}</h2>
        <p className="text-center text-sm text-slate-500 mb-3">{description}</p>

        {error && (
          <div className="mb-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Mode switcher */}
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          <button
            type="button"
            onClick={() => { setMode('password'); setError(null); }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === 'password'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Lock className="w-4 h-4" /> Password
          </button>
          <button
            type="button"
            onClick={() => { setMode('otp'); setError(null); }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              mode === 'otp'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <KeyRound className="w-4 h-4" /> OTP
          </button>
        </div>

        {phase === 'success' ? (
          <div className="text-center py-6">
            <div className="flex justify-center mb-3">
              <div className="h-14 w-14 rounded-xl bg-emerald-100 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-emerald-600" />
              </div>
            </div>
            <p className="text-sm text-slate-600">Identity verified. Continuing securely...</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (busyRef.current) return;
              busyRef.current = true;
              (mode === 'password' ? verifyPassword() : verifyOtp()).finally(() => {
                busyRef.current = false;
              });
            }}
            className="space-y-2"
          >
            {mode === 'password' ? (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1">
                  Current Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-slate-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full h-11 pl-10 pr-10 bg-white border border-slate-200 rounded-xl outline-none transition-all text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {!otpSent ? (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={sendOtp}
                      disabled={sendingOtp}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-emerald-300 text-emerald-600 text-sm font-semibold hover:bg-emerald-50 transition-all disabled:opacity-50"
                    >
                      {sendingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      {sendingOtp ? 'Sending...' : `Send code to ${user?.email}`}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-1">
                        6-Digit Code
                      </label>
                      <input
                        type="text"
                        value={otp}
                        onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        className="w-full h-12 px-4 text-center text-lg font-mono tracking-[0.4em] bg-white border border-slate-200 rounded-xl outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Code sent to {user?.email}</span>
                      <button
                        type="button"
                        onClick={sendOtp}
                        disabled={sendingOtp || cooldown > 0}
                        className="font-semibold text-emerald-600 hover:text-emerald-700 disabled:text-slate-400"
                      >
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={phase === 'verifying' || (mode === 'otp' && !otpSent)}
              className="w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {phase === 'verifying' ? (
                <>
                  <span>Verifying...</span>
                  <Loader2 className="w-4 h-4 animate-spin" />
                </>
              ) : (
                'Verify Identity'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Convenience hook: wraps ReauthDialog state + validity check. */
export function useReauthDialog() {
  const [open, setOpen] = useState(false);
  return {
    isOpen: open,
    open: () => setOpen(true),
    close: () => setOpen(false),
    valid: isReauthValid(),
    remainingMs: getReauthRemainingMs(),
  };
}
