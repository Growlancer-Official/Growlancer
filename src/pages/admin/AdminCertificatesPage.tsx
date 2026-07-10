import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Award, Search, Loader2, RefreshCw, User, Mail, AlertTriangle,
  CheckCircle2, ExternalLink, FileText, Calendar,
  Ban, Copy, CheckCheck, Trash2,
  Send, QrCode, Star, Link2, GraduationCap, Briefcase, Users,
  FileUp, ChevronDown, ChevronUp,
  Phone, Building, MapPin, Code2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { adminQuery, adminDelete } from '../../lib/adminDataProxy';
import {
  issueCertificate, revokeCertificate, getAllCertificates, sendCertificateEmail,
  type Certificate, CERT_LEVEL_STYLES, getCertificateTitle,
} from '../../lib/certificateService';

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
  return formatDate(dateStr);
}

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400',
  revoked: 'bg-red-500/10 text-red-400',
  expired: 'bg-slate-500/10 text-slate-400',
};

const typeStyles: Record<string, string> = {
  skill_test: 'bg-blue-500/10 text-blue-400',
  platform: 'bg-purple-500/10 text-purple-400',
  internship: 'bg-amber-500/10 text-amber-400',
  achievement: 'bg-emerald-500/10 text-emerald-400',
  lor: 'bg-violet-500/10 text-violet-400',
};

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  applied: 'bg-blue-500/10 text-blue-400',
  shortlisted: 'bg-amber-500/10 text-amber-400',
  interview_scheduled: 'bg-purple-500/10 text-purple-400',
  selected: 'bg-emerald-500/10 text-emerald-400',
  rejected: 'bg-red-500/10 text-red-400',
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview Scheduled',
  selected: 'Selected',
  rejected: 'Rejected',
};

// ─── Main Admin Certificates Page ───────────────────────────────────
export function AdminCertificatesPage() {
  const [activeTab, setActiveTab] = useState<'interns' | 'certs'>('interns');
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedCertId, setExpandedCertId] = useState<string | null>(null);
  const [certEmailLogs, setCertEmailLogs] = useState<Record<string, { type: string; sent: boolean; time: string }[]>>({});
  const [certUploadingPdf, setCertUploadingPdf] = useState<Record<string, { loading: boolean }>>({});

  // Internship Applicants State
  const [internApplicants, setInternApplicants] = useState<InternshipAppUser[]>([]);
  const [loadingInterns, setLoadingInterns] = useState(false);
  const [internSearch, setInternSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toast = useToast();
  // Track generated verification codes per intern
  const [generatedCodes, setGeneratedCodes] = useState<Record<string, { code: string; url: string; type: string; loading: boolean }>>({});

  const handleGenerateCode = async (app: InternshipAppUser, type: 'internship' | 'lor') => {
    const isLOR = type === 'lor';
    const key = `${app.id}-${type}`;
    setGeneratedCodes(prev => ({ ...prev, [key]: { code: '', url: '', type: isLOR ? 'LOR' : 'Certificate', loading: true } }));
    try {
      const uniqueCode = 'GRW-' + (isLOR ? 'LOR-' : 'CERT-') + Array.from({length: 8}, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
      
      // Create certificate record in DB
      const result = await issueCertificate({
        userId: app.id,
        skill: app.role_name || 'Internship',
        level: isLOR ? 'advanced' : 'intermediate',
        recipientName: app.full_name,
        recipientEmail: app.email,
        type,
        certificateUrl: undefined,
        metadata: {
          performance_summary: isLOR ? `Top performer during ${app.role_name} internship.` : undefined,
          skills_demonstrated: [],
          application_id: app.id,
        },
      });

      if (result.success && result.certificate) {
        const actualCode = result.certificate.verification_code;
        const verifyUrl = `${window.location.origin}/certificate/${actualCode}`;
        setGeneratedCodes(prev => ({ ...prev, [key]: { code: actualCode, url: verifyUrl, type: isLOR ? 'LOR' : 'Certificate', loading: false } }));
        toast.success('Code Generated!', `${isLOR ? 'LOR' : 'Certificate'} verification code created for ${app.full_name}`);
        fetchCerts();
      } else {
        throw new Error(result.error || 'Failed to generate code');
      }
    } catch (err) {
      setGeneratedCodes(prev => ({ ...prev, [key]: { code: '', url: '', type: isLOR ? 'LOR' : 'Certificate', loading: false } }));
      toast.error('Failed', err instanceof Error ? err.message : 'Could not generate code');
    }
  };

  const fetchCerts = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const certs = await getAllCertificates();
      setCertificates(certs);
    } catch { /* ignore */ }
    finally { if (showLoading) setLoading(false); }
  }, []);

  const fetchInternApplicants = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadingInterns(true);
    try {
      // Use the dedicated internship-applications edge function (same as AdminInternshipsPage)
      const { data: fnData, error } = await supabase.functions.invoke(
        'internship-applications',
        { method: 'GET' }
      );
      
      if (error) throw error;
      setInternApplicants((fnData?.applications || []) as InternshipAppUser[]);
    } catch (err) {
      console.error('Failed to fetch internship applicants:', err);
      setInternApplicants([]);
    } finally { if (showLoading) setLoadingInterns(false); }
  }, []);

  useEffect(() => { 
    fetchCerts(); 
    fetchInternApplicants();
  }, [fetchCerts, fetchInternApplicants]);

  // Polling fallback for cross-session sync (replaces realtime WebSocket which requires Supabase JWT)
  const isActiveRef = useRef(false);
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isActiveRef.current && !actionLoading && !expandedId && !expandedCertId && Object.keys(uploadingDoc).length === 0 && Object.keys(certUploadingPdf).length === 0) {
        fetchCerts(false);
        fetchInternApplicants(false);
      }
    }, 25000);
    return () => clearInterval(interval);
  }, [fetchCerts, fetchInternApplicants, actionLoading, expandedId, expandedCertId, uploadingDoc, certUploadingPdf]);

  // Track when user is actively interacting
  useEffect(() => {
    isActiveRef.current = !!expandedId || !!expandedCertId || !!actionLoading || Object.keys(uploadingDoc).length > 0 || Object.keys(certUploadingPdf).length > 0;
  }, [expandedId, expandedCertId, actionLoading, uploadingDoc, certUploadingPdf]);

  const handleDeleteCert = async (certId: string, skill: string, userName: string) => {
    if (!confirm(`PERMANENTLY DELETE "${skill}" certificate for ${userName}? This cannot be undone!`)) return;
    setActionLoading(`delete-${certId}`);
    try {
      await adminDelete('skill_certifications', certId);
      await fetchCerts();
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const handleRevoke = async (certId: string, skill: string, userName: string) => {
    const reason = prompt(`Reason for revoking "${skill}" certificate for ${userName}:`);
    if (!reason) return;
    setActionLoading(`revoke-${certId}`);
    await revokeCertificate(certId, reason);
    await fetchCerts();
    setActionLoading(null);
  };

  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  const handleCopyLink = (cert: Certificate) => {
    const url = `${window.location.origin}/verify-certificate/${cert.verification_code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(cert.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSendCertEmail = async (cert: Certificate) => {
    if (!confirm(`Send email to ${cert.recipient_name} (${cert.recipient_email}) with their ${cert.certificate_type === 'lor' ? 'Letter of Recommendation' : 'Certificate'}?`)) return;
    setSendingEmail(cert.id);
    try {
      // Fetch the full certificate from DB to get the latest certificate_url
      let certificateUrl = cert.certificate_url;
      if (!certificateUrl) {
        const { data: fnData } = await supabase.functions.invoke('admin-data', {
          method: 'POST',
          body: {
            action: 'query',
            table: 'skill_certifications',
            select: 'certificate_url',
            filters: { id: cert.id },
            limit: 1,
          },
        });
        if (fnData?.data?.[0]?.certificate_url) {
          certificateUrl = fnData.data[0].certificate_url;
        }
      }

      const result = await sendCertificateEmail({
        certificateId: cert.id,
        recipientEmail: cert.recipient_email,
        recipientName: cert.recipient_name,
        certificateType: cert.certificate_type,
        roleName: cert.skill,
        level: cert.level,
        verificationCode: cert.verification_code,
        certificateUrl: certificateUrl || undefined,
        performanceSummary: (cert.metadata as any)?.performance_summary || '',
        skillsDemonstrated: (cert.metadata as any)?.skills_demonstrated || [],
      });
      if (result.success) {
        toast.success('Email Sent', `Certificate email sent to ${cert.recipient_name}`);
        setCertEmailLogs(prev => ({
          ...prev,
          [cert.id]: [...(prev[cert.id] || []), { type: cert.certificate_type === 'lor' ? 'LOR' : 'Certificate', sent: true, time: new Date().toISOString() }],
        }));
      } else {
        toast.error('Email Failed', result.error || 'Failed to send email');
        setCertEmailLogs(prev => ({
          ...prev,
          [cert.id]: [...(prev[cert.id] || []), { type: cert.certificate_type === 'lor' ? 'LOR' : 'Certificate', sent: false, time: new Date().toISOString() }],
        }));
      }
    } catch {
      toast.error('Email Failed', 'An unexpected error occurred');
      setCertEmailLogs(prev => ({
        ...prev,
        [cert.id]: [...(prev[cert.id] || []), { type: 'Email', sent: false, time: new Date().toISOString() }],
      }));
    } finally {
      setSendingEmail(null);
    }
  };

  const filtered = certificates.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.recipient_name?.toLowerCase().includes(q) ||
      c.recipient_email?.toLowerCase().includes(q) ||
      c.skill?.toLowerCase().includes(q) ||
      c.verification_code?.toLowerCase().includes(q)
    ) && (statusFilter === 'all' || c.status === statusFilter);
  });

  const filteredInterns = internApplicants.filter(a => {
    const q = internSearch.toLowerCase();
    return (
      a.full_name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      a.role_name.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: certificates.length,
    active: certificates.filter(c => c.status === 'active').length,
    revoked: certificates.filter(c => c.status === 'revoked').length,
  };

  const internStats = {
    total: internApplicants.length,
    applied: internApplicants.filter(a => a.status === 'applied').length,
    shortlisted: internApplicants.filter(a => a.status === 'shortlisted').length,
    interview: internApplicants.filter(a => a.status === 'interview_scheduled').length,
    selected: internApplicants.filter(a => a.status === 'selected').length,
    rejected: internApplicants.filter(a => a.status === 'rejected').length,
  };

  const verifyUrl = (cert: Certificate) => `${window.location.origin}/verify-certificate/${cert.verification_code}`;

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Certificate System</h1>
          <p className="text-slate-400 text-sm mt-1">Generate verification codes & send certificates/LORs to interns</p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={() => setActiveTab('interns')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'interns'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-4 h-4" />
          Internship Applicants ({internApplicants.length})
        </button>
        <button
          onClick={() => setActiveTab('certs')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'certs'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Award className="w-4 h-4" />
          All Certificates ({stats.total})
        </button>
      </div>

      {/* Tab: Internship Applicants */}
      {activeTab === 'interns' && (
        <div className="space-y-4">
          {/* Intern Stats */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[
              { label: 'Total', value: internStats.total, color: 'text-slate-100' },
              { label: 'Applied', value: internStats.applied, color: 'text-blue-400' },
              { label: 'Shortlisted', value: internStats.shortlisted, color: 'text-amber-400' },
              { label: 'Interview', value: internStats.interview, color: 'text-purple-400' },
              { label: 'Selected', value: internStats.selected, color: 'text-emerald-400' },
              { label: 'Rejected', value: internStats.rejected, color: 'text-red-400' },
            ].map((stat, i) => (
              <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" value={internSearch} onChange={e => setInternSearch(e.target.value)}
              placeholder="Search interns by name, email, or role..."
              className="w-full pl-9 pr-3 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }} />
          </div>

          {/* Applicants List */}
          <div className="space-y-3">
            {loadingInterns ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
              </div>
            ) : filteredInterns.length === 0 ? (
              <div className="text-center py-16 text-slate-500" style={{ background: '#1E293B', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No internship applicants found</p>
                <p className="text-xs text-slate-600 mt-1">Applicants will appear here once they apply for internships</p>
              </div>
            ) : (
              filteredInterns.map(app => (
                <div key={app.id} className="rounded-2xl overflow-hidden transition-all duration-200"
                  style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                  
                  {/* Card Header - Always visible */}
                  <div className="p-5 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className="h-12 w-12 rounded-xl bg-slate-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                          {app.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-bold text-white text-sm">{app.full_name}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[app.status]}`}>
                              {STATUS_LABELS[app.status]}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                            <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{app.role_name}</span>
                            <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{app.email}</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Applied: {formatRelativeTime(app.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {expandedId === app.id ? (
                          <ChevronUp className="w-5 h-5 text-slate-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-500" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === app.id && (
                    <div className="border-t border-white/5 px-5 py-5 space-y-5 animate-fade-in">
                      


                      {/* ─── Generate Verification Code ─────────────────────────────── */}
                      <div className="p-4 rounded-xl" style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <div className="flex items-center gap-2 mb-3">
                          <QrCode className="w-4 h-4 text-blue-400" />
                          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Verification Code</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mb-3">Generate a unique verification URL for this intern. They can visit it to view their details in real-time.</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => handleGenerateCode(app, 'internship')}
                            disabled={generatedCodes[`${app.id}-internship`]?.loading}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-bold hover:bg-amber-500/20 disabled:opacity-30 transition-all">
                            {generatedCodes[`${app.id}-internship`]?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GraduationCap className="w-3.5 h-3.5" />}
                            Generate Certificate Code
                          </button>
                          <button onClick={() => handleGenerateCode(app, 'lor')}
                            disabled={generatedCodes[`${app.id}-lor`]?.loading}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/10 text-violet-400 text-xs font-bold hover:bg-violet-500/20 disabled:opacity-30 transition-all">
                            {generatedCodes[`${app.id}-lor`]?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
                            Generate LOR Code
                          </button>
                        </div>

                        {/* Show Generated Code */}
                        {generatedCodes[`${app.id}-internship`]?.url && (
                          <div className="mt-3 p-3 rounded-lg animate-fade-in" style={{ background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.2)' }}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span className="text-xs font-bold text-emerald-400">Certificate URL Ready:</span>
                              </div>
                              <button onClick={() => { navigator.clipboard.writeText(generatedCodes[`${app.id}-internship`]!.url); setCopiedId(`code-${app.id}-internship`); setTimeout(() => setCopiedId(null), 2000); }}
                                className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 shrink-0">
                                {copiedId === `code-${app.id}-internship` ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copiedId === `code-${app.id}-internship` ? 'Copied!' : 'Copy URL'}
                              </button>
                            </div>
                            <a href={generatedCodes[`${app.id}-internship`]!.url} target="_blank" rel="noopener noreferrer"
                              className="mt-1 block text-xs font-mono text-emerald-400/70 hover:text-emerald-300 truncate">
                              {generatedCodes[`${app.id}-internship`]!.url}
                            </a>
                          </div>
                        )}
                        {generatedCodes[`${app.id}-lor`]?.url && (
                          <div className="mt-3 p-3 rounded-lg animate-fade-in" style={{ background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
                                <span className="text-xs font-bold text-violet-400">LOR URL Ready:</span>
                              </div>
                              <button onClick={() => { navigator.clipboard.writeText(generatedCodes[`${app.id}-lor`]!.url); setCopiedId(`code-${app.id}-lor`); setTimeout(() => setCopiedId(null), 2000); }}
                                className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 shrink-0">
                                {copiedId === `code-${app.id}-lor` ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copiedId === `code-${app.id}-lor` ? 'Copied!' : 'Copy URL'}
                              </button>
                            </div>
                            <a href={generatedCodes[`${app.id}-lor`]!.url} target="_blank" rel="noopener noreferrer"
                              className="mt-1 block text-xs font-mono text-violet-400/70 hover:text-violet-300 truncate">
                              {generatedCodes[`${app.id}-lor`]!.url}
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Already issued? Show existing certs for this user */}
                      {certificates.filter(c => c.user_id === app.id && c.status === 'active').length > 0 && (
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(5, 150, 105, 0.05)', border: '1px solid rgba(5, 150, 105, 0.1)' }}>
                          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3" /> Already Issued Certificates/LOR
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {certificates.filter(c => c.user_id === app.id && c.status === 'active').map(c => (
                              <span key={c.id} className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400">
                                <Award className="w-3 h-3" />
                                {getCertificateTitle(c)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Contact Info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Contact</h4>
                          <div className="space-y-2 text-sm">
                            <p className="flex items-center gap-2 text-slate-300">
                              <Mail className="w-3.5 h-3.5 text-slate-500" />
                              <a href={`mailto:${app.email}`} className="hover:text-emerald-400 transition-colors">{app.email}</a>
                            </p>
                            {app.phone && (
                              <p className="flex items-center gap-2 text-slate-300">
                                <Phone className="w-3.5 h-3.5 text-slate-500" />
                                <span>{app.phone}</span>
                              </p>
                            )}
                            {app.country && (
                              <p className="flex items-center gap-2 text-slate-300">
                                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                                {app.country}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Links</h4>
                          <div className="space-y-2 text-sm">
                            {app.linkedin_url ? (
                              <p className="flex items-center gap-2">
                                <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                                <a href={app.linkedin_url} target="_blank" rel="noopener noreferrer"
                                  className="text-slate-300 hover:text-emerald-400 transition-colors truncate">LinkedIn</a>
                              </p>
                            ) : null}
                            {app.github_url ? (
                              <p className="flex items-center gap-2">
                                <Code2 className="w-3.5 h-3.5 text-slate-400" />
                                <a href={app.github_url} target="_blank" rel="noopener noreferrer"
                                  className="text-slate-300 hover:text-emerald-400 transition-colors truncate">GitHub</a>
                              </p>
                            ) : null}
                            {app.portfolio_url ? (
                              <p className="flex items-center gap-2">
                                <Link2 className="w-3.5 h-3.5 text-slate-400" />
                                <a href={app.portfolio_url} target="_blank" rel="noopener noreferrer"
                                  className="text-slate-300 hover:text-emerald-400 transition-colors truncate">Portfolio</a>
                              </p>
                            ) : null}
                            {!app.linkedin_url && !app.github_url && !app.portfolio_url && (
                              <p className="text-slate-500 text-xs">No links provided</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Education */}
                      {(app.university || app.degree) && (
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Education</h4>
                          <div className="space-y-2 text-sm">
                            {app.university && (
                              <p className="flex items-center gap-2 text-slate-300">
                                <Building className="w-3.5 h-3.5 text-slate-500" />
                                {app.university}
                              </p>
                            )}
                            {app.degree && (
                              <p className="flex items-center gap-2 text-slate-300">
                                <GraduationCap className="w-3.5 h-3.5 text-slate-500" />
                                {app.degree}
                              </p>
                            )}
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

      {/* Tab: All Certificates */}
      {activeTab === 'certs' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Total</p>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
            </div>
            <div className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Active</p>
              <p className="text-2xl font-bold text-emerald-400">{stats.active}</p>
            </div>
            <div className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Revoked</p>
              <p className="text-2xl font-bold text-red-400">{stats.revoked}</p>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-4 rounded-2xl"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3 flex-1 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, skill, or code..." className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="revoked">Revoked</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <button onClick={() => void fetchCerts()}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>

          {/* Certificates List */}
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-500" style={{ background: '#1E293B', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No certificates found</p>

              </div>
            ) : (
              filtered.map(cert => {
                const levelStyle = CERT_LEVEL_STYLES[cert.level] || CERT_LEVEL_STYLES.beginner;
                const isLOR = cert.certificate_type === 'lor';
                const isExpanded = expandedCertId === cert.id;
                return (
                  <div key={cert.id} className="rounded-2xl overflow-hidden transition-all duration-200" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* Clickable Header */}
                    <div className="p-5 cursor-pointer" onClick={() => setExpandedCertId(isExpanded ? null : cert.id)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <div className={`h-12 w-12 rounded-xl ${levelStyle.bg} flex items-center justify-center text-xl shrink-0`}>
                            {levelStyle.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="font-bold text-white text-sm">{getCertificateTitle(cert)}</h3>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusStyles[cert.status]}`}>{cert.status}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${typeStyles[cert.certificate_type]}`}>{cert.certificate_type === 'lor' ? 'LOR' : cert.certificate_type}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                              <span className="flex items-center gap-1"><User className="w-3 h-3" />{cert.recipient_name}</span>
                              <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{cert.recipient_email}</span>
                              <span className={`flex items-center gap-1 ${levelStyle.color}`}>{levelStyle.label}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-1.5 text-[10px] text-slate-500">
                              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Issued: {formatDate(cert.issued_at || cert.created_at)}</span>
                              {cert.verification_code && (
                                <button onClick={(e) => { e.stopPropagation(); handleCopyCode(cert.verification_code!); }}
                                  className="flex items-center gap-1 hover:text-emerald-400 transition-colors font-mono">
                                  {copiedId === cert.verification_code ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  {cert.verification_code}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Area */}
                    {isExpanded && (
                      <div className="border-t border-white/5 px-5 py-5 space-y-5 animate-fade-in">
                        {/* Quick Actions - Revoke / Delete */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {cert.status === 'active' && (
                            <button onClick={() => handleRevoke(cert.id, cert.skill, cert.recipient_name)}
                              disabled={actionLoading === `revoke-${cert.id}`}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 disabled:opacity-30 transition-all">
                              {actionLoading === `revoke-${cert.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                              Revoke
                            </button>
                          )}
                          <button onClick={() => handleDeleteCert(cert.id, cert.skill, cert.recipient_name)}
                            disabled={actionLoading === `delete-${cert.id}`}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 disabled:opacity-30 transition-all">
                            {actionLoading === `delete-${cert.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Delete
                          </button>
                          {cert.status === 'active' && (
                            <>
                              <button onClick={() => handleCopyLink(cert)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700/50 text-slate-400 text-xs font-bold hover:text-emerald-400 transition-all">
                                <Link2 className="w-3.5 h-3.5" /> Copy Verify Link
                              </button>
                              {cert.certificate_url && (
                                <a href={cert.certificate_url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700/50 text-slate-400 text-xs font-bold hover:text-emerald-400 transition-all">
                                  <FileText className="w-3.5 h-3.5" /> View PDF
                                </a>
                              )}
                              {cert.verification_code && (
                                <a href={verifyUrl(cert)} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700/50 text-slate-400 text-xs font-bold hover:text-emerald-400 transition-all">
                                  <ExternalLink className="w-3.5 h-3.5" /> Verify Page
                                </a>
                              )}
                            </>
                          )}
                        </div>

                        {/* Send Email Section - Like Internship */}
                        {cert.status === 'active' && (
                          <div className="p-4 rounded-xl flex items-center justify-between" 
                            style={{ background: isLOR ? 'rgba(124, 58, 237, 0.05)' : 'rgba(5, 150, 105, 0.05)', border: isLOR ? '1px solid rgba(124, 58, 237, 0.2)' : '1px solid rgba(5, 150, 105, 0.2)' }}>
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center`}
                                style={{ background: isLOR ? 'rgba(124, 58, 237, 0.1)' : 'rgba(5, 150, 105, 0.1)' }}>
                                <Send className={`w-4 h-4 ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`} />
                              </div>
                              <div>
                                <h4 className={`text-xs font-bold ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`}>
                                  Send {isLOR ? 'Letter of Recommendation' : 'Certificate'} Email
                                </h4>
                                <p className="text-[10px] text-slate-500">
                                  Email {cert.recipient_name} with their {isLOR ? 'recommendation letter' : 'completion certificate'} + verify link
                                </p>
                              </div>
                            </div>
                            <button onClick={() => handleSendCertEmail(cert)}
                              disabled={sendingEmail === cert.id}
                              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg disabled:opacity-30 text-white text-xs font-bold transition-all ${isLOR ? 'bg-violet-600 hover:bg-violet-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                              {sendingEmail === cert.id ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</> : <><Send className="w-3.5 h-3.5" /> Send Email</>}
                            </button>
                          </div>
                        )}

                        {/* Certificate Document Upload - Like Internship */}
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(59, 130, 246, 0.03)', border: cert.certificate_url ? '1px solid rgba(5, 150, 105, 0.2)' : '1px solid rgba(59, 130, 246, 0.1)' }}>
                          <div className="flex items-center gap-2 mb-3">
                            <FileText className={`w-4 h-4 ${cert.certificate_url ? 'text-emerald-400' : 'text-blue-400'}`} />
                            <span className={`text-xs font-bold uppercase tracking-widest ${cert.certificate_url ? 'text-emerald-400' : 'text-blue-400'}`}>
                              {isLOR ? 'LOR' : 'Certificate'} PDF Document
                            </span>
                            {cert.certificate_url && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">Uploaded</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mb-3">Upload a formal PDF {isLOR ? 'recommendation letter' : 'certificate'} document.</p>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-bold cursor-pointer hover:bg-blue-500/20 transition-colors">
                              {certUploadingPdf[`${cert.id}-pdf`]?.loading ? (
                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
                              ) : (
                                <><FileUp className="w-3.5 h-3.5" /> {cert.certificate_url ? 'Replace PDF' : 'Upload PDF'}</>
                              )}
                              <input type="file" accept=".pdf,application/pdf" className="hidden"
                                disabled={certUploadingPdf[`${cert.id}-pdf`]?.loading}
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  const key = `${cert.id}-pdf`;
                                  setCertUploadingPdf(prev => ({ ...prev, [key]: { loading: true } }));
                                  try {
                                    // Upload via admin-data edge function (same as handleDocUpload)
                                    const fileBase64 = await new Promise<string>((resolve, reject) => {
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        const result = reader.result as string;
                                        resolve(result.split(',')[1]);
                                      };
                                      reader.onerror = reject;
                                      reader.readAsDataURL(f);
                                    });
                                    const filePath = `cert-docs/${cert.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                                    const { data: uploadResult, error: fnError } = await supabase.functions.invoke('admin-data', { method: 'POST', body: { action: 'storage_upload', bucket: 'certificate_documents', file_path: filePath, file_base64: fileBase64, content_type: f.type || 'application/pdf' } });
                                    if (fnError || uploadResult?.error) throw new Error(uploadResult?.error || fnError?.message || 'Upload failed');
                                    const publicUrl = uploadResult.publicUrl;
                                    if (!publicUrl) throw new Error('No public URL returned');
                                    // Update in DB via admin-data
                                    await supabase.functions.invoke('admin-data', { method: 'PATCH', body: { table: 'skill_certifications', id: cert.id, data: { certificate_url: publicUrl } } });
                                    toast.success('Uploaded', 'PDF uploaded successfully!');
                                    fetchCerts();
                                  } catch (err) {
                                    console.error('Upload error:', err);
                                    toast.error('Upload Failed', err instanceof Error ? err.message : 'Upload failed');
                                  } finally {
                                    setCertUploadingPdf(prev => ({ ...prev, [key]: { loading: false } }));
                                  }
                                  e.target.value = '';
                                }} />
                            </label>
                            {cert.certificate_url && (
                              <a href={cert.certificate_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-700/50 text-slate-400 text-xs font-bold hover:text-emerald-400 transition-colors">
                                <ExternalLink className="w-3.5 h-3.5" /> View
                              </a>
                            )}
                            <span className="text-[10px] text-slate-600">PDF format only</span>
                          </div>
                        </div>

                        {/* Email Log */}
                        {certEmailLogs[cert.id] && certEmailLogs[cert.id].length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <History className="w-3.5 h-3.5" /> Email Log
                            </h4>
                            <div className="space-y-1.5">
                              {certEmailLogs[cert.id].map((log, i) => (
                                <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                                  <Mail className={`w-3 h-3 ${log.sent ? 'text-emerald-400' : 'text-red-400'}`} />
                                  <span className="text-slate-300 font-medium uppercase text-[10px]">{log.type.replace('_', ' ')}</span>
                                  <span className="text-slate-500">•</span>
                                  <span className={`text-[10px] ${log.sent ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {log.sent ? 'Email Sent' : 'Failed'}
                                  </span>
                                  <span className="text-slate-500">•</span>
                                  <span className="text-slate-500 text-[10px]">{formatRelativeTime(log.time)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Revoked Reason */}
                        {cert.revoked_reason && (
                          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 flex items-start gap-2">
                            <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[10px] font-bold text-red-400 uppercase">Revoked</p>
                              <p className="text-xs text-slate-400">{cert.revoked_reason} — {cert.revoked_at ? formatRelativeTime(cert.revoked_at) : ''}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}



    </div>
  );
}
