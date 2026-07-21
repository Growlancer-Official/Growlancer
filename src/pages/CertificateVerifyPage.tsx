import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Shield, XCircle, Loader2, Search, User, Calendar, Clock, Copy,
  CheckCheck, AlertTriangle, Share2, Printer, Zap,
  BadgeCheck, Star, QrCode,
  Award, Hash, Info, RefreshCw, FileText, Sun, Moon,
  ChevronRight, CheckCircle2, Lock, Globe, Scan,
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

// ─── Animated Checkmark ─────────────────────────────────────────────
function AnimatedCheckmark({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <svg className="w-full h-full animate-in zoom-in duration-500" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="6"
          className="text-emerald-500 animate-in zoom-in duration-700"
          strokeDasharray="283" strokeDashoffset="0" />
        <path d="M30 50 L45 65 L70 38" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
          className="text-emerald-500 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300"
          fill="none" />
      </svg>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────────
function VerificationSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-8">
      {/* Animated Spinner */}
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Shield className="w-6 h-6 text-emerald-500 animate-pulse" />
        </div>
      </div>
      <div className="text-center space-y-3">
        <p className="text-xl font-bold text-slate-900 dark:text-white">
          Verifying Credential
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
          Please wait while we verify the authenticity of this credential against our secure database...
        </p>
      </div>
      {/* Skeleton */}
      <div className="w-full max-w-lg space-y-4 animate-pulse">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-full w-3/4 mx-auto" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-1/2 mx-auto" />
        <div className="grid grid-cols-2 gap-4 mt-8">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-200 dark:bg-slate-700 rounded-xl" />
          ))}
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

  const qrVerifyUrl = `${window.location.origin}/verify-certificate/${cert.verification_code}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrVerifyUrl)}&bgcolor=ffffff&color=059669`;

  const details = [
    { label: 'Credential Status', value: 'Verified ✓', icon: BadgeCheck, accent: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Credential Type', value: typeTitle[cert.certificate_type] || 'Certificate', icon: FileText },
    { label: 'Holder Name', value: cert.recipient_name || '—', icon: User },
    { label: 'Internship Role', value: cert.skill || '—', icon: Star },
    ...(meta.department ? [{ label: 'Department', value: meta.department as string, icon: Zap }] : []),
    ...(cert.skill ? [{ label: 'Skills', value: cert.skill, icon: Award }] : []),
    { label: 'Duration', value: internProfile?.available_from && internProfile?.available_to
      ? `${formatMediumDate(internProfile.available_from)} — ${formatMediumDate(internProfile.available_to)}`
      : cert.issued_at ? formatDate(cert.issued_at) : '—', icon: Calendar },
    { label: 'Issue Date', value: formatDate(cert.issued_at || cert.created_at), icon: Calendar },
    { label: 'Verification Date', value: formatDate(new Date().toISOString()), icon: Clock },
    { label: 'Version', value: `v${meta.version || 1}`, icon: Hash },
    { label: 'Credential ID', value: cert.id?.slice(0, 8) + '...', icon: Hash },
    { label: 'Verification ID', value: cert.verification_code || '—', icon: Lock },
    { label: 'QR Version', value: `v${meta.qr_version || 1}`, icon: QrCode },
    { label: 'Issued By', value: 'Growlancer', icon: Award },
    { label: 'Founder', value: 'Mohammed Miran Khan', icon: User },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8">
      {/* Verified Badge Header - Centered */}
      <div className="text-center space-y-4 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-500/10 ring-4 ring-emerald-500/20">
          <AnimatedCheckmark className="w-12 h-12" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
            Credential Successfully Verified
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            This credential has been officially issued and verified by Growlancer. The information below confirms its authenticity.
          </p>
        </div>
      </div>

      {/* QR Code + Quick Info Row */}
      <div className="flex flex-col sm:flex-row gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
        {/* QR Code */}
        <div className={`
          shrink-0 p-4 rounded-2xl border flex flex-col items-center
          ${dark ? 'bg-slate-900 border-slate-700/50' : 'bg-white border-slate-200'}
          shadow-lg
        `}>
          <img src={qrCodeUrl} alt="QR" className="w-28 h-28 rounded-xl bg-white" />
          <p className="text-[9px] text-slate-400 mt-2 font-mono">#{cert.verification_code?.slice(-6)}</p>
        </div>
        {/* Quick Info */}
        <div className={`
          flex-1 p-5 rounded-2xl border
          ${dark ? 'bg-slate-900 border-slate-700/50' : 'bg-white border-slate-200'}
          shadow-lg
        `}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2.5 rounded-xl ${isLOR ? 'bg-violet-500' : 'bg-emerald-600'} text-white shadow-lg`}>
              {isLOR ? <Star className="w-5 h-5" /> : <Award className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {typeTitle[cert.certificate_type] || 'Credential'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{cert.recipient_name}</p>
            </div>
          </div>
          <div className={`
            p-3 rounded-xl border
            ${dark ? 'bg-slate-800/50 border-slate-700/30' : 'bg-slate-50 border-slate-100'}
          `}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Status</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Verified
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-slate-500 dark:text-slate-400">Recipient</span>
              <span className="font-semibold text-slate-900 dark:text-white">{cert.recipient_name}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-slate-500 dark:text-slate-400">Role</span>
              <span className="font-semibold text-slate-900 dark:text-white">{cert.skill || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className={`
        rounded-2xl border overflow-hidden
        ${dark ? 'bg-slate-900 border-slate-700/50' : 'bg-white border-slate-200'}
        shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]
        animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200
      `}>
        <div className={`
          px-6 py-4 border-b
          ${dark ? 'border-slate-700/50 bg-slate-800/30' : 'border-slate-200 bg-slate-50'}
        `}>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-500" /> Credential Details
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px">
            {details.map((item, i) => (
              <div
                key={i}
                className={`
                  flex items-start gap-3 p-3.5 transition-colors
                  ${dark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}
                  ${i % 2 === 0 ? (dark ? 'bg-transparent' : 'bg-transparent') : ''}
                `}
              >
                <span className={`mt-0.5 shrink-0 ${item.accent || 'text-slate-400 dark:text-slate-500'}`}>
                  <item.icon className="w-4 h-4" />
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Verification Code
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400 tracking-wider select-all">
                {cert.verification_code}
              </span>
              <button onClick={handleCopyLink}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
                  border-emerald-300 dark:border-emerald-700
                  text-emerald-700 dark:text-emerald-400
                  hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
                {copied ? <><CheckCheck className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Summary (if LOR) */}
      {isLOR && meta.performance_summary && (
        <div className={`
          rounded-2xl p-6 border shadow-lg
          ${dark ? 'bg-slate-900 border-violet-800/30' : 'bg-white border-violet-200'}
          animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300
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
      <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
        <div className={`
          inline-block px-10 py-6 rounded-2xl border shadow-lg
          ${dark ? 'bg-slate-900 border-slate-700/50' : 'bg-white border-slate-200'}
        `}>
          <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-xl shadow-emerald-500/20">
            <User className="w-9 h-9 text-white" />
          </div>
          <p className="text-base font-bold text-slate-900 dark:text-white">Mohammed Miran Khan</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Founder & CEO, Growlancer</p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/30">
            <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Digital Signature ✓
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
        <button onClick={() => window.print()}
          className="flex items-center gap-2.5 px-6 py-3 rounded-xl border text-sm font-medium transition-all active:scale-[0.97]
            border-slate-300 dark:border-slate-600
            text-slate-700 dark:text-slate-300
            hover:bg-slate-100 dark:hover:bg-slate-800
            shadow-sm">
          <Printer className="w-4 h-4" /> Print Certificate
        </button>
        <button onClick={handleCopyLink}
          className="flex items-center gap-2.5 px-6 py-3 rounded-xl border text-sm font-medium transition-all active:scale-[0.97]
            border-slate-300 dark:border-slate-600
            text-slate-700 dark:text-slate-300
            hover:bg-slate-100 dark:hover:bg-slate-800
            shadow-sm">
          {copied ? <CheckCheck className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
          {copied ? 'Link Copied!' : 'Share Link'}
        </button>
      </div>

      {/* Trust Footer */}
      <div className="text-center">
        <div className={`
          inline-flex items-center gap-4 px-6 py-3 rounded-xl border
          ${dark ? 'bg-slate-900/50 border-slate-700/30' : 'bg-slate-50 border-slate-200'}
        `}>
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Digitally Signed</span>
          </div>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600" />
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Real-Time</span>
          </div>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-600" />
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tamper-Proof</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Revoked Card ───────────────────────────────────────────────────
function RevokedCard({ cert, dark }: { cert: Certificate; dark: boolean }) {
  const meta = (cert.metadata || {}) as Record<string, any>;
  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 dark:bg-red-500/10 ring-4 ring-red-500/20">
        <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Credential Revoked</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          This credential is no longer valid. Please contact the issuer for more information.
        </p>
      </div>
      <div className={`
        rounded-2xl p-6 border text-left shadow-lg
        ${dark ? 'bg-slate-900 border-red-800/30' : 'bg-white border-red-200'}
      `}>
        <div className="space-y-4">
          {cert.revoked_reason && (
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Reason</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white bg-red-50 dark:bg-red-900/10 p-3 rounded-xl border border-red-100 dark:border-red-800/20">
                {cert.revoked_reason}
              </p>
            </div>
          )}
          {cert.revoked_at && (
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Revoked Date</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(cert.revoked_at)}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Replacement Available</p>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${meta.replacement_available ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
              {meta.replacement_available ? 'Yes — Contact issuer' : 'No'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Replaced Card ──────────────────────────────────────────────────
function ReplacedCard({ onViewLatest, dark }: { onViewLatest: () => void; dark: boolean }) {
  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-500/10 ring-4 ring-amber-500/20">
        <RefreshCw className="w-10 h-10 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Credential Replaced</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          This credential has been replaced by a newer version.
        </p>
      </div>
      <div className={`
        rounded-2xl p-6 border shadow-lg
        ${dark ? 'bg-slate-900 border-amber-800/30' : 'bg-white border-amber-200'}
      `}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400 bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl border border-amber-100 dark:border-amber-800/20">
            This credential has been replaced by a newer version. Please use the new credential for verification.
          </p>
          <button onClick={onViewLatest}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all active:scale-[0.97] shadow-lg shadow-emerald-500/20">
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
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 dark:bg-red-500/10 ring-4 ring-red-500/20">
        <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Credential Not Found</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          {error || "The entered Verification ID or QR Code could not be verified in our system."}
        </p>
      </div>
      <button onClick={onRetry}
        className="inline-flex items-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all active:scale-[0.97] shadow-lg shadow-emerald-500/20">
        <Search className="w-4 h-4" /> Try Another Code
      </button>
    </div>
  );
}

// ─── Rate Limited Card ──────────────────────────────────────────────
function RateLimitedCard() {
  return (
    <div className="w-full max-w-lg mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-500/10 ring-4 ring-amber-500/20">
        <Clock className="w-10 h-10 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Too Many Attempts</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
          Please wait a few minutes before trying again. This rate limit protects against unauthorized access.
        </p>
      </div>
    </div>
  );
}

// ─── QR Scanner Button ──────────────────────────────────────────────
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
    const token = prompt('Enter the QR token from the image:');
    if (token) onScan(token.trim());
    setScanning(false);
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
      <button onClick={handleScan} disabled={scanning}
        className="flex items-center gap-2 px-5 py-3 rounded-xl border transition-all font-medium text-sm active:scale-[0.97]
          border-emerald-300 dark:border-emerald-700
          text-emerald-700 dark:text-emerald-400
          hover:bg-emerald-50 dark:hover:bg-emerald-900/20
          disabled:opacity-50"
      >
        {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Scan className="w-5 h-5" />}
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
        const internProfile = (res.internProfile && typeof res.internProfile === 'object' && 'id' in res.internProfile)
          ? res.internProfile as InternProfile
          : null;
        if (cert.status === 'revoked') setResult({ mode: 'revoked', certificate: cert, internProfile });
        else if (meta.replaced) setResult({ mode: 'replaced', certificate: cert, internProfile });
        else setResult({ mode: 'verified', certificate: cert, internProfile });
      } else if (res.rateLimited) setResult({ mode: 'rate_limited', error: res.error });
      else setResult({ mode: 'invalid', error: res.error || 'Credential not found' });
    } catch { setResult({ mode: 'invalid', error: 'Verification failed. Please try again.' }); }
    finally { setVerifying(false); }
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
        const internProfile = (res.internProfile && typeof res.internProfile === 'object' && 'id' in res.internProfile)
          ? res.internProfile as InternProfile
          : null;
        if (cert.status === 'revoked') setResult({ mode: 'revoked', certificate: cert, internProfile, token: res.token });
        else if (meta.replaced) setResult({ mode: 'replaced', certificate: cert, internProfile, token: res.token });
        else setResult({ mode: 'verified', certificate: cert, internProfile, token: res.token });
      } else if (res.rateLimited) setResult({ mode: 'rate_limited', error: res.error });
      else setResult({ mode: 'invalid', error: res.error || 'Invalid QR code' });
    } catch { setResult({ mode: 'invalid', error: 'QR verification failed. Please try again.' }); }
    finally { setVerifying(false); }
  }, [qrInput]);

  useEffect(() => { if (urlCode) handleVerifyByCode(urlCode); }, [urlCode, handleVerifyByCode]);
  useEffect(() => { if (urlQrToken) handleVerifyByQR(urlQrToken); }, [urlQrToken, handleVerifyByQR]);

  const handleReset = () => {
    setResult(null);
    setVerifying(false);
    navigate('/verify-certificate', { replace: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { if (activeTab === 'code') handleVerifyByCode(); else handleVerifyByQR(); }
  };

  const handleViewLatest = () => handleReset();

  // ═══ RENDER — RESULTS STATE ════════════════════════════════════
  if (verifying) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <HeaderBar dark={dark} onToggleTheme={toggleTheme} onHome={handleReset} />
        <main className="max-w-4xl mx-auto px-4 py-12 md:py-16">
          <VerificationSkeleton />
        </main>
        <FooterBar dark={dark} />
      </div>
    );
  }

  if (result) {
    return (
      <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <HeaderBar dark={dark} onToggleTheme={toggleTheme} onHome={handleReset} showNewSearch />
        <main className="max-w-4xl mx-auto px-4 py-12 md:py-16">
          {result.mode === 'verified' && result.certificate && <VerifiedCard cert={result.certificate} internProfile={result.internProfile} dark={dark} />}
          {result.mode === 'revoked' && result.certificate && <RevokedCard cert={result.certificate} dark={dark} />}
          {result.mode === 'replaced' && <ReplacedCard onViewLatest={handleViewLatest} dark={dark} />}
          {result.mode === 'invalid' && <InvalidCard error={result.error || 'Credential not found'} onRetry={handleReset} />}
          {result.mode === 'rate_limited' && <RateLimitedCard />}
        </main>
        <FooterBar dark={dark} />
      </div>
    );
  }

  // ═══ RENDER — LANDING/HUB PAGE ═════════════════════════════════
  return (
    <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <HeaderBar dark={dark} onToggleTheme={toggleTheme} />

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        {/* Hero Section */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center justify-center mb-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-xl shadow-emerald-500/25 ring-4 ring-emerald-500/10">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">
            Credential Verification Portal
          </h1>
          <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto text-sm leading-relaxed">
            Verify the authenticity of Growlancer-issued Internship Certificates and Letters of Recommendation.
          </p>
        </div>

        {/* Search Section - Glass Card */}
        <div className={`
          max-w-2xl mx-auto mb-12 rounded-2xl border p-6 md:p-8
          ${dark
            ? 'bg-slate-900/80 border-slate-700/50 backdrop-blur-xl'
            : 'bg-white/80 border-slate-200 backdrop-blur-xl'
          }
          shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]
          animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100
        `}>
          {/* Tab Toggle */}
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 mb-6">
            <button onClick={() => setActiveTab('code')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'code'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}>
              <Hash className="w-4 h-4" /> Verification ID
            </button>
            <button onClick={() => setActiveTab('qr')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'qr'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}>
              <QrCode className="w-4 h-4" /> QR Code
            </button>
          </div>

          {activeTab === 'code' ? (
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter Verification ID (e.g., GRW-CERT-XXXXX)"
                  className={`w-full pl-12 pr-4 py-3.5 rounded-xl border text-sm font-mono tracking-wider uppercase transition-all focus:outline-none ${
                    dark
                      ? 'bg-slate-800/80 border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/30'
                      : 'bg-white/80 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20'
                  }`} />
              </div>
              <button onClick={() => handleVerifyByCode()} disabled={verifying || !searchInput.trim()}
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all active:scale-[0.97] shadow-lg shadow-emerald-500/20 whitespace-nowrap">
                {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <QrCode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
                <input type="text" value={qrInput} onChange={e => setQrInput(e.target.value)}
                  onKeyDown={handleKeyDown} placeholder="Enter or scan QR token"
                  className={`w-full pl-12 pr-4 py-3.5 rounded-xl border text-sm font-mono transition-all focus:outline-none ${
                    dark
                      ? 'bg-slate-800/80 border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500/30'
                      : 'bg-white/80 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/20'
                  }`} />
              </div>
              <QRScannerButton onScan={(token) => { setQrInput(token); handleVerifyByQR(token); }} />
              <button onClick={() => handleVerifyByQR()} disabled={verifying || !qrInput.trim()}
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all active:scale-[0.97] shadow-lg shadow-emerald-500/20 whitespace-nowrap">
                {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
              </button>
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          {[
            { icon: Shield, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/10', title: 'Real-Time Verification', desc: 'Instant credential verification with live data from our secure database.' },
            { icon: FileText, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-500/10', title: 'Certificates & LOR', desc: 'Verify internship certificates and letters of recommendation issued by Growlancer.' },
            { icon: Lock, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-500/10', title: 'Tamper-Proof', desc: 'Each credential is cryptographically signed and cannot be altered.' },
          ].map((card, i) => (
            <div key={i} className={`p-6 rounded-2xl border text-center transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${dark ? 'bg-slate-900/60 border-slate-700/50 hover:border-slate-600' : 'bg-white/60 border-slate-200 hover:border-slate-300'}`}>
              <div className={`mx-auto w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center mb-4`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">{card.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>

        {/* How It Works */}
        <div className={`max-w-3xl mx-auto mb-10 p-6 md:p-8 rounded-2xl border ${dark ? 'bg-slate-900/40 border-slate-700/30' : 'bg-white/40 border-slate-200'} animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300`}>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white text-center mb-6">How Verification Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Get Your Code', desc: 'Your employer will send you a unique verification code via email.', color: 'text-emerald-600 dark:text-emerald-400' },
              { step: '02', title: 'Enter Code', desc: 'Type or paste the code in the search bar above and click Verify.', color: 'text-emerald-600 dark:text-emerald-400' },
              { step: '03', title: 'View Certificate', desc: 'Your certificate details appear in real-time, ready to share.', color: 'text-emerald-600 dark:text-emerald-400' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="mx-auto w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{item.step}</span>
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-1">{item.title}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust Badge */}
        <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
          <div className={`inline-flex items-center gap-6 px-8 py-4 rounded-2xl border shadow-sm ${dark ? 'bg-slate-900/50 border-slate-700/30' : 'bg-white/50 border-slate-200'}`}>
            {[
              { icon: Shield, label: 'Digitally Verified' },
              { icon: Clock, label: 'Real-Time' },
              { icon: Globe, label: 'Public Access' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <item.icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{item.label}</span>
                {i < 2 && <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 ml-2" />}
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-700">
          <div className={`p-4 rounded-xl border ${dark ? 'bg-amber-500/5 border-amber-500/10' : 'bg-amber-50/80 border-amber-200'}`}>
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-1">Important Notice</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  This credential verification page is hosted on the Growlancer platform. In the event of a domain change, platform migration, or service discontinuation, this verification service and its associated records may be removed or relocated.
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
function HeaderBar({ dark, onToggleTheme, onHome, showNewSearch }: {
  dark: boolean; onToggleTheme: () => void; onHome?: () => void; showNewSearch?: boolean;
}) {
  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${dark ? 'bg-slate-950/80 border-slate-800/50' : 'bg-white/80 border-slate-200'}`}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <button onClick={onHome || (() => window.history.pushState({}, '', '/verify-certificate'))}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity group">
          <div className="relative">
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-9 w-9 rounded-xl" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-950" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">Growlancer</p>
            <p className="text-[9px] uppercase tracking-widest font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">Verification Portal</p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onToggleTheme}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
              dark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}>
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
          </button>
          <a href={showNewSearch ? undefined : '/'} onClick={showNewSearch ? (e) => { e.preventDefault(); onHome?.(); } : undefined}
            className="text-xs font-medium px-3 py-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
            {showNewSearch ? '← New Search' : '← Home'}
          </a>
        </div>
      </div>
    </header>
  );
}

// ─── Footer Bar ─────────────────────────────────────────────────────
function FooterBar({ dark }: { dark: boolean }) {
  return (
    <footer className={`border-t py-8 px-4 ${dark ? 'border-slate-800/50 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
      <div className="max-w-4xl mx-auto text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <img src="/UpdatedLogo.webp" alt="" className="h-6 w-6 rounded-lg opacity-40" />
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">Growlancer</span>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">© {new Date().getFullYear()} Growlancer. All rights reserved.</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          {['Terms', 'Privacy', 'Contact'].map(item => (
            <a key={item} href={`/${item.toLowerCase()}`}
              className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">{item}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}
