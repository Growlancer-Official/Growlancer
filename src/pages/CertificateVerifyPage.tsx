import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Award, Shield, XCircle, Loader2, Search,
  User, Calendar, Clock, Copy, CheckCheck, AlertTriangle,
  Share2, Printer, Sparkles, BookOpen, Zap, BadgeCheck, ArrowLeft, Star,
  ExternalLink, Mail, Globe,
} from 'lucide-react';
import { verifyCertificateByCode,
  CERT_LEVEL_STYLES, getCertificateTitle, type Certificate, type InternProfile } from '../lib/certificateService';

// ─── Helpers ────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// ─── Certificate Card ───────────────────────────────────────────────
function CertificateCard({ cert }: { cert: Certificate }) {
  const levelStyle = CERT_LEVEL_STYLES[cert.level] || CERT_LEVEL_STYLES.beginner;
  const [copied, setCopied] = useState(false);
  const issuedDate = formatDate(cert.issued_at || cert.created_at);
  const issueRelative = formatRelativeTime(cert.issued_at || cert.created_at);
  const handleCopyLink = () => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const handlePrint = () => window.print();
  const isLOR = cert.certificate_type === 'lor';
  const meta = (cert.metadata || {}) as Record<string, any>;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Verify Badge */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <div className={`flex items-center gap-2 px-4 py-1.5 ${isLOR ? 'bg-violet-500/10' : 'bg-emerald-500/10'} rounded-full border ${isLOR ? 'border-violet-500/20' : 'border-emerald-500/20'}`}>
          <BadgeCheck className={`w-4 h-4 ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`} />
          <span className={`text-xs font-bold ${isLOR ? 'text-violet-400' : 'text-emerald-400'} uppercase tracking-wider`}>
            Verified — {isLOR ? 'Letter of Recommendation' : 'Authentic Certificate'}
          </span>
        </div>
      </div>
      {/* Main Card */}
      <div className="relative overflow-hidden rounded-[2rem] p-[2px] animate-in fade-in slide-in-from-bottom-4 duration-500"
        style={{ background: isLOR ? 'linear-gradient(135deg, #7c3aed, #6d28d9, #5b21b6)' : 'linear-gradient(135deg, #10B981, #059669, #047857)' }}>
        <div className="relative bg-[#0F172A] rounded-[calc(2rem-2px)] p-8 md:p-12">
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
            {isLOR ? <Star className="w-64 h-64 text-violet-500" /> : <Award className="w-64 h-64 text-emerald-500" />}
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-10 w-10 rounded-xl" />
                <div>
                  <h2 className="font-bold text-lg text-white leading-none">Growlancer</h2>
                  <p className={`text-[10px] uppercase tracking-widest font-bold ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`}>
                    {isLOR ? 'Letter of Recommendation' : 'Certificate of Achievement'}
                  </p>
                </div>
              </div>
              <div className={`p-3 rounded-xl ${levelStyle.bg}`}><span className="text-2xl">{levelStyle.icon}</span></div>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent mb-8" />

            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-3 text-center">
              {isLOR ? 'To Whom It May Concern' : 'This certifies that'}
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 text-center">{cert.recipient_name}</h1>
            <p className="text-slate-400 text-sm text-center">
              {isLOR ? 'This letter is issued in recognition of exceptional performance' : 'has successfully completed their program'}
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full mx-auto"
              style={{ background: levelStyle.bg, border: `1px solid ${levelStyle.border || 'transparent'}70` }}>
              <span className="text-lg">{levelStyle.icon}</span>
              <span className={`font-bold text-sm ${levelStyle.color}`}>{getCertificateTitle(cert)}</span>
            </div>

            {meta.performance_summary && (
              <div className="mt-6 p-5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <h3 className={`text-sm font-bold mb-3 ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`}>Outstanding Contributions</h3>
                <p className="text-sm text-slate-300 leading-relaxed">{meta.performance_summary}</p>
              </div>
            )}

            <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent my-8" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <User className={`w-4 h-4 mt-0.5 shrink-0 ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`} />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Recipient</p>
                  <p className="text-sm font-semibold text-white">{cert.recipient_name}</p>
                  <p className="text-xs text-slate-400">{cert.recipient_email}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <Calendar className={`w-4 h-4 mt-0.5 shrink-0 ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`} />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Issued On</p>
                  <p className="text-sm font-semibold text-white">{issuedDate}</p>
                  <p className="text-xs text-slate-400">{issueRelative}</p>
                </div>
              </div>
              {!isLOR && (
                <>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <Award className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Level</p>
                      <p className={`text-sm font-semibold ${levelStyle.color}`}>{levelStyle.label}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    {cert.certificate_type && typeIcons[cert.certificate_type] &&
                      <span className="text-emerald-400 mt-0.5 shrink-0">{typeIcons[cert.certificate_type]}</span>}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Type</p>
                      <p className="text-sm font-semibold text-white">{typeLabels[cert.certificate_type] || cert.certificate_type}</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className={`w-4 h-4 ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`} />
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Verification Code</span>
                </div>
                <button onClick={handleCopyLink}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 transition-colors">
                  {copied ? <><CheckCheck className="w-3 h-3 text-emerald-400" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Link</>}
                </button>
              </div>
              <p className={`mt-2 text-lg font-mono font-bold tracking-wider select-all ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`}>
                {cert.verification_code}
              </p>
              <p className="mt-1 text-[10px] text-slate-600">Share this code to verify the authenticity of this {isLOR ? 'letter' : 'certificate'}</p>
            </div>

            {isLOR && (
              <div className="mt-8 text-center">
                <div className="border-t border-white/10 pt-6 inline-block px-12">
                  <p className="text-sm font-bold text-white">Mohammad Miran Khan</p>
                  <p className="text-[11px] text-slate-400">Founder & CEO, Growlancer</p>
                </div>
              </div>
            )}
            <div className="mt-6 text-center">
              <p className="text-[9px] text-slate-700">This document is digitally verified and can be checked at any time.</p>
            </div>
          </div>
        </div>
      </div>
      {/* Actions */}
      <div className="flex items-center justify-center gap-3 mt-6">
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

// ─── Intern Profile Card ────────────────────────────────────────────
function InternProfileCard({ profile }: { profile: InternProfile }) {
  const hasLinks = profile.linkedin_url || profile.github_url || profile.portfolio_url;
  const durationStr = profile.available_from && profile.available_to
    ? `${formatDate(profile.available_from)} — ${formatDate(profile.available_to)}`
    : null;

  return (
    <div className="max-w-2xl mx-auto mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="rounded-[2rem] p-[2px]" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb, #1d4ed8)' }}>
        <div className="relative bg-[#0F172A] rounded-[calc(2rem-2px)] p-6 md:p-8">
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
            <User className="w-48 h-48 text-blue-500" />
          </div>
          <div className="relative z-10">
            {/* Section: Personal */}
            <div className="flex items-center gap-2 mb-4">
              <User className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">Personal Information</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {[
                { label: 'Full Name', value: profile.full_name },
                { label: 'Email', value: profile.email },
                { label: 'Role / Position', value: profile.role_name, accent: true },
                { label: 'Status', value: profile.status?.replace(/_/g, ' ') || 'N/A', accent2: true },
                ...(profile.phone ? [{ label: 'Phone', value: profile.phone }] : []),
                ...(profile.country ? [{ label: 'Country', value: profile.country }] : []),
                ...(profile.university ? [{ label: 'University', value: profile.university }] : []),
                ...(profile.degree ? [{ label: 'Degree', value: profile.degree }] : []),
              ].map((item, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{item.label}</p>
                  <p className={`text-sm font-semibold ${item.accent ? 'text-emerald-400' : item.accent2 ? 'text-amber-400 capitalize' : 'text-white'}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Section: Internship Duration */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">Internship Details</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {profile.available_from && profile.available_to ? (
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] md:col-span-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Duration</p>
                    <p className="text-sm font-semibold text-emerald-400">{durationStr}</p>
                  </div>
                ) : null}
                {profile.weekly_availability ? (
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Weekly Availability</p>
                    <p className="text-sm font-semibold text-white">{profile.weekly_availability} hrs/week</p>
                  </div>
                ) : null}
                {profile.created_at ? (
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Applied On</p>
                    <p className="text-sm font-semibold text-white">{formatDate(profile.created_at)}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Section: Cover Letter / Why Growlancer */}
            {profile.cover_letter && profile.cover_letter !== 'Added manually by admin for certificate issuance.' && (
              <div className="mb-6 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Cover Letter</p>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{profile.cover_letter}</p>
              </div>
            )}
            {profile.why_growlancer && (
              <div className="mb-6 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Why Growlancer</p>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{profile.why_growlancer}</p>
              </div>
            )}

            {/* Section: Links */}
            {hasLinks && (
              <div className="mb-6 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3">Links &amp; Portfolio</p>
                <div className="flex flex-wrap gap-3">
                  {profile.linkedin_url && <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    <ExternalLink className="w-3 h-3" /> LinkedIn</a>}
                  {profile.github_url && <a href={profile.github_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                    <ExternalLink className="w-3 h-3" /> GitHub</a>}
                  {profile.portfolio_url && <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                    <ExternalLink className="w-3 h-3" /> Portfolio</a>}
                </div>
              </div>
            )}

            {/* Section: Notes */}
            {profile.notes && (
              <div className="mb-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Notes</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{profile.notes}</p>
              </div>
            )}

            {/* Profile Updated Date */}
            <div className="text-center mt-4">
              <p className="text-[9px] text-slate-600">
                Profile last updated: {formatDate(profile.created_at)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export function CertificateVerifyPage() {
  const { code: urlCode } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [searchCode, setSearchCode] = useState(urlCode || '');
  const [verifying, setVerifying] = useState(false);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [internProfile, setInternProfile] = useState<InternProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(!!urlCode);

  const handleVerify = useCallback(async (code?: string) => {
    const codeToVerify = (code || searchCode).trim();
    if (!codeToVerify) { setError('Please enter a verification code'); return; }
    setVerifying(true); setError(null); setCertificate(null); setSearched(true);
    try {
      const result = await verifyCertificateByCode(codeToVerify);
      if (result.valid && result.certificate) {
        setCertificate(result.certificate);
        setInternProfile(result.internProfile || null);
      } else {
        setCertificate(null); setInternProfile(null);
        setError(result.error || 'Certificate not found.');
      }
    } catch { setError('Verification failed.'); }
    finally { setVerifying(false); }
  }, [searchCode]);

  // Auto-verify if code in URL
  useEffect(() => { if (urlCode) handleVerify(urlCode); }, [urlCode, handleVerify]);

  // --- VERIFICATION MODE (code in URL or searched) ---
  if (searched) {
    // Revoked / Expired state
    if (certificate && certificate.status !== 'active') {
      return (
        <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="mx-auto w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              Certificate {certificate.status === 'revoked' ? 'Revoked' : 'Expired'}
            </h1>
            <p className="text-slate-400 text-sm">
              {certificate.status === 'revoked'
                ? `This certificate was revoked${certificate.revoked_reason ? ` for: "${certificate.revoked_reason}"` : ''}.`
                : 'This certificate has expired.'}
            </p>
            <button onClick={() => navigate('/certificate')}
              className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 font-bold transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Certificate Hub
            </button>
          </div>
        </div>
      );
    }

    // Verification result
    return (
      <div className="min-h-screen bg-[#0F172A]">
        <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/UpdatedLogo.webp" alt="" className="h-8 w-8 rounded-lg" />
              <span className="text-sm font-bold text-white">Growlancer</span>
              <span className="text-[9px] ml-2 uppercase tracking-widest text-emerald-400 font-bold">Certificate Verification</span>
            </div>
            <a href="/certificate" className="text-xs text-slate-400 hover:text-white transition-colors">← Back to Hub</a>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-12 md:py-20">
          {verifying ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
            </div>
          ) : certificate ? (
            <>
              <CertificateCard cert={certificate} />
              {internProfile && <InternProfileCard profile={internProfile} />}
            </>
          ) : error ? (
            <div className="text-center py-16">
              <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Certificate Not Found</h2>
              <p className="text-slate-400 text-sm">{error}</p>
              <button onClick={() => navigate('/certificate')}
                className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 font-bold transition-colors">
                <ArrowLeft className="w-4 h-4" /> Try Another Code
              </button>
            </div>
          ) : null}
          {/* Trust Badge */}
          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-6 px-8 py-4 rounded-2xl bg-slate-800/30 border border-white/5">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Digitally Verified</span>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Real-Time</span>
              </div>
              <div className="w-px h-6 bg-white/5" />
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tamper-Proof</span>
              </div>
            </div>
          </div>

          {/* Legal Disclaimer */}
          <div className="mt-6 max-w-2xl mx-auto p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">Important Notice</p>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  This certificate verification page is hosted on the Growlancer platform at the current domain. 
                  In the event of a domain change, platform migration, or service discontinuation, this verification 
                  page and its associated records may be removed or relocated. We recommend keeping a PDF copy of 
                  your certificate for your records. Growlancer reserves the right to modify or discontinue this 
                  verification service at any time without prior notice.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- LANDING MODE (no code — show clean hub with search) ---
  return (
    <div className="min-h-screen bg-[#0F172A]">
      <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/UpdatedLogo.webp" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-bold text-white">Growlancer</span>
            <span className="text-[9px] ml-2 uppercase tracking-widest text-emerald-400 font-bold">Certificate Hub</span>
          </div>
          <a href="/" className="text-xs text-slate-400 hover:text-white transition-colors">← Home</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 md:py-20">
        {/* Hero */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Certificate <span className="text-emerald-400">Verification</span>
          </h1>
          <p className="text-slate-400 max-w-md mx-auto text-sm">
            Enter your verification code below to view and verify your certificate in real-time.
          </p>
        </div>

        {/* Search */}
        <div className="max-w-xl mx-auto mb-10">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input type="text" value={searchCode} onChange={e => setSearchCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleVerify(); }}
                placeholder="Enter code (e.g., GRW-CERT-XXXXX)"
                className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono tracking-wider uppercase" />
            </div>
            <button onClick={() => handleVerify()} disabled={verifying || !searchCode.trim()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all">
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
            </button>
          </div>
          {error && (
            <div className="mt-3 p-3 rounded-xl bg-red-500/5 border border-red-500/10 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-400 uppercase">Not Found</p>
                <p className="text-xs text-slate-400">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          <div className="p-5 rounded-2xl bg-slate-800/30 border border-white/5 text-center">
            <div className="mx-auto w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3">
              <BadgeCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Real-Time Verify</h3>
            <p className="text-[11px] text-slate-400">Instant certificate verification with live data from our secure database.</p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-800/30 border border-white/5 text-center">
            <div className="mx-auto w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-3">
              <Star className="w-5 h-5 text-violet-400" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Certificates & LOR</h3>
            <p className="text-[11px] text-slate-400">Verify internship certificates and letters of recommendation issued by Growlancer.</p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-800/30 border border-white/5 text-center">
            <div className="mx-auto w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
              <User className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Intern Details</h3>
            <p className="text-[11px] text-slate-400">View full intern profile including role, education, and skills alongside your certificate.</p>
          </div>
        </div>

        {/* How it works */}
        <div className="max-w-2xl mx-auto mt-12 p-6 rounded-2xl bg-slate-800/20 border border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
          <h3 className="text-sm font-bold text-white text-center mb-4">How Verification Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { step: '1', title: 'Get Your Code', desc: 'Your employer will send you a unique verification code via email.', icon: <Mail className="w-4 h-4 text-emerald-400" /> },
              { step: '2', title: 'Enter Code', desc: 'Type or paste the code in the search bar above and click Verify.', icon: <Search className="w-4 h-4 text-emerald-400" /> },
              { step: '3', title: 'View Certificate', desc: 'Your certificate and intern profile will appear in real-time, ready to share.', icon: <BadgeCheck className="w-4 h-4 text-emerald-400" /> },
            ].map((item, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05] text-center">
                <div className="mx-auto w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                  {item.icon}
                </div>
                <h4 className="text-xs font-bold text-white mb-1">{item.title}</h4>
                <p className="text-[10px] text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust Badge */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-6 px-8 py-4 rounded-2xl bg-slate-800/30 border border-white/5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Digitally Verified</span>
            </div>
            <div className="w-px h-6 bg-white/5" />
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Real-Time</span>
            </div>
            <div className="w-px h-6 bg-white/5" />
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Public Access</span>
            </div>
          </div>
        </div>

        {/* Legal Disclaimer */}
        <div className="mt-6 max-w-2xl mx-auto p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">Important Notice</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                This certificate verification page is hosted on the Growlancer platform at the current domain. 
                In the event of a domain change, platform migration, or service discontinuation, this verification 
                page and its associated records may be removed or relocated. We recommend keeping a PDF copy of 
                your certificate for your records. Growlancer reserves the right to modify or discontinue this 
                verification service at any time without prior notice.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
