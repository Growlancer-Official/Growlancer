import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Award, Shield, CheckCircle2, XCircle, Loader2, Search, ExternalLink,
  User, Mail, Calendar, Clock, FileText, Copy, CheckCheck, AlertTriangle,
  Share2, Printer, Sparkles, BookOpen, Zap, BadgeCheck, ArrowLeft,
} from 'lucide-react';
import { verifyCertificateByCode, CERT_LEVEL_STYLES, getCertificateTitle, type Certificate } from '../lib/certificateService';

// ─── Helpers ────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

const typeIcons: Record<string, React.ReactNode> = {
  platform: <Award className="w-5 h-5" />,
  skill_test: <BookOpen className="w-5 h-5" />,
  internship: <Zap className="w-5 h-5" />,
  achievement: <Sparkles className="w-5 h-5" />,
};

const typeLabels: Record<string, string> = {
  platform: 'Platform Certificate',
  skill_test: 'Skill Certification',
  internship: 'Internship Completion',
  achievement: 'Achievement Badge',
};

// ─── Certificate Display Card ───────────────────────────────────────
function CertificateCard({ cert }: { cert: Certificate }) {
  const levelStyle = CERT_LEVEL_STYLES[cert.level] || CERT_LEVEL_STYLES.beginner;
  const [copied, setCopied] = useState(false);
  const issuedDate = formatDate(cert.issued_at || cert.created_at);
  const issueRelative = formatRelativeTime(cert.issued_at || cert.created_at);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Verification Badge */}
      <div className="flex items-center justify-center gap-2 mb-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20">
          <BadgeCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
            Verified — Authentic Certificate
          </span>
        </div>
      </div>

      {/* Main Certificate Card */}
      <div
        className="relative overflow-hidden rounded-[2rem] p-[2px] animate-in fade-in slide-in-from-bottom-4 duration-500"
        style={{ background: 'linear-gradient(135deg, #10B981, #059669, #047857)' }}
      >
        <div className="relative bg-[#0F172A] rounded-[calc(2rem-2px)] p-8 md:p-12">
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          {/* Watermark */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
            <Award className="w-64 h-64 text-emerald-500" />
          </div>

          {/* Top Section */}
          <div className="relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <img
                  src="/Growlancer Logo (2).png"
                  alt="Growlancer"
                  className="h-10 w-10 rounded-xl"
                />
                <div>
                  <h2 className="font-bold text-lg text-white leading-none">Growlancer</h2>
                  <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">
                    Certificate of Achievement
                  </p>
                </div>
              </div>
              <div className={`p-3 rounded-xl ${levelStyle.bg}`}>
                <span className="text-2xl">{levelStyle.icon}</span>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent mb-8" />

            {/* Certificate Title */}
            <div className="text-center mb-8">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-3">
                This certifies that
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                {cert.recipient_name}
              </h1>
              <p className="text-slate-400 text-sm">
                has successfully demonstrated proficiency in
              </p>
              <div className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full"
                style={{ background: levelStyle.bg, border: `1px solid ${levelStyle.border || 'transparent'}70` }}
              >
                <span className="text-lg">{levelStyle.icon}</span>
                <span className={`font-bold text-sm ${levelStyle.color}`}>
                  {getCertificateTitle(cert)}
                </span>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent mb-8" />

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <User className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Recipient</p>
                  <p className="text-sm font-semibold text-white">{cert.recipient_name}</p>
                  <p className="text-xs text-slate-400">{cert.recipient_email}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <Calendar className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Issued On</p>
                  <p className="text-sm font-semibold text-white">{issuedDate}</p>
                  <p className="text-xs text-slate-400">{issueRelative}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <Award className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Level</p>
                  <p className={`text-sm font-semibold ${levelStyle.color}`}>{levelStyle.label}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                {cert.certificate_type && typeIcons[cert.certificate_type] && (
                  <span className="text-emerald-400 mt-0.5 shrink-0">{typeIcons[cert.certificate_type]}</span>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Type</p>
                  <p className="text-sm font-semibold text-white">
                    {typeLabels[cert.certificate_type] || cert.certificate_type}
                  </p>
                </div>
              </div>
            </div>

            {/* Verification Code */}
            <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    Verification Code
                  </span>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  {copied ? (
                    <><CheckCheck className="w-3 h-3 text-emerald-400" /> Copied!</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Copy Link</>
                  )}
                </button>
              </div>
              <p className="mt-2 text-lg font-mono font-bold tracking-wider text-emerald-400 select-all">
                {cert.verification_code}
              </p>
              <p className="mt-1 text-[10px] text-slate-600">
                Share this code to verify the authenticity of this certificate
              </p>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center">
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-600 font-bold">
                Issued by Growlancer Platform
              </p>
              <p className="text-[9px] text-slate-700 mt-1">
                This certificate is digitally verified and can be checked at any time.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-xl text-xs font-bold text-slate-300 transition-all"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-xl text-xs font-bold text-slate-300 transition-all"
        >
          {copied ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Verify Page ───────────────────────────────────────────────
export function CertificateVerifyPage() {
  const { code: urlCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [searchCode, setSearchCode] = useState(urlCode || '');
  const [verifying, setVerifying] = useState(false);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(!!urlCode);

  // Auto-verify if code from URL
  useEffect(() => {
    if (urlCode) {
      handleVerify(urlCode);
    }
  }, [urlCode]);

  const handleVerify = async (code?: string) => {
    const codeToVerify = (code || searchCode).trim();
    if (!codeToVerify) {
      setError('Please enter a verification code');
      return;
    }

    setVerifying(true);
    setError(null);
    setCertificate(null);
    setSearched(true);

    try {
      const result = await verifyCertificateByCode(codeToVerify);
      if (result.valid && result.certificate) {
        setCertificate(result.certificate);
      } else {
        setError(result.error || 'Certificate not found. Please check the code and try again.');
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  // Retracted / invalid certificate
  if (searched && certificate && certificate.status !== 'active') {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-6 animate-in fade-in zoom-in-50 duration-500">
          <div className="mx-auto w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
            <XCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Certificate {certificate.status === 'revoked' ? 'Revoked' : 'Expired'}</h1>
          <p className="text-slate-400 text-sm">
            {certificate.status === 'revoked'
              ? `This certificate was revoked${certificate.revoked_reason ? ` for: "${certificate.revoked_reason}"` : ''}.`
              : 'This certificate has expired and is no longer valid.'}
          </p>
          <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5 inline-block mx-auto">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Certificate Code</p>
            <p className="font-mono text-sm text-slate-400">{certificate.verification_code}</p>
          </div>
          <button onClick={() => navigate('/verify-certificate')}
            className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 font-bold transition-colors">
            <ArrowLeft className="w-4 h-4" /> Verify another certificate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A]">
      {/* Header */}
      <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/Growlancer Logo (2).png" alt="" className="h-8 w-8 rounded-lg" />
            <div className="hidden sm:block">
              <span className="text-sm font-bold text-white">Growlancer</span>
              <span className="text-[9px] ml-2 uppercase tracking-widest text-emerald-400 font-bold">Certificate Verification</span>
            </div>
          </div>
          <a href="/" className="text-xs text-slate-400 hover:text-white transition-colors">
            ← Back to Home
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        {/* Hero Section */}
        {!searched || (!certificate && !error) ? (
          <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
              <BadgeCheck className="w-10 h-10 text-emerald-400" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
              Certificate Verification
            </h1>
            <p className="text-slate-400 max-w-md mx-auto">
              Verify the authenticity of a Growlancer certificate by entering its verification code below.
            </p>
          </div>
        ) : null}

        {/* Search Input */}
        <div className={`max-w-lg mx-auto ${searched && (certificate || error) ? 'mb-8' : 'mb-12'}`}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={searchCode}
                onChange={e => setSearchCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleVerify(); }}
                placeholder="Enter code (e.g., GRW-CERT-XXXXX)"
                className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono tracking-wider uppercase"
              />
            </div>
            <button
              onClick={() => handleVerify()}
              disabled={verifying || !searchCode.trim()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all flex items-center gap-2"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Verify
            </button>
          </div>
          {error && (
            <div className="mt-3 p-3 rounded-xl bg-red-500/5 border border-red-500/10 flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-400 uppercase">Not Found</p>
                <p className="text-xs text-slate-400">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Loading */}
        {verifying && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
              <p className="text-sm text-slate-500">Verifying certificate...</p>
            </div>
          </div>
        )}

        {/* Certificate Display */}
        {certificate && !verifying && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <CertificateCard cert={certificate} />
          </div>
        )}

        {/* Trust Badge */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-6 px-8 py-4 rounded-2xl bg-slate-800/30 border border-white/5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Digitally Verified</span>
            </div>
            <div className="w-px h-6 bg-white/5" />
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tamper-Proof</span>
            </div>
            <div className="w-px h-6 bg-white/5" />
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Real-Time</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Missing Lock icon
function Lock(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
