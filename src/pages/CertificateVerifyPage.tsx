import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Award, Shield, XCircle, Loader2, Search,
  User, Calendar, Clock, Copy, CheckCheck, AlertTriangle,
  Share2, Printer, Sparkles,  BookOpen, Zap, BadgeCheck, ArrowLeft, Star,
  ExternalLink, GraduationCap, QrCode, Users, Briefcase, Globe,
} from 'lucide-react';
import { verifyCertificateByCode, CERT_LEVEL_STYLES, getCertificateTitle, type Certificate, type InternProfile } from '../lib/certificateService';

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
  lor: <Star className="w-5 h-5" />,
};

const typeLabels: Record<string, string> = {
  platform: 'Platform Certificate',
  skill_test: 'Skill Certification',
  internship: 'Internship Completion',
  achievement: 'Achievement Badge',
  lor: 'Letter of Recommendation',
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

  if (cert.certificate_type === 'lor') {
    // LOR Display — Letter of Recommendation format
    const meta = cert.metadata as Record<string, any> || {};
    return (
      <div className="w-full max-w-2xl mx-auto">
        {/* Verification Badge */}
        <div className="flex items-center justify-center gap-2 mb-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2 px-4 py-1.5 bg-violet-500/10 rounded-full border border-violet-500/20">
            <BadgeCheck className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">
              Verified — Letter of Recommendation
            </span>
          </div>
        </div>

        {/* Main LOR Card */}
        <div
          className="relative overflow-hidden rounded-[2rem] p-[2px] animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9, #5b21b6)' }}
        >
          <div className="relative bg-[#0F172A] rounded-[calc(2rem-2px)] p-8 md:p-12">
            <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
              <Star className="w-64 h-64 text-violet-500" />
            </div>

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <img src="/UpdatedLogo.png" alt="Growlancer" className="h-10 w-10 rounded-xl" />
                  <div>
                    <h2 className="font-bold text-lg text-white leading-none">Growlancer</h2>
                    <p className="text-[10px] uppercase tracking-widest text-violet-400 font-bold">Letter of Recommendation</p>
                  </div>
                </div>
                <div className={`p-3 rounded-xl ${levelStyle.bg}`}>
                  <span className="text-2xl">{levelStyle.icon}</span>
                </div>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent mb-8" />

              {/* LOR Header */}
              <div className="text-center mb-8">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-3">
                  To Whom It May Concern
                </p>
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  Letter of Recommendation
                </h1>
                <p className="text-slate-400 text-sm">
                  This letter is issued in recognition of exceptional performance by
                </p>
                <h2 className="text-2xl md:text-3xl font-bold text-violet-400 mt-4 mb-2">
                  {cert.recipient_name}
                </h2>
                <div className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full"
                  style={{ background: levelStyle.bg, border: `1px solid ${levelStyle.border || 'transparent'}70` }}
                >
                  <span className="text-lg">{levelStyle.icon}</span>
                  <span className={`font-bold text-sm ${levelStyle.color}`}>{getCertificateTitle(cert)}</span>
                </div>
              </div>

              {/* Performance Summary */}
              {meta.performance_summary && (
                <div className="mb-6 p-5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <h3 className="text-sm font-bold text-violet-400 mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4" /> Outstanding Contributions
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{meta.performance_summary}</p>
                </div>
              )}

              {/* Skills Demonstrated */}
              {meta.skills_demonstrated && Array.isArray(meta.skills_demonstrated) && meta.skills_demonstrated.length > 0 && (
                <div className="mb-6 p-5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <h3 className="text-sm font-bold text-violet-400 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Key Skills Demonstrated
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {meta.skills_demonstrated.map((skill: string, i: number) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-violet-500/10 text-violet-300 text-xs font-medium border border-violet-500/20">
                        {skill.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <User className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Recipient</p>
                    <p className="text-sm font-semibold text-white">{cert.recipient_name}</p>
                    <p className="text-xs text-slate-400">{cert.recipient_email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <Calendar className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Issued On</p>
                    <p className="text-sm font-semibold text-white">{issuedDate}</p>
                    <p className="text-xs text-slate-400">{issueRelative}</p>
                  </div>
                </div>
              </div>

              {/* Verification Code */}
              <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-violet-400" />
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Verification Code</span>
                  </div>
                  <button onClick={handleCopyLink}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 transition-colors">
                    {copied ? <><CheckCheck className="w-3 h-3 text-emerald-400" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Link</>}
                  </button>
                </div>
                <p className="mt-2 text-lg font-mono font-bold tracking-wider text-violet-400 select-all">
                  {cert.verification_code}
                </p>
                <p className="mt-1 text-[10px] text-slate-600">Share this code to verify the authenticity of this letter</p>
              </div>

              {/* Signature */}
              <div className="mt-8 text-center">
                <div className="border-t border-white/10 pt-6 inline-block px-12">
                  <p className="text-sm font-bold text-white">Mohammad Miran Khan</p>
                  <p className="text-[11px] text-slate-400">Founder & CEO, Growlancer</p>
                </div>
              </div>

              <div className="mt-6 text-center">
                <p className="text-[9px] text-slate-700">This letter is digitally verified and can be checked at any time.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-xl text-xs font-bold text-slate-300 transition-all">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button onClick={handleCopyLink}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-xl text-xs font-bold text-slate-300 transition-all">
            {copied ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </div>
    );
  }

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
                  src="/UpdatedLogo.png"
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
  const [internProfile, setInternProfile] = useState<InternProfile | null>(null);
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
        setInternProfile(result.internProfile || null);
      } else {
        setCertificate(null);
        setInternProfile(null);
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
            <img src="/UpdatedLogo.png" alt="" className="h-8 w-8 rounded-lg" />
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

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        {/* Landing Hero - shown when no search has happened */}
        {!searched || (!certificate && !error) ? (
          <>
            <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4">
              <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/5">
                <Shield className="w-10 h-10 text-emerald-400" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                Certificate <span className="text-emerald-400">Hub</span>
              </h1>
              <p className="text-slate-400 max-w-lg mx-auto text-base leading-relaxed">
                Verify Growlancer certificates, internship completion records, and letters of recommendation — all in one place.
              </p>
            </div>

            {/* Feature Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
              {[
                { icon: <BadgeCheck className="w-5 h-5" />, title: 'Verify Certificates', desc: 'Enter a verification code to instantly verify any certificate or LOR issued by Growlancer.', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                { icon: <User className="w-5 h-5" />, title: 'View Intern Details', desc: 'See the recipient\'s full internship profile — including role, education, and links — in real-time.', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                { icon: <Shield className="w-5 h-5" />, title: 'Trusted & Tamper-Proof', desc: 'Every certificate is digitally signed, tamper-proof, and verifiable anytime from anywhere.', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
              ].map((feature, i) => (
                <div key={i} className={`p-5 rounded-2xl ${feature.bg} ${feature.border} animate-in fade-in slide-in-from-bottom-4`}
                  style={{ animationDelay: `${i * 150}ms`, animationFillMode: 'both' }}>
                  <div className={`h-10 w-10 rounded-xl ${feature.bg} flex items-center justify-center mb-3 ${feature.color}`}>
                    {feature.icon}
                  </div>
                  <h3 className={`text-sm font-bold text-white mb-1.5`}>{feature.title}</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>

            {/* Two-Column Info Section */}
            <div className="max-w-3xl mx-auto mb-10 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
              {/* Certificate Types */}
              <div className="p-5 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" /> Certificate Types
                </h3>
                <div className="space-y-3">
                  {[
                    { icon: '🎓', label: 'Internship Completion', code: 'GRW-CERT-XXXXX', color: 'text-emerald-400' },
                    { icon: '🌟', label: 'Letter of Recommendation', code: 'GRW-LOR-XXXXX', color: 'text-violet-400' },
                    { icon: '🏅', label: 'Skill Certification', code: 'GRW-SKILL-XXXXX', color: 'text-blue-400' },
                    { icon: '⭐', label: 'Achievement Badge', code: 'GRW-ACHV-XXXXX', color: 'text-amber-400' },
                  ].map((type, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <span className="text-lg shrink-0">{type.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white">{type.label}</p>
                        <p className={`text-[10px] font-mono ${type.color}`}>{type.code}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* How It Works */}
              <div className="p-5 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" /> How Verification Works
                </h3>
                <div className="space-y-4">
                  {[
                    { step: '1', icon: <QrCode className="w-4 h-4" />, title: 'Get Your Code', desc: 'Interns receive a unique verification code via email or QR from their program manager.' },
                    { step: '2', icon: <Search className="w-4 h-4" />, title: 'Enter Code Below', desc: 'Type or paste the code in the search field above and click Verify.' },
                    { step: '3', icon: <BadgeCheck className="w-4 h-4" />, title: 'Instant Verification', desc: 'Your full certificate and internship details appear instantly — share with employers!' },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0">
                        {step.step}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-400">{step.icon}</span>
                          <h4 className="text-xs font-bold text-white">{step.title}</h4>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Internship CTA */}
                <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-emerald-600/10 to-emerald-700/5 border border-emerald-500/15 text-center">
                  <p className="text-[11px] text-slate-400 mb-2">
                    Haven\'t completed an internship yet? Apply now!
                  </p>
                  <a href="/internships"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all">
                    <Briefcase className="w-3 h-3" />
                    Apply for Internships
                  </a>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {/* Search Input - Always visible but smaller when certificate is shown */}
        <div className={`mx-auto ${searched && (certificate || error) ? 'max-w-lg mb-8' : 'max-w-xl mb-6'}`}>
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

        {/* Intern Profile Display - When intern's application data is available */}
        {certificate && internProfile && !verifying && (
          <div className="max-w-2xl mx-auto mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="rounded-[2rem] p-[2px]" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)' }}>
              <div className="relative bg-[#0F172A] rounded-[calc(2rem-2px)] p-6 md:p-8">
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
                  <User className="w-48 h-48 text-blue-500" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-6">
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">Intern Profile Details</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Full Name</p>
                      <p className="text-sm font-semibold text-white">{internProfile.full_name}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Email</p>
                      <p className="text-sm text-slate-300">{internProfile.email}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Role / Position</p>
                      <p className="text-sm font-semibold text-emerald-400">{internProfile.role_name}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Application Status</p>
                      <p className="text-sm font-semibold text-amber-400 capitalize">{internProfile.status?.replace('_', ' ') || 'N/A'}</p>
                    </div>
                    {internProfile.university && (
                      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">University</p>
                        <p className="text-sm text-slate-300">{internProfile.university}</p>
                      </div>
                    )}
                    {internProfile.degree && (
                      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Degree</p>
                        <p className="text-sm text-slate-300">{internProfile.degree}</p>
                      </div>
                    )}
                    {internProfile.country && (
                      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Country</p>
                        <p className="text-sm text-slate-300">{internProfile.country}</p>
                      </div>
                    )}
                    {internProfile.phone && (
                      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Phone</p>
                        <p className="text-sm text-slate-300">{internProfile.phone}</p>
                      </div>
                    )}
                </div>

                  {/* Links Section */}
                  {(internProfile.linkedin_url || internProfile.github_url || internProfile.portfolio_url) && (
                    <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3">Links</p>
                      <div className="flex flex-wrap gap-3">
                        {internProfile.linkedin_url && (
                          <a href={internProfile.linkedin_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                            <ExternalLink className="w-3 h-3" /> LinkedIn
                          </a>
                        )}
                        {internProfile.github_url && (
                          <a href={internProfile.github_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                            <ExternalLink className="w-3 h-3" /> GitHub
                          </a>
                        )}
                        {internProfile.portfolio_url && (
                          <a href={internProfile.portfolio_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                            <ExternalLink className="w-3 h-3" /> Portfolio
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Application Date */}
                  {internProfile.created_at && (
                    <div className="mt-4 text-center">
                      <p className="text-[10px] text-slate-600">
                        Internship Application Submitted: {formatDate(internProfile.created_at)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
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
