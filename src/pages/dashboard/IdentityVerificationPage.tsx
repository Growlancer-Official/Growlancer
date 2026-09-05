import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  identityVerificationService,
  KYC_MAX_ATTEMPTS,
  getRemainingKycAttempts,
  isKycBlocked,
  formatKycCooldown,
  getKycBlockedMsLeft,
  getKycFriendlyError,
  type IdentityVerification,
} from '../../lib/identityVerification';
import {
  clientBusinessService,
  validateOptionalBusinessPan,
  normalizeBusinessPan,
  validateOptionalUdyam,
  normalizeUdyam,
} from '../../lib/clientBusiness';
import { validateOptionalGstin, normalizeGstin } from '../../lib/gst';
import { supabase } from '../../lib/supabase';
import { PageSkeleton } from '../../components/PageSkeleton';
import { InfoTip } from '../../components/InfoTip';
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MailCheck,
  MailWarning,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

type PageStatus = 'loading' | 'idle';

/**
 * Two-step verification, shared by freelancers and clients:
 *
 *   Step 1 — Email verification (real-time; real auth flag, never client-set)
 *   Step 2 — Identity:
 *              freelancers → PAN Card (automated, real-time via kyc-submit)
 *              clients     → optional: PAN identity AND/OR business details
 *                            (GST / Udyam / Business PAN — self-attested)
 *
 * The PAN decision always happens server-side (kyc-submit edge function) and
 * the resulting flip arrives over Supabase Realtime — no refresh needed.
 */
export function IdentityVerificationPage() {
  const { user, supabaseUser } = useAuth();
  const [searchParams] = useSearchParams();
  const isClient = user?.role === 'client';
  const postVerifyRedirect = searchParams.get('redirect') || (isClient ? '/client' : '/dashboard');
  const email = supabaseUser?.email || user?.email || '';

  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [verificationStatus, setVerificationStatus] = useState<'none' | 'pending' | 'verified' | 'rejected' | 'blocked' | 'review'>('none');
  const [verification, setVerification] = useState<IdentityVerification | null>(null);
  const [blockedMsLeft, setBlockedMsLeft] = useState(0);
  const [blockedDisplayMs, setBlockedDisplayMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Step 1: email (real auth flag — never client-set) ──────────────────
  const [emailConfirmed, setEmailConfirmed] = useState<boolean>(!!supabaseUser?.email_confirmed_at);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // ── Step 2: PAN (freelancers mandatory, clients optional) ──────────────
  const [showPanForm, setShowPanForm] = useState(false);
  const [pan, setPan] = useState('');
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Clients: optional business details (self-attested) ─────────────────
  const [bizLoaded, setBizLoaded] = useState(false);
  const [biz, setBiz] = useState({ company_name: '', gst_number: '', udyam_number: '', business_pan: '' });
  const [bizSaving, setBizSaving] = useState(false);
  const [bizSavedMsg, setBizSavedMsg] = useState<string | null>(null);
  const [bizError, setBizError] = useState<string | null>(null);

  // ── Keep the cooldown countdown in sync ────────────────────────────────
  useEffect(() => {
    setBlockedDisplayMs(blockedMsLeft);
  }, [blockedMsLeft]);

  const refreshEmailState = useCallback(async () => {
    try {
      const { data: { user: fresh } } = await supabase.auth.getUser();
      if (fresh) setEmailConfirmed(!!fresh.email_confirmed_at);
    } catch {
      // Auth hiccup — keep current state; the manual "check" button retries.
    }
  }, []);

  // Step 1 in real time: confirmation opens in another tab → cross-tab auth
  // sync fires TOKEN_REFRESHED; a window focus also re-validates. Either way
  // the step flips to "verified" without a manual reload.
  useEffect(() => {
    setEmailConfirmed(!!supabaseUser?.email_confirmed_at);
  }, [supabaseUser]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      refreshEmailState();
    });
    const onFocus = () => { refreshEmailState(); };
    window.addEventListener('focus', onFocus);
    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshEmailState]);

  const fetchStatus = useCallback(async () => {
    if (!user) return;
    try {
      const result = await identityVerificationService.getStatus(user.id);
      setVerification(result.verification);
      setVerificationStatus(result.status);
      if (result.status === 'blocked' && result.verification) {
        setBlockedMsLeft(getKycBlockedMsLeft(result.verification));
      }
    } catch {
      setError('Failed to load verification status. Please refresh the page.');
    } finally {
      setPageStatus('idle');
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Tick the cooldown once per second; auto-refresh when it expires.
  useEffect(() => {
    if (verificationStatus !== 'blocked' || blockedDisplayMs <= 0) return;
    const t = setInterval(() => {
      const left = Math.max(0, blockedDisplayMs - 1000);
      setBlockedDisplayMs(left);
      if (left <= 0) {
        clearInterval(t);
        fetchStatus();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [verificationStatus, blockedDisplayMs, fetchStatus]);

  // Realtime subscription — the kyc-submit engine's decision lands here live.
  const emailedVerifiedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    const channel = identityVerificationService.subscribe(user.id, (updated) => {
      const isBlocked = isKycBlocked(updated);
      setVerification(updated);
      setVerificationStatus(isBlocked ? 'blocked' : (updated.status as 'pending' | 'verified' | 'rejected' | 'review'));
      if (isBlocked) setBlockedMsLeft(getKycBlockedMsLeft(updated));
      if (updated.status === 'verified' && updated.id && !emailedVerifiedIds.current.has(updated.id)) {
        emailedVerifiedIds.current.add(updated.id);
        supabase.functions
          .invoke('email-notifications', {
            method: 'POST',
            body: {
              type: 'verification_approved',
              data: { recipient_email: email, recipient_name: user.name || email?.split('@')[0] || 'User' },
            },
          })
          .catch((err) => console.error('[KYC] approval email failed:', err));
      }
    });
    return () => { channel.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Clients: load saved business details once.
  useEffect(() => {
    if (!isClient || !user || bizLoaded) return;
    (async () => {
      const info = await clientBusinessService.get(user.id);
      if (info) {
        setBiz({
          company_name: info.company_name || '',
          gst_number: info.gst_number || '',
          udyam_number: info.udyam_number || '',
          business_pan: info.business_pan || '',
        });
      }
      setBizLoaded(true);
    })();
  }, [isClient, user, bizLoaded]);

  // ── Step 1 actions ─────────────────────────────────────────────────────
  const handleSendEmail = async () => {
    if (!email) return;
    setSendingEmail(true);
    setEmailSent(false);
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
    setSendingEmail(false);
    if (resendError) {
      setError('Could not send the verification link. Please try again shortly.');
    } else {
      setEmailSent(true);
      setError(null);
    }
  };

  const handleCheckEmail = async () => {
    setCheckingEmail(true);
    await refreshEmailState();
    await supabase.auth.refreshSession().catch(() => {});
    setCheckingEmail(false);
  };

  // ── Step 2 actions ─────────────────────────────────────────────────────
  const handlePanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!consentAgreed) {
      setError('Please agree to the consent terms before submitting.');
      return;
    }
    const cleanPan = pan.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanPan)) {
      setError('That PAN number does not look valid. Please check it and try again.');
      return;
    }
    if (!fullName.trim()) {
      setError('Please enter your full name as printed on your PAN card.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await identityVerificationService.submit(user.id, {
        document_type: 'pan',
        document_number: cleanPan,
        full_name: fullName.trim(),
        date_of_birth: dob || undefined,
        document_file: undefined,
        document_url: '',
        document_file_back: undefined,
        document_url_back: '',
      });
      if (!result.success || !result.verification) {
        setError(result.error || 'Failed to submit verification. Please try again.');
        return;
      }
      setVerification(result.verification);
      setVerificationStatus('pending');
      setShowPanForm(false);
      // Automated engine: provider call + decision run server-side; the
      // result arrives via the realtime subscription below.
      const processResult = await identityVerificationService.process(result.verification.id);
      if (!processResult.success) {
        setError(processResult.error || 'Verification is temporarily unavailable. Please try again shortly.');
      }
      await fetchStatus();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBusinessSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBizSaving(true);
    setBizError(null);
    setBizSavedMsg(null);
    const result = await clientBusinessService.save(user.id, {
      company_name: biz.company_name,
      gst_number: biz.gst_number,
      udyam_number: biz.udyam_number,
      business_pan: biz.business_pan,
    });
    setBizSaving(false);
    if (!result.success) {
      setBizError(result.error || 'Could not save business details. Please try again.');
    } else {
      setBizSavedMsg('Business details saved. They are shown as self-attested — not a verified badge.');
    }
  };

  const emailVerified = emailConfirmed;
  const kycVerified = verificationStatus === 'verified';
  const attemptsLeft = getRemainingKycAttempts(verification);
  const blockExpired = !!verification?.blocked_until && !isKycBlocked(verification);
  const canResubmit = attemptsLeft > 0 || blockExpired;

  if (pageStatus === 'loading') return <PageSkeleton />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2 flex-wrap">
              Identity Verification
              <InfoTip
                title="Two quick steps"
                text={`Step 1 — verify your email (one click in the email we send). Step 2 — ${
                  isClient
                    ? 'optionally verify your PAN for the Verified badge, or add your business details (GST / Udyam / Business PAN) to build trust with freelancers.'
                    : 'verify your PAN card — it is checked automatically in real time against official records and unlocks your Verified badge.'
                } No document uploads needed.`}
              />
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {isClient
                ? 'Verify your identity to build trust with freelancers. Everything is optional for clients — only add what you want.'
                : 'Unlock your Verified badge, higher limits and priority matching.'}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {/* ── Step indicator ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <StepDot index={1} label="Email verification" done={emailVerified} active={!emailVerified} />
          <div className={`flex-1 h-0.5 rounded ${emailVerified ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          <StepDot
            index={2}
            label={isClient ? 'Identity & business (optional)' : 'PAN card verification'}
            done={kycVerified}
            active={emailVerified && !kycVerified}
          />
        </div>
      </div>

      {/* ── Step 1: Email ──────────────────────────────────────────────── */}
      <div className={`bg-white rounded-xl border p-4 shadow-sm ${emailVerified ? 'border-emerald-100' : 'border-slate-100'}`}>
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${emailVerified ? 'bg-emerald-100' : 'bg-amber-100'}`}>
            {emailVerified ? <MailCheck className="w-5 h-5 text-emerald-600" /> : <MailWarning className="w-5 h-5 text-amber-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-slate-900">Step 1 — Email verification</h2>
              {emailVerified ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  <Clock className="w-3.5 h-3.5" /> Pending
                </span>
              )}
            </div>
            {emailVerified ? (
              <p className="text-sm text-slate-500 mt-1">
                Your email <span className="font-medium text-slate-700">{email}</span> is confirmed. Step 2 is unlocked below.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-500 mt-1">
                  We sent a confirmation link to <span className="font-medium text-slate-700">{email || 'your email'}</span>. Click it
                  to activate your account — your status flips here automatically, no refresh needed.
                </p>
                {emailSent && (
                  <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" /> Link sent! Check your inbox (and spam) — then hit "I've verified".
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button
                    onClick={handleSendEmail}
                    disabled={sendingEmail || !email}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-sm font-semibold transition-colors"
                  >
                    {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {sendingEmail ? 'Sending...' : 'Send verification link'}
                  </button>
                  <button
                    onClick={handleCheckEmail}
                    disabled={checkingEmail}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${checkingEmail ? 'animate-spin' : ''}`} />
                    {checkingEmail ? 'Checking...' : "I've verified — check now"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Step 2 ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${kycVerified ? 'bg-emerald-100' : emailVerified ? 'bg-blue-100' : 'bg-slate-100'}`}>
            <ShieldCheck className={`w-5 h-5 ${kycVerified ? 'text-emerald-600' : emailVerified ? 'text-blue-600' : 'text-slate-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-900">
              Step 2 — {isClient ? 'Identity & business details (optional)' : 'PAN card verification'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {isClient
                ? 'Freelancers trust verified clients. Add your PAN for the Verified badge, add business details, or both — entirely optional.'
                : 'PAN is verified automatically against official records — usually within seconds, and your badge appears here instantly.'}
            </p>
          </div>
        </div>

        {!emailVerified && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">Complete Step 1 (email verification) first — identity verification unlocks right after.</p>
          </div>
        )}

        {/* Verified — all good */}
        {kycVerified && (
          <div className="text-center py-4">
            <div className="p-3 bg-emerald-100 rounded-2xl w-fit mx-auto mb-3">
              <BadgeCheck className="w-10 h-10 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-1">Identity Verified</h3>
            <p className="text-slate-500 text-sm mb-2">
              {verification?.verified_at
                ? `Verified on ${new Date(verification.verified_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
                : 'Your identity has been verified successfully.'}
            </p>
            <p className="text-xs text-slate-400 mb-4">You can now use the full platform — payments, projects, matches and more are unlocked.</p>
            <Link
              to={postVerifyRedirect}
              className="inline-flex items-center justify-center gap-2 h-11 px-6 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all"
            >
              Continue to Dashboard
            </Link>
          </div>
        )}

        {/* In-progress / decided-but-not-verified states */}
        {!kycVerified && emailVerified && (
          <>
            {verificationStatus === 'pending' && (
              <div className="text-center py-4">
                <div className="p-3 bg-amber-100 rounded-2xl w-fit mx-auto mb-3">
                  <Clock className="w-8 h-8 text-amber-600 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Verification In Progress</h3>
                <p className="text-slate-500 text-sm mb-3">
                  Your details are being <span className="font-semibold text-slate-700">verified automatically right now</span>. This
                  usually completes <span className="font-semibold text-amber-700">within seconds</span> — your status updates here in
                  real time, no refresh needed.
                </p>
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                  Checking official records…
                </div>
              </div>
            )}

            {verificationStatus === 'review' && (
              <div className="text-center py-4">
                <div className="p-3 bg-amber-100 rounded-2xl w-fit mx-auto mb-3">
                  <Clock className="w-8 h-8 text-amber-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Verification in Review</h3>
                <p className="text-slate-500 text-sm mb-2">
                  Your submission needs a quick check on our side. You will be notified here and by email as soon as it is complete — no
                  action is needed from you right now.
                </p>
              </div>
            )}

            {verificationStatus === 'rejected' && (
              <div className="space-y-3">
                <div className="text-center pt-2">
                  <div className="p-3 bg-red-100 rounded-2xl w-fit mx-auto mb-3">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-1">Verification Unsuccessful</h3>
                  <p className="text-sm text-red-600 font-medium">
                    {verification?.rejection_reason || getKycFriendlyError(verification?.failure_category as string | null)}
                  </p>
                  {attemptsLeft > 0 && !blockExpired && (
                    <p className="text-xs text-slate-400 mt-2">
                      {attemptsLeft} of {KYC_MAX_ATTEMPTS} attempts remaining
                    </p>
                  )}
                </div>
                {canResubmit ? (
                  <button
                    onClick={() => { setShowPanForm((s) => !s); setError(null); }}
                    className="w-full inline-flex items-center justify-center gap-2 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors"
                  >
                    {showPanForm ? 'Hide form' : blockExpired ? 'Submit new verification' : `Resubmit verification (${attemptsLeft} left)`}
                  </button>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <p className="text-sm font-medium text-amber-800">
                      No attempts remaining. You can try again after the cooldown period.
                    </p>
                  </div>
                )}
              </div>
            )}

            {verificationStatus === 'blocked' && (
              <div className="text-center py-2">
                <div className="p-3 bg-red-100 rounded-2xl w-fit mx-auto mb-3">
                  <Clock className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Verification Temporarily Blocked</h3>
                <p className="text-slate-500 text-sm mb-3">
                  You have used all {KYC_MAX_ATTEMPTS} verification attempts. To protect your account you can try again after the cooldown.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-3 max-w-sm mx-auto">
                  <p className="text-sm font-medium text-amber-800 mb-1">Cooldown remaining</p>
                  <p className="text-2xl font-bold text-amber-900 font-mono">{formatKycCooldown(blockedDisplayMs)}</p>
                </div>
              </div>
            )}

            {/* Fresh start / resubmit options */}
            {(verificationStatus === 'none' || (verificationStatus === 'rejected' && canResubmit)) && (
              <div className="space-y-4">
                {/* ── Identity (PAN) option ── */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setShowPanForm((s) => !s); setError(null); }}
                    className="w-full flex items-center justify-between px-4 py-3.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <span className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-emerald-600" />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">
                          {isClient ? 'Verify with PAN (optional — gets the Verified badge)' : 'Verify my PAN'}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {isClient
                            ? 'Personal PAN verification for the Verified badge.'
                            : 'Required to unlock your Verified badge. Checked automatically in real time.'}
                        </span>
                      </span>
                    </span>
                    <span className={`text-emerald-600 font-bold text-lg transition-transform ${showPanForm ? 'rotate-180' : ''}`}>▾</span>
                  </button>

                  {showPanForm && (
                    <form onSubmit={handlePanSubmit} className="p-4 space-y-3 border-t border-slate-100">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            PAN number <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={10}
                            value={pan}
                            onChange={(e) => setPan(e.target.value.toUpperCase())}
                            placeholder="ABCDE1234F"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all uppercase"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Full name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="As printed on PAN card"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of birth (optional)</label>
                        <input
                          type="date"
                          value={dob}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setDob(e.target.value)}
                          className="w-full sm:w-64 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                        />
                      </div>

                      <label className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={consentAgreed}
                          onChange={(e) => {
                            setConsentAgreed(e.target.checked);
                            if (e.target.checked) setError(null);
                          }}
                          className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                        />
                        <span className="text-xs text-slate-600 leading-relaxed">
                          <span className="font-semibold text-slate-800">I agree</span> to share my PAN and name with Growlancer for
                          verification purposes only. Verification may be processed automatically (including automated platform checks
                          during Growlancer's development phase). My data is stored securely, never shared with third parties without my
                          consent, and I may withdraw consent or delete my data at any time. Read the{' '}
                          <Link to="/privacy" className="text-emerald-600 hover:underline font-medium">Privacy Policy</Link> and{' '}
                          <Link to="/terms" className="text-emerald-600 hover:underline font-medium">Terms</Link>.
                        </span>
                      </label>

                      <button
                        type="submit"
                        disabled={submitting || !consentAgreed}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                      >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        {submitting ? 'Verifying…' : 'Verify PAN now'}
                      </button>
                      <p className="text-xs text-slate-400">No document upload needed — the number is checked securely on our servers.</p>
                    </form>
                  )}
                </div>

                {/* ── Clients: optional business details ──────────────── */}
                {isClient && (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3.5 bg-slate-50">
                      <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Business details (optional)</p>
                        <p className="text-xs text-slate-500">
                          Company name, GSTIN, Udyam or business PAN — shown as self-attested, helps freelancers trust you.
                        </p>
                      </div>
                    </div>

                    {bizLoaded ? (
                      <form onSubmit={handleBusinessSave} className="p-4 space-y-3 border-t border-slate-100">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Company / business name</label>
                            <input
                              type="text"
                              value={biz.company_name}
                              onChange={(e) => { setBiz((b) => ({ ...b, company_name: e.target.value })); setBizSavedMsg(null); }}
                              placeholder="e.g., Acme Studios Pvt. Ltd."
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">GSTIN</label>
                            <input
                              type="text"
                              value={biz.gst_number}
                              onChange={(e) => {
                                const v = normalizeGstin(e.target.value);
                                const check = validateOptionalGstin(v);
                                setBiz((b) => ({ ...b, gst_number: e.target.value }));
                                setBizError(check.valid ? null : check.error || null);
                                setBizSavedMsg(null);
                              }}
                              placeholder="22AAAAA0000A1Z5"
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all uppercase"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Udyam registration number</label>
                            <input
                              type="text"
                              value={biz.udyam_number}
                              onChange={(e) => {
                                const v = normalizeUdyam(e.target.value);
                                const check = validateOptionalUdyam(v);
                                setBiz((b) => ({ ...b, udyam_number: e.target.value }));
                                setBizError(check.valid ? null : check.error || null);
                                setBizSavedMsg(null);
                              }}
                              placeholder="UDYAM-XX-00-0000000"
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Business PAN</label>
                            <input
                              type="text"
                              value={biz.business_pan}
                              onChange={(e) => {
                                const v = normalizeBusinessPan(e.target.value);
                                const check = validateOptionalBusinessPan(v);
                                setBiz((b) => ({ ...b, business_pan: e.target.value }));
                                setBizError(check.valid ? null : check.error || null);
                                setBizSavedMsg(null);
                              }}
                              placeholder="ABCDE1234F"
                              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all uppercase"
                            />
                          </div>
                        </div>

                        {bizError && (
                          <p className="text-sm text-red-600 flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 shrink-0" /> {bizError}
                          </p>
                        )}
                        {bizSavedMsg && (
                          <p className="text-sm text-emerald-600 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 shrink-0" /> {bizSavedMsg}
                          </p>
                        )}

                        <button
                          type="submit"
                          disabled={bizSaving || !!bizError}
                          className="inline-flex items-center justify-center gap-2 h-10 px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                        >
                          {bizSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {bizSaving ? 'Saving…' : 'Save business details'}
                        </button>
                        <p className="text-xs text-slate-400">
                          Self-attested — these details are not auto-verified against a government database today. Never share someone
                          else's PAN or GSTIN; doing so violates our Terms.
                        </p>
                      </form>
                    ) : (
                      <div className="p-4 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Small circular step indicator used in the header stepper. */
function StepDot({ index, label, done, active }: { index: number; label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm font-bold shrink-0 transition-colors ${
          done
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : active
              ? 'border-emerald-500 text-emerald-600 bg-emerald-50'
              : 'border-slate-200 text-slate-400 bg-white'
        }`}
      >
        {done ? <CheckCircle2 className="w-4 h-4" /> : index}
      </span>
      <span className={`text-xs sm:text-sm font-medium leading-tight ${done ? 'text-emerald-700' : active ? 'text-slate-900' : 'text-slate-400'}`}>
        {label}
      </span>
    </div>
  );
}
