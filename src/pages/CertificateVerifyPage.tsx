import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Shield, XCircle, Loader2, Search, User, Calendar, Clock, Copy,
  CheckCheck, AlertTriangle, Share2, Printer, Sparkles, Zap,
  BadgeCheck, ArrowLeft, Star, ExternalLink, QrCode, Camera,
  Award, Hash, Info, RefreshCw, FileText, Sun, Moon,
  ChevronRight, CheckCircle2, Lock,
} from 'lucide-react';
import { type Certificate, type InternProfile } from '../lib/certificateService';
import { verifyCredentialByCode, verifyCredentialByQR } from '../lib/credentialVerification';

// ─── Types ──────────────────────────────────────────────────────────
type VerifyMode = 'idle' | 'verifying' | 'verified' | 'revoked' | 'replaced' | 'invalid' | 'rate_limited';

interface VerificationResult {
  mode: VerifyMode;
  certificate?: Certificate;
  internProfile?: InternProfile | null;
  token?: any;
  error?: string;
  rateLimited?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatMediumDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function detectSystemDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const typeTitle: Record<string, string> = {
  internship: 'Internship Certificate',
  lor: 'Letter of Recommendation',
  platform: 'Platform Certificate',
  skill_test: 'Skill Certification',
  achievement: 'Achievement Badge',
};

// ─── Theme Context ──────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('gl-verify-theme');
    if (saved) return saved === 'dark';
    return detectSystemDark();
  });

  useEffect(() => {
    localStorage.setItem('gl-verify-theme', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return { dark, toggle: () => setDark(d => !d) };
}

// ─── Loading Skeleton ───────────────────────────────────────────────
function VerificationSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      <div className="relative">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-500" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <p className="text-lg font-semibold text-slate-800 dark:text-white animate-pulse">
          Verifying Credential
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Please wait while we verify the authenticity...
        </p>
      </div>
      {/* Skeleton cards */}
      <div className="w-full max-w-lg space-y-3 animate-pulse">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-full w-3/4 mx-auto" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-1/2 mx-auto" />
        <div className="grid grid-cols-2 gap-3 mt-6">
          <div className="h-20 bg-slate-200 dark:bg-slate-700 rounded-xl" />
          <div className="h-20 bg-slate-200 dark:bg-slate-700 rounded-xl" />
          <div className="h-20 bg-slate-200 dark:bg-slate-700 rounded-xl" />
          <div className="h-20 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ─── Verified Success Card ──────────────────────────────────────────
function VerifiedCard({
  cert, internProfile, dark,
}: {
  cert: Certificate; internProfile?: InternProfile | null; dark: boolean;
}) {
  const isLOR = cert.certificate_type === 'lor';
  const meta = (cert.metadata || {}) as Record<string, any>;
  const [copied, setCopied] = useState(false);
  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const details = [
    { label: 'Credential Status', value: 'Verified', icon: <BadgeCheck className="w-4 h-4" />, accent: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Credential Type', value: typeTitle[cert.certificate_type] || 'Certificate', icon: <FileText className="w-4 h-4" /> },
    { label: 'Holder Name', value: cert.recipient_name || '—', icon: <User className="w-4 h-4" /> },
    { label: 'Internship Role', value: cert.skill || '—', icon: <Star className="w-4 h-4" /> },
    ...(meta.department ? [{ label: 'Department', value: meta.department as string, icon: <Zap className="w-4 h-4" /> }] : []),
    ...(cert.skill ? [{ label: 'Skills', value: cert.skill, icon: <Award className="w-4 h-4" /> }] : []),
    { label: 'Internship Duration', value: internProfile?.available_from && internProfile?.available_to
      ? `${formatMediumDate(internProfile.available_from)} — ${formatMediumDate(internProfile.available_to)}`
      : cert.issued_at ? formatDate(cert.issued_at) : '—', icon: <Calendar className="w-4 h-4" /> },
    { label: 'Issue Date', value: formatDate(cert.issued_at || cert.created_at), icon: <Calendar className="w-4 h-4" /> },
    { label: 'Verification Date', value: formatDate(new Date().toISOString()), icon: <Clock className="w-4 h-4" /> },
    { label: 'Certificate Version', value: `v${meta.version || 1}`, icon: <Hash className="w-4 h-4" /> },
    { label: 'Credential ID', value: cert.id?.slice(0, 8) + '...', icon: <Hash className="w-4 h-4" /> },
    { label: 'Verification ID', value: cert.verification_code || '—', icon: <Lock className="w-4 h-4" /> },
    { label: 'QR Version', value: `v${meta.qr_version || 1}`, icon: <QrCode className="w-4 h-4" /> },
    { label: 'Issued By', value: 'Growlancer', icon: <Award className="w-4 h-4" /> },
    { label: 'Founder', value: 'Mohammed Miran Khan', icon: <User className="w-4 h-4" /> },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Verified Badge Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/10">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Credential Successfully Verified
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            This credential has been officially issued and verified by Growlancer.
          </p>
        </div>
      </div>

      {/* Main Details Card */}
      <div className={`
        rounded-2xl overflow-hidden border
        ${dark ? 'bg-slate-900 border-slate-700/50' : 'bg-white border-slate-200'}
        shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]
      `}>
        {/* Card Header */}
        <div className={`
          px-6 py-5 border-b
          ${isLOR
            ? 'bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border-violet-200 dark:border-violet-800/30'
            : 'bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800/30'
          }
        `}>
          <div className="flex items-center gap-4">
            <div className={`
              w-14 h-14 rounded-xl flex items-center justify-center
              ${isLOR ? 'bg-violet-500 text-white' : 'bg-emerald-600 text-white'}
              shadow-lg
            `}>
              {isLOR ? <Star className="w-7 h-7" /> : <Award className="w-7 h-7" />}
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                {typeTitle[cert.certificate_type] || 'Credential'}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {cert.recipient_name}
              </p>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {details.map((item, i) => (
              <div
                key={i}
                className={`
                  flex items-start gap-3 p-3 rounded-xl transition-colors
                  ${dark ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-slate-50 hover:bg-slate-100'}
                `}
              >
                <span className={`mt-0.5 shrink-0 ${item.accent || 'text-slate-400 dark:text-slate-500'}`}>
                  {item.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-500">
                    {item.label}
                  </p>
                  <p className={`text-sm font-semibold truncate ${item.accent || 'text-slate-800 dark:text-slate-200'}`}>
                    {item.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Verification Code Section */}
        <div className={`
          px-6 py-4 border-t
          ${dark ? 'border-slate-700/50 bg-slate-800/30' : 'border-slate-200 bg-slate-50/50'}
        `}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Verification Code
              </span>
            </div>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
            >
              {copied ? (
                <><CheckCheck className="w-3.5 h-3.5" /> Copied!</>
              ) : (
                <><Copy className="w-3.5 h-3.5" /> Copy Link</>
              )}
            </button>
          </div>
          <p className="mt-2 font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400 tracking-wider select-all">
            {cert.verification_code}
          </p>
        </div>
      </div>

      {/* Performance Summary (if LOR) */}
      {isLOR && meta.performance_summary && (
        <div className={`
          rounded-2xl p-6 border
          ${dark ? 'bg-slate-900 border-slate-700/50' : 'bg-white border-slate-200'}
          shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06)]
        `}>
          <h4 className="flex items-center gap-2 text-sm font-bold text-violet-600 dark:text-violet-400 mb-3">
            <Star className="w-4 h-4" /> Outstanding Contributions
          </h4>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {meta.performance_summary as string}
          </p>
        </div>
      )}

      {/* Founder Signature */}
      <div className="text-center">
        <div className={`
          inline-block px-8 py-4 rounded-xl border
          ${dark ? 'bg-slate-900 border-slate-700/50' : 'bg-white border-slate-200'}
          shadow-sm
        `}>
          <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">Mohammed Miran Khan</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Founder & CEO, Growlancer</p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/10">
            <BadgeCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Digital Signature
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-all
            border-slate-300 dark:border-slate-600
            text-slate-700 dark:text-slate-300
            hover:bg-slate-100 dark:hover:bg-slate-800
            active:scale-95"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-all
            border-slate-300 dark:border-slate-600
            text-slate-700 dark:text-slate-300
            hover:bg-slate-100 dark:hover:bg-slate-800
            active:scale-95"
        >
          {copied ? <CheckCheck className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>
    </div>
  );
}

// ─── Revoked Card ───────────────────────────────────────────────────
function RevokedCard({ cert }: { cert: Certificate }) {
  const meta = (cert.metadata || {}) as Record<string, any>;
  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/10">
        <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Credential Revoked</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          This credential is no longer valid.
        </p>
      </div>
      <div className={`
        rounded-2xl p-6 border text-left
        dark:bg-slate-900 dark:border-red-800/30
        bg-white border-red-200
        shadow-[0_4px_16px_-4px_rgba(239,68,68,0.1)]
      `}>
        <div className="space-y-4">
          {cert.revoked_reason && (
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Reason</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{cert.revoked_reason}</p>
            </div>
          )}
          {cert.revoked_at && (
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Revoked Date</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(cert.revoked_at)}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Replacement Available</p>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              {meta.replacement_available ? 'Yes' : 'No'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Replaced Card ──────────────────────────────────────────────────
function ReplacedCard({ onViewLatest }: { onViewLatest: () => void }) {
  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-500/10">
        <RefreshCw className="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Credential Replaced</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          This credential has been replaced by a newer version.
        </p>
      </div>
      <div className={`
        rounded-2xl p-6 border
        dark:bg-slate-900 dark:border-amber-800/30
        bg-white border-amber-200
        shadow-[0_4px_16px_-4px_rgba(245,158,11,0.1)]
      `}>
        <div className="space-y-3">
          <div className="text-left">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              This credential has been replaced by a newer version. Please use the new credential for verification.
            </p>
          </div>
          <button
            onClick={onViewLatest}
            className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
          >
            Verify Again <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invalid/Error Card ─────────────────────────────────────────────
function InvalidCard({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/10">
        <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Credential Not Found</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-sm mx-auto">
          {error || "The entered Verification ID or QR Code could not be verified."}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
      >
        <Search className="w-4 h-4" /> Verify Again
      </button>
    </div>
  );
}

// ─── Rate Limited Card ──────────────────────────────────────────────
function RateLimitedCard() {
  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-500/10">
        <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Too Many Attempts</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-sm mx-auto">
          Please wait a few minutes before trying again. This protects against unauthorized access.
        </p>
      </div>
    </div>
  );
}

// ─── QR Scanner Button (mock for now — opens file picker) ───────────
function QRScannerButton({ onScan }: { onScan: (token: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleScan = () => {
    setScanning(true);
    inputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { setScanning(false); return; }
    // For now, show a prompt to enter the token manually
    // In production, integrate jsQR or a QR scanning library
    const token = prompt('Enter the QR token from the image:');
    if (token) onScan(token.trim());
    setScanning(false);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={handleScan}
        disabled={scanning}
        className="flex items-center gap-2 px-5 py-3 rounded-xl border transition-all font-medium text-sm active:scale-95
          border-emerald-300 dark:border-emerald-700
          text-emerald-700 dark:text-emerald-400
          hover:bg-emerald-50 dark:hover:bg-emerald-900/20
          disabled:opacity-50"
      >
        {scanning ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Camera className="w-5 h-5" />
        )}
        <span className="hidden sm:inline">Scan QR</span>
      </button>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export function CertificateVerifyPage() {
  const { code: urlCode } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlQrToken = searchParams.get('qr');

  const [searchInput, setSearchInput] = useState(urlCode || '');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'qr'>(urlCode ? 'code' : urlQrToken ? 'qr' : 'code');
  const [qrInput, setQrInput] = useState(urlQrToken || '');
  const { dark, toggle: toggleTheme } = useTheme();

  const handleVerifyByCode = useCallback(async (code?: string) => {
    const codeToVerify = (code || searchInput).trim();
    if (!codeToVerify) return;

    setVerifying(true);
    setResult(null);

    try {
      const res = await verifyCredentialByCode(codeToVerify);
      if (res.valid && res.certificate) {
        const cert = res.certificate as unknown as Certificate;
        const meta = (cert.metadata || {}) as Record<string, any>;

        if (cert.status === 'revoked') {
          setResult({ mode: 'revoked', certificate: cert, internProfile: res.internProfile });
        } else if (meta.replaced) {
          setResult({ mode: 'replaced', certificate: cert, internProfile: res.internProfile });
        } else {
          setResult({ mode: 'verified', certificate: cert, internProfile: res.internProfile });
        }
      } else if (res.rateLimited) {
        setResult({ mode: 'rate_limited', error: res.error });
      } else {
        setResult({
          mode: 'invalid',
          error: res.error || 'Credential not found',
        });
      }
    } catch {
      setResult({ mode: 'invalid', error: 'Verification failed. Please try again.' });
    } finally {
      setVerifying(false);
    }
  }, [searchInput]);

  const handleVerifyByQR = useCallback(async (token?: string) => {
    const tokenToVerify = (token || qrInput).trim();
    if (!tokenToVerify) return;

    setVerifying(true);
    setResult(null);

    try {
      const res = await verifyCredentialByQR(tokenToVerify);
      if (res.valid && res.certificate) {
        const cert = res.certificate as unknown as Certificate;
        const meta = (cert.metadata || {}) as Record<string, any>;

        if (cert.status === 'revoked') {
          setResult({ mode: 'revoked', certificate: cert, internProfile: res.internProfile, token: res.token });
        } else if (meta.replaced) {
          setResult({ mode: 'replaced', certificate: cert, internProfile: res.internProfile, token: res.token });
        } else {
          setResult({ mode: 'verified', certificate: cert, internProfile: res.internProfile, token: res.token });
        }
      } else if (res.rateLimited) {
        setResult({ mode: 'rate_limited', error: res.error });
      } else {
        setResult({
          mode: 'invalid',
          error: res.error || 'Invalid QR code',
        });
      }
    } catch {
      setResult({ mode: 'invalid', error: 'QR verification failed. Please try again.' });
    } finally {
      setVerifying(false);
    }
  }, [qrInput]);

  // Auto-verify from URL params
  useEffect(() => {
    if (urlCode) handleVerifyByCode(urlCode);
  }, [urlCode, handleVerifyByCode]);

  useEffect(() => {
    if (urlQrToken) handleVerifyByQR(urlQrToken);
  }, [urlQrToken, handleVerifyByQR]);

  const handleReset = () => {
    setResult(null);
    setVerifying(false);
    navigate('/verify-certificate', { replace: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (activeTab === 'code') handleVerifyByCode();
      else handleVerifyByQR();
    }
  };

  const handleViewLatest = () => {
    handleReset();
  };

  // ══════════════════════════════════════════════════════════════
  // RENDER — Results State
  // ══════════════════════════════════════════════════════════════
  if (verifying) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <HeaderBar dark={dark} onToggleTheme={toggleTheme} onHome={handleReset} />
        <main className="max-w-4xl mx-auto px-4 py-12 md:py-20">
          <VerificationSkeleton />
        </main>
        <FooterBar dark={dark} />
      </div>
    );
  }

  if (result) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <HeaderBar dark={dark} onToggleTheme={toggleTheme} onHome={handleReset} />
        <main className="max-w-4xl mx-auto px-4 py-12 md:py-20">
          {result.mode === 'verified' && result.certificate && (
            <VerifiedCard cert={result.certificate} internProfile={result.internProfile} dark={dark} />
          )}
          {result.mode === 'revoked' && result.certificate && (
            <RevokedCard cert={result.certificate} />
          )}
          {result.mode === 'replaced' && (
            <ReplacedCard onViewLatest={handleViewLatest} />
          )}
          {result.mode === 'invalid' && (
            <InvalidCard error={result.error || 'Credential not found'} onRetry={handleReset} />
          )}
          {result.mode === 'rate_limited' && <RateLimitedCard />}
        </main>
        <FooterBar dark={dark} />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER — Landing/Hub Page
  // ══════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <HeaderBar dark={dark} onToggleTheme={toggleTheme} />

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        {/* Hero Section */}
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="w-7 h-7 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-3">
            Credential Verification Portal
          </h1>
          <p className="text-slate-600 dark:text-slate-400 max-w-lg mx-auto text-sm leading-relaxed">
            Verify the authenticity of Growlancer-issued Internship Certificates and Letters of Recommendation.
          </p>
        </div>

        {/* Search Section */}
        <div className={`
          max-w-2xl mx-auto mb-12 rounded-2xl border p-6 md:p-8
          ${dark
            ? 'bg-slate-900 border-slate-700/50'
            : 'bg-white border-slate-200'
          }
          shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.2)]
        `}>
          {/* Tab Toggle: Code / QR */}
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-6">
            <button
              onClick={() => setActiveTab('code')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'code'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Hash className="w-4 h-4" /> Verification ID
            </button>
            <button
              onClick={() => setActiveTab('qr')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'qr'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <QrCode className="w-4 h-4" /> QR Code
            </button>
          </div>

          {activeTab === 'code' ? (
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter Verification ID (e.g., GRW-CERT-XXXXX)"
                  className={`
                    w-full pl-12 pr-4 py-3 rounded-xl border text-sm font-mono tracking-wider uppercase
                    transition-all
                    ${dark
                      ? 'bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/30'
                      : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20'
                    }
                    focus:outline-none
                  `}
                />
              </div>
              <button
                onClick={() => handleVerifyByCode()}
                disabled={verifying || !searchInput.trim()}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 whitespace-nowrap"
              >
                {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <QrCode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={qrInput}
                  onChange={e => setQrInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter or scan QR token"
                  className={`
                    w-full pl-12 pr-4 py-3 rounded-xl border text-sm font-mono
                    transition-all
                    ${dark
                      ? 'bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/30'
                      : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20'
                    }
                    focus:outline-none
                  `}
                />
              </div>
              <QRScannerButton onScan={(token) => { setQrInput(token); handleVerifyByQR(token); }} />
              <button
                onClick={() => handleVerifyByQR()}
                disabled={verifying || !qrInput.trim()}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 whitespace-nowrap"
              >
                {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
              </button>
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          {[
            {
              icon: <Shield className="w-5 h-5" />,
              color: 'text-emerald-600 dark:text-emerald-400',
              bg: 'bg-emerald-100 dark:bg-emerald-500/10',
              title: 'Real-Time Verification',
              desc: 'Instant credential verification with live data from our secure database.',
            },
            {
              icon: <FileText className="w-5 h-5" />,
              color: 'text-violet-600 dark:text-violet-400',
              bg: 'bg-violet-100 dark:bg-violet-500/10',
              title: 'Certificates & LOR',
              desc: 'Verify internship certificates and letters of recommendation issued by Growlancer.',
            },
            {
              icon: <Lock className="w-5 h-5" />,
              color: 'text-blue-600 dark:text-blue-400',
              bg: 'bg-blue-100 dark:bg-blue-500/10',
              title: 'Tamper-Proof',
              desc: 'Each credential is cryptographically signed and cannot be altered.',
            },
          ].map((card, i) => (
            <div
              key={i}
              className={`
                p-6 rounded-2xl border text-center transition-all duration-200 hover:shadow-lg
                ${dark
                  ? 'bg-slate-900 border-slate-700/50 hover:border-slate-600'
                  : 'bg-white border-slate-200 hover:border-slate-300'
                }
              `}
            >
              <div className={`mx-auto w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center mb-4`}>
                <span className={card.color}>{card.icon}</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">{card.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>

        {/* Trust Badge Row */}
        <div className="text-center">
          <div className={`
            inline-flex items-center gap-6 px-8 py-4 rounded-2xl border
            ${dark
              ? 'bg-slate-900 border-slate-700/50'
              : 'bg-white border-slate-200'
            }
            shadow-sm
          `}>
            {[
              { icon: <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />, label: 'Digitally Verified' },
              { icon: <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />, label: 'Real-Time' },
              { icon: <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />, label: 'Tamper-Proof' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                {item.icon}
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  {item.label}
                </span>
                {i < 2 && <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 ml-2" />}
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 max-w-2xl mx-auto">
          <div className={`
            p-4 rounded-xl border
            ${dark
              ? 'bg-amber-500/5 border-amber-500/10'
              : 'bg-amber-50 border-amber-200'
            }
          `}>
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-1">
                  Important Notice
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  This credential verification page is hosted on the Growlancer platform. In the event of a domain change, 
                  platform migration, or service discontinuation, this verification service and its associated records may 
                  be removed or relocated. We recommend keeping a PDF copy of your credential for your records.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <FooterBar dark={dark} />
    </div>
  );
}

// ─── Header Bar ─────────────────────────────────────────────────────
function HeaderBar({
  dark, onToggleTheme, onHome,
}: {
  dark: boolean; onToggleTheme: () => void; onHome?: () => void;
}) {
  return (
    <header className={`
      sticky top-0 z-40 border-b backdrop-blur-md
      ${dark
        ? 'bg-slate-950/80 border-slate-800/50'
        : 'bg-white/80 border-slate-200'
      }
    `}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onHome || (() => window.history.pushState({}, '', '/verify-certificate'))}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-9 w-9 rounded-xl" />
            <div className="hidden sm:block">
              <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">Growlancer</p>
              <p className="text-[9px] uppercase tracking-widest font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                Verification Portal
              </p>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleTheme}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border
              ${dark
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              }
            `}
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
          </button>
          <a
            href={onHome ? undefined : '/'}
            onClick={onHome ? (e) => { e.preventDefault(); onHome(); } : undefined}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {onHome ? '← New Search' : '← Home'}
          </a>
        </div>
      </div>
    </header>
  );
}

// ─── Footer Bar ─────────────────────────────────────────────────────
function FooterBar({ dark }: { dark: boolean }) {
  return (
    <footer className={`
      border-t py-8 px-4
      ${dark ? 'border-slate-800/50 bg-slate-950' : 'border-slate-200 bg-slate-50'}
    `}>
      <div className="max-w-4xl mx-auto text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <img src="/UpdatedLogo.webp" alt="" className="h-6 w-6 rounded-lg opacity-60" />
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">Growlancer</span>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} Growlancer. All rights reserved.
        </p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <a href="/terms" className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Terms</a>
          <a href="/privacy" className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Privacy</a>
          <a href="/contact" className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  );
}
