import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Award, Shield, XCircle, Loader2, Search,
  User, Calendar, Clock, Copy, CheckCheck, AlertTriangle,
  Share2, Printer, Sparkles, BookOpen, Zap, BadgeCheck, ArrowLeft, Star,
  ExternalLink, QrCode, Briefcase, Users, Mail, GraduationCap,
  ChevronDown, ChevronUp, Phone, Building, MapPin, Code2, CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { verifyCertificateByCode, issueCertificate, revokeCertificate, getAllCertificates, sendCertificateEmail,
  CERT_LEVEL_STYLES, getCertificateTitle, type Certificate, type CertificateType, type InternProfile } from '../lib/certificateService';
import { supabase } from '../lib/supabase';
import { adminDelete } from '../lib/adminDataProxy';

// ─── Types ──────────────────────────────────────────────────────────
type ApplicationStatus = 'applied' | 'shortlisted' | 'interview_scheduled' | 'selected' | 'rejected';

interface InternshipAppUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  university: string | null;
  degree: string | null;
  role_id: string;
  role_name: string;
  status: ApplicationStatus;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  resume_url: string | null;
  cover_letter: string;
  why_growlancer: string | null;
  google_meet_link: string | null;
  interview_time: string | null;
  weekly_availability: number | null;
  available_from: string | null;
  available_to: string | null;
  notes: string | null;
  offer_letter_url: string | null;
  nda_url: string | null;
  internship_letter_url: string | null;
  created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtShort(dateStr);
}

const STATUS_COLORS: Record<string, string> = {
  applied: 'bg-blue-500/10 text-blue-400',
  shortlisted: 'bg-amber-500/10 text-amber-400',
  interview_scheduled: 'bg-purple-500/10 text-purple-400',
  selected: 'bg-emerald-500/10 text-emerald-400',
  rejected: 'bg-red-500/10 text-red-400',
};
const STATUS_LABELS: Record<string, string> = {
  applied: 'Applied', shortlisted: 'Shortlisted', interview_scheduled: 'Interview', selected: 'Selected', rejected: 'Rejected',
};

const typeIcons: Record<string, React.ReactNode> = {
  platform: <Award className="w-5 h-5" />, skill_test: <BookOpen className="w-5 h-5" />,
  internship: <Zap className="w-5 h-5" />, achievement: <Sparkles className="w-5 h-5" />, lor: <Star className="w-5 h-5" />,
};
const typeLabels: Record<string, string> = {
  platform: 'Platform Certificate', skill_test: 'Skill Certification',
  internship: 'Internship Completion', achievement: 'Achievement Badge', lor: 'Letter of Recommendation',
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
      {/* Card */}
      <div className="relative overflow-hidden rounded-[2rem] p-[2px] animate-in fade-in slide-in-from-bottom-4 duration-500"
        style={{ background: isLOR ? 'linear-gradient(135deg, #7c3aed, #6d28d9, #5b21b6)' : 'linear-gradient(135deg, #10B981, #059669, #047857)' }}>
        <div className="relative bg-[#0F172A] rounded-[calc(2rem-2px)] p-8 md:p-12">
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none">
            {isLOR ? <Star className="w-64 h-64 text-violet-500" /> : <Award className="w-64 h-64 text-emerald-500" />}
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <img src="/UpdatedLogo.png" alt="Growlancer" className="h-10 w-10 rounded-xl" />
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
            <div className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full mx-auto" style={{ background: levelStyle.bg, border: `1px solid ${levelStyle.border || 'transparent'}70` }}>
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
                <div><p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Recipient</p><p className="text-sm font-semibold text-white">{cert.recipient_name}</p><p className="text-xs text-slate-400">{cert.recipient_email}</p></div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <Calendar className={`w-4 h-4 mt-0.5 shrink-0 ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`} />
                <div><p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Issued On</p><p className="text-sm font-semibold text-white">{issuedDate}</p><p className="text-xs text-slate-400">{issueRelative}</p></div>
              </div>
              {!isLOR && (
                <>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <Award className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Level</p><p className={`text-sm font-semibold ${levelStyle.color}`}>{levelStyle.label}</p></div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    {cert.certificate_type && typeIcons[cert.certificate_type] && <span className="text-emerald-400 mt-0.5 shrink-0">{typeIcons[cert.certificate_type]}</span>}
                    <div><p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Type</p><p className="text-sm font-semibold text-white">{typeLabels[cert.certificate_type] || cert.certificate_type}</p></div>
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
                <button onClick={handleCopyLink} className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 transition-colors">
                  {copied ? <><CheckCheck className="w-3 h-3 text-emerald-400" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Link</>}
                </button>
              </div>
              <p className={`mt-2 text-lg font-mono font-bold tracking-wider select-all ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`}>{cert.verification_code}</p>
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
      <div className="flex items-center justify-center gap-3 mt-6">
        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-xl text-xs font-bold text-slate-300 transition-all">
          <Printer className="w-4 h-4" /> Print
        </button>
        <button onClick={handleCopyLink} className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-xl text-xs font-bold text-slate-300 transition-all">
          {copied ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>
    </div>
  );
}

// ─── Intern Profile Card ────────────────────────────────────────────
function InternProfileCard({ profile }: { profile: InternProfile }) {
  return (
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
              {[
                { label: 'Full Name', value: profile.full_name },
                { label: 'Email', value: profile.email },
                { label: 'Role / Position', value: profile.role_name, accent: true },
                { label: 'Status', value: profile.status?.replace('_', ' ') || 'N/A', accent2: true },
                ...(profile.university ? [{ label: 'University', value: profile.university }] : []),
                ...(profile.degree ? [{ label: 'Degree', value: profile.degree }] : []),
                ...(profile.country ? [{ label: 'Country', value: profile.country }] : []),
                ...(profile.phone ? [{ label: 'Phone', value: profile.phone }] : []),
              ].map((item, i) => (
                <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">{item.label}</p>
                  <p className={`text-sm font-semibold ${item.accent ? 'text-emerald-400' : item.accent2 ? 'text-amber-400 capitalize' : 'text-white'}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
            {(profile.linkedin_url || profile.github_url || profile.portfolio_url) && (
              <div className="mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-3">Links</p>
                <div className="flex flex-wrap gap-3">
                  {profile.linkedin_url && <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"><ExternalLink className="w-3 h-3" /> LinkedIn</a>}
                  {profile.github_url && <a href={profile.github_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"><ExternalLink className="w-3 h-3" /> GitHub</a>}
                  {profile.portfolio_url && <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"><ExternalLink className="w-3 h-3" /> Portfolio</a>}
                </div>
              </div>
            )}
            {profile.created_at && <div className="mt-4 text-center"><p className="text-[10px] text-slate-600">Applied: {formatDate(profile.created_at)}</p></div>}
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
  const toast = { success: (t: string, m: string) => {}, error: (t: string, m: string) => {}, warning: (t: string, m: string) => {} };

  // Verification state
  const [searchCode, setSearchCode] = useState(urlCode || '');
  const [verifying, setVerifying] = useState(false);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [internProfile, setInternProfile] = useState<InternProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(!!urlCode);

  // Management state (for /certificate without code)
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [interns, setInterns] = useState<InternshipAppUser[]>([]);
  const [loadingInterns, setLoadingInterns] = useState(false);
  const [internSearch, setInternSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<Record<string, { code: string; url: string; type: string; loading: boolean }>>({});
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Auto-verify if code in URL
  useEffect(() => { if (urlCode) handleVerify(urlCode); }, [urlCode]);

  const handleVerify = async (code?: string) => {
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
  };

  // Admin auth
  const handleAdminLogin = () => {
    if (adminPass === 'growlancer2024') {
      setAuthenticated(true);
      fetchInterns();
      fetchCertsList();
    } else {
      alert('Incorrect password');
    }
  };

  const fetchInterns = useCallback(async () => {
    setLoadingInterns(true);
    try {
      const { data, error } = await supabase.functions.invoke('internship-applications', { method: 'GET' });
      if (error) throw error;
      setInterns((data?.applications || []) as InternshipAppUser[]);
    } catch { setInterns([]); }
    finally { setLoadingInterns(false); }
  }, []);

  const fetchCertsList = useCallback(async () => {
    const c = await getAllCertificates();
    setCerts(c);
  }, []);

  const handleGenerateCode = async (app: InternshipAppUser, type: CertificateType) => {
    const isLOR = type === 'lor';
    const key = `${app.id}-${type}`;
    setGeneratedCodes(p => ({ ...p, [key]: { code: '', url: '', type: isLOR ? 'LOR' : 'Certificate', loading: true } }));
    try {
      const result = await issueCertificate({
        userId: app.id, skill: app.role_name || 'Internship',
        level: isLOR ? 'advanced' : 'intermediate',
        recipientName: app.full_name, recipientEmail: app.email, type,
        certificateUrl: undefined,
        metadata: { performance_summary: isLOR ? `Top performer during ${app.role_name} internship.` : undefined, skills_demonstrated: [], application_id: app.id },
      });
      if (result.success && result.certificate) {
        const verifyUrl = `${window.location.origin}/certificate/${result.certificate.verification_code}`;
        setGeneratedCodes(p => ({ ...p, [key]: { code: result.certificate!.verification_code, url: verifyUrl, type: isLOR ? 'LOR' : 'Certificate', loading: false } }));
        fetchCertsList();
      } else throw new Error(result.error || 'Failed');
    } catch (err) {
      setGeneratedCodes(p => ({ ...p, [key]: { code: '', url: '', type: isLOR ? 'LOR' : 'Certificate', loading: false } }));
    }
  };

  const filteredInterns = interns.filter(a => {
    const q = internSearch.toLowerCase();
    return a.full_name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q) || a.role_name.toLowerCase().includes(q);
  });

  // --- VERIFICATION MODE (code in URL or searched) ---
  if (searched) {
    if (certificate && certificate.status !== 'active') {
      return (
        <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="mx-auto w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-white">Certificate {certificate.status === 'revoked' ? 'Revoked' : 'Expired'}</h1>
            <p className="text-slate-400 text-sm">{certificate.status === 'revoked' ? `This certificate was revoked${certificate.revoked_reason ? ` for: "${certificate.revoked_reason}"` : ''}.` : 'This certificate has expired.'}</p>
            <button onClick={() => navigate('/certificate')} className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 font-bold transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Certificate Hub
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#0F172A]">
        <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/UpdatedLogo.png" alt="" className="h-8 w-8 rounded-lg" />
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
          ) : null}
          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-6 px-8 py-4 rounded-2xl bg-slate-800/30 border border-white/5">
              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Digitally Verified</span></div>
              <div className="w-px h-6 bg-white/5" />
              <div className="flex items-center gap-2"><Lock className="w-4 h-4 text-emerald-400" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tamper-Proof</span></div>
              <div className="w-px h-6 bg-white/5" />
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-emerald-400" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Real-Time</span></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- MANAGEMENT MODE (no code - show hub + interns) ---
  return (
    <div className="min-h-screen bg-[#0F172A]">
      <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/UpdatedLogo.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-bold text-white">Growlancer</span>
            <span className="text-[9px] ml-2 uppercase tracking-widest text-emerald-400 font-bold">Certificate Hub</span>
          </div>
          <a href="/" className="text-xs text-slate-400 hover:text-white transition-colors">← Home</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Certificate <span className="text-emerald-400">Hub</span>
          </h1>
          <p className="text-slate-400 max-w-xl mx-auto text-sm">
            Verify certificates, manage interns, and generate QR codes — all in one place.
          </p>
        </div>

        {/* Search bar for verification */}
        <div className="max-w-xl mx-auto mb-8">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input type="text" value={searchCode} onChange={e => setSearchCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleVerify(); }}
                placeholder="Enter code to verify (e.g., GRW-CERT-XXXXX)"
                className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono tracking-wider uppercase" />
            </div>
            <button onClick={() => handleVerify()} disabled={verifying || !searchCode.trim()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all">
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
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

        {/* Admin Login Toggle */}
        <div className="text-center mb-8">
          {!authenticated ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 rounded-xl border border-white/5">
              <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
                placeholder="Admin password" className="bg-transparent border-none text-xs text-white placeholder:text-slate-600 focus:outline-none w-32" />
              <button onClick={handleAdminLogin} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-all">
                Unlock Management
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400">Management Mode Active</span>
              <button onClick={() => { setAuthenticated(false); setInterns([]); }} className="ml-2 text-[10px] text-slate-500 hover:text-white">Lock</button>
            </div>
          )}
        </div>

        {/* Management Section — Interns */}
        {authenticated && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                Interns ({interns.length})
              </h2>
              <button onClick={() => { fetchInterns(); fetchCertsList(); }} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="text" value={internSearch} onChange={e => setInternSearch(e.target.value)}
                placeholder="Search interns by name, email, or role..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
            </div>

            {/* Interns List */}
            <div className="space-y-3">
              {loadingInterns ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>
              ) : filteredInterns.length === 0 ? (
                <div className="text-center py-16 text-slate-500 bg-slate-800/30 rounded-2xl border border-white/5">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No interns found</p>
                </div>
              ) : (
                filteredInterns.map(app => (
                  <div key={app.id} className="rounded-2xl overflow-hidden transition-all" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* Header */}
                    <div className="p-4 cursor-pointer" onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="h-10 w-10 rounded-xl bg-slate-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                            {app.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <h3 className="font-bold text-white text-sm">{app.full_name}</h3>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[app.status]}`}>{STATUS_LABELS[app.status]}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                              <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{app.role_name}</span>
                              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{app.email}</span>
                            </div>
                          </div>
                        </div>
                        {expandedId === app.id ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                      </div>
                    </div>

                    {/* Expanded */}
                    {expandedId === app.id && (
                      <div className="border-t border-white/5 px-4 py-4 space-y-4 animate-fade-in">
                        {/* Generate Codes */}
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                          <div className="flex items-center gap-2 mb-3">
                            <QrCode className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Generate QR Code URL</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mb-3">
                            <button onClick={() => handleGenerateCode(app, 'internship')}
                              disabled={generatedCodes[`${app.id}-internship`]?.loading}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-bold hover:bg-amber-500/20 disabled:opacity-30 transition-all">
                              {generatedCodes[`${app.id}-internship`]?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <GraduationCap className="w-3 h-3" />}
                              Certificate Code
                            </button>
                            <button onClick={() => handleGenerateCode(app, 'lor')}
                              disabled={generatedCodes[`${app.id}-lor`]?.loading}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 text-[10px] font-bold hover:bg-violet-500/20 disabled:opacity-30 transition-all">
                              {generatedCodes[`${app.id}-lor`]?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                              LOR Code
                            </button>
                          </div>

                          {/* Generated URL - Certificate */}
                          {generatedCodes[`${app.id}-internship`]?.url && (
                            <div className="p-3 rounded-lg" style={{ background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.2)' }}>
                              <div className="flex items-start gap-3">
                                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(generatedCodes[`${app.id}-internship`]!.url)}`}
                                  alt="QR" className="w-14 h-14 rounded-lg shrink-0 bg-white p-1" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <span className="text-xs font-bold text-emerald-400">Certificate URL</span>
                                    <button onClick={() => { navigator.clipboard.writeText(generatedCodes[`${app.id}-internship`]!.url); setCopiedId(`cert-${app.id}`); setTimeout(() => setCopiedId(null), 2000); }}
                                      className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 shrink-0">
                                      {copiedId === `cert-${app.id}` ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                      {copiedId === `cert-${app.id}` ? 'Copied!' : 'Copy'}
                                    </button>
                                  </div>
                                  <a href={generatedCodes[`${app.id}-internship`]!.url} target="_blank" rel="noopener noreferrer"
                                    className="block text-[10px] font-mono text-emerald-400/70 hover:text-emerald-300 truncate">{generatedCodes[`${app.id}-internship`]!.url}</a>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Generated URL - LOR */}
                          {generatedCodes[`${app.id}-lor`]?.url && (
                            <div className="mt-2 p-3 rounded-lg" style={{ background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
                              <div className="flex items-start gap-3">
                                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(generatedCodes[`${app.id}-lor`]!.url)}`}
                                  alt="QR" className="w-14 h-14 rounded-lg shrink-0 bg-white p-1" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <span className="text-xs font-bold text-violet-400">LOR URL</span>
                                    <button onClick={() => { navigator.clipboard.writeText(generatedCodes[`${app.id}-lor`]!.url); setCopiedId(`lor-${app.id}`); setTimeout(() => setCopiedId(null), 2000); }}
                                      className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 shrink-0">
                                      {copiedId === `lor-${app.id}` ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                      {copiedId === `lor-${app.id}` ? 'Copied!' : 'Copy'}
                                    </button>
                                  </div>
                                  <a href={generatedCodes[`${app.id}-lor`]!.url} target="_blank" rel="noopener noreferrer"
                                    className="block text-[10px] font-mono text-violet-400/70 hover:text-violet-300 truncate">{generatedCodes[`${app.id}-lor`]!.url}</a>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Existing Certs */}
                        {certs.filter(c => c.user_id === app.id && c.status === 'active').length > 0 && (
                          <div className="p-3 rounded-xl" style={{ background: 'rgba(5, 150, 105, 0.05)', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Issued Certificates</p>
                            <div className="flex flex-wrap gap-2">
                              {certs.filter(c => c.user_id === app.id && c.status === 'active').map(c => (
                                <span key={c.id} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
                                  <Award className="w-3 h-3" /> {getCertificateTitle(c)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Contact + Education */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-3 rounded-xl" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Contact</h4>
                            <div className="space-y-1.5 text-xs">
                              <p className="flex items-center gap-2 text-slate-300"><Mail className="w-3 h-3 text-slate-500" />{app.email}</p>
                              {app.phone && <p className="flex items-center gap-2 text-slate-300"><Phone className="w-3 h-3 text-slate-500" />{app.phone}</p>}
                              {app.country && <p className="flex items-center gap-2 text-slate-300"><MapPin className="w-3 h-3 text-slate-500" />{app.country}</p>}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Links</h4>
                            <div className="space-y-1.5 text-xs">
                              {app.linkedin_url && <p className="flex items-center gap-2"><ExternalLink className="w-3 h-3 text-blue-400" /><a href={app.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-emerald-400 truncate">LinkedIn</a></p>}
                              {app.github_url && <p className="flex items-center gap-2"><Code2 className="w-3 h-3 text-slate-400" /><a href={app.github_url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-emerald-400 truncate">GitHub</a></p>}
                              {app.portfolio_url && <p className="flex items-center gap-2"><ExternalLink className="w-3 h-3 text-slate-400" /><a href={app.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-emerald-400 truncate">Portfolio</a></p>}
                              {!app.linkedin_url && !app.github_url && !app.portfolio_url && <p className="text-slate-600">No links</p>}
                            </div>
                          </div>
                        </div>
                        {(app.university || app.degree) && (
                          <div className="p-3 rounded-xl" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Education</h4>
                            <div className="space-y-1.5 text-xs">
                              {app.university && <p className="flex items-center gap-2 text-slate-300"><Building className="w-3 h-3 text-slate-500" />{app.university}</p>}
                              {app.degree && <p className="flex items-center gap-2 text-slate-300"><GraduationCap className="w-3 h-3 text-slate-500" />{app.degree}</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Trust Badge */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-6 px-8 py-4 rounded-2xl bg-slate-800/30 border border-white/5">
            <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-400" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Digitally Verified</span></div>
            <div className="w-px h-6 bg-white/5" />
            <div className="flex items-center gap-2"><Lock className="w-4 h-4 text-emerald-400" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tamper-Proof</span></div>
            <div className="w-px h-6 bg-white/5" />
            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-emerald-400" /><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Real-Time</span></div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Lock icon
function Lock(props: React.SVGProps<SVGSVGElement>) {
  return (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>);
}
