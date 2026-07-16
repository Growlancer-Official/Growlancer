import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Award, Search, Loader2, RefreshCw, User, Mail, AlertTriangle,
  CheckCircle2, ExternalLink, FileText, Calendar,
  Ban, Copy, CheckCheck, Trash2,
  Send, QrCode, Star, Link2, GraduationCap, Briefcase, Users,
  FileUp, ChevronDown, ChevronUp, History,
  Phone, Building, MapPin, Code2,
  CheckSquare, Square, ArrowLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';import {
  adminDelete
} from '../../lib/adminDataProxy';
import {
  issueCertificate, revokeCertificate, getAllCertificates, sendCertificateEmail,
  type Certificate, CERT_LEVEL_STYLES, getCertificateTitle,
} from '../../lib/certificateService';
import { AdminQRManager } from '../../components/admin/AdminQRManager';

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
  const [activeTab, setActiveTab] = useState<'interns' | 'certs' | 'qr'>('interns');
  const [qrSelectedCert, setQrSelectedCert] = useState<Certificate | null>(null);
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
  // Track generated verification codes per intern — with certId for PDF upload + email
  const [generatedCodes, setGeneratedCodes] = useState<Record<string, any>>({});

  // ─── Bulk Operations State ───────────────────────────────────
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCertType, setBulkCertType] = useState<'internship' | 'lor'>('internship');

  const toggleSelectAll = () => {
    if (bulkSelectedIds.size === filteredInterns.length) {
      setBulkSelectedIds(new Set());
    } else {
      setBulkSelectedIds(new Set(filteredInterns.map(a => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setBulkSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkGenerateCodes = async () => {
    if (bulkSelectedIds.size === 0) return;
    const typeLabel = bulkCertType === 'lor' ? 'LOR' : 'Certificate';
    if (!confirm(`Generate ${typeLabel} codes for ${bulkSelectedIds.size} selected ${bulkSelectedIds.size === 1 ? 'intern' : 'interns'}?`)) return;
    setActionLoading('bulk-generate');
    let successCount = 0;
    let failCount = 0;
    try {
      const ids = Array.from(bulkSelectedIds);
      for (const id of ids) {
        const app = internApplicants.find(a => a.id === id);
        if (!app) { failCount++; continue; }
        const result = await handleGenerateCode(app, bulkCertType);
        if (result.success) successCount++;
        else failCount++;
      }
      if (failCount === 0) {
        toast.success('Bulk Complete', `${successCount} ${typeLabel} codes generated.`);
      } else {
        toast.warning('Bulk Partial', `${successCount} generated, ${failCount} failed.`);
      }
      setBulkSelectedIds(new Set());
    } catch {
      toast.error('Bulk Error', 'An unexpected error occurred during bulk generation.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkSendEmail = async () => {
    if (bulkSelectedIds.size === 0) return;
    if (!confirm(`Send certificate/LOR emails to ${bulkSelectedIds.size} selected ${bulkSelectedIds.size === 1 ? 'intern' : 'interns'}?`)) return;
    setActionLoading('bulk-email');
    let successCount = 0;
    let failCount = 0;
    try {
      const ids = Array.from(bulkSelectedIds);
      for (const id of ids) {
        // Check for internship cert first, then LOR
        const certKey = `${id}-internship`;
        const lorKey = `${id}-lor`;
        const gen = generatedCodes[certKey] || generatedCodes[lorKey];
        if (!gen || !gen.certId || !gen.code || !gen.pdfUrl) {
          failCount++;
          continue;
        }
        try {
          const isLOR = generatedCodes[lorKey]?.certId === gen.certId;
          const app = internApplicants.find(a => a.id === id);
          const r = await sendCertificateEmail({
            certificateId: gen.certId,
            recipientEmail: app?.email || '',
            recipientName: internApplicants.find(a => a.id === id)?.full_name || '',
            certificateType: isLOR ? 'lor' : 'internship',
            roleName: internApplicants.find(a => a.id === id)?.role_name || 'Internship',
            level: isLOR ? 'advanced' : 'intermediate',
            verificationCode: gen.code,
            certificateUrl: gen.pdfUrl,
            performanceSummary: isLOR ? `Top performer during internship.` : '',
            skillsDemonstrated: [],
          });
          if (r.success) successCount++;
          else failCount++;
        } catch { failCount++; }
      }
      if (failCount === 0) {
        toast.success('Bulk Complete', `${successCount} emails sent.`);
      } else {
        toast.warning('Bulk Partial', `${successCount} sent, ${failCount} failed (some may lack PDF).`);
      }
      setBulkSelectedIds(new Set());
    } catch (err) {
      toast.error('Bulk Error', 'An unexpected error occurred during bulk email.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleGenerateCode = async (app: InternshipAppUser, type: 'internship' | 'lor'): Promise<{success: boolean}> => {
    const isLOR = type === 'lor';
    const key = `${app.id}-${type}`;
    setGeneratedCodes(prev => ({ ...prev, [key]: { code: '', url: '', type: isLOR ? 'LOR' : 'Certificate', loading: true } }));
    try {
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
        setGeneratedCodes(prev => ({ ...prev, [key]: { code: actualCode, url: verifyUrl, type: isLOR ? 'LOR' : 'Certificate', loading: false, certId: result.certificate!.id, pdfUrl: result.certificate!.certificate_url || undefined } }));
        toast.success('Code Generated!', `${isLOR ? 'LOR' : 'Certificate'} verification code created for ${app.full_name}`);
        fetchCerts();
        return { success: true };
      } else {
        throw new Error(result.error || 'Failed to generate code');
      }
    } catch {
      setGeneratedCodes(prev => ({ ...prev, [key]: { code: '', url: '', type: isLOR ? 'LOR' : 'Certificate', loading: false } }));
      toast.error('Failed', 'Could not generate code');
      return { success: false };
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
    } catch {
      console.error('Failed to fetch internship applicants:');
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
      if (!isActiveRef.current && !actionLoading && !expandedId && !expandedCertId && Object.keys(certUploadingPdf).length === 0) {
        fetchCerts(false);
        fetchInternApplicants(false);
      }
    }, 25000);
    return () => clearInterval(interval);
  }, [fetchCerts, fetchInternApplicants, actionLoading, expandedId, expandedCertId, certUploadingPdf]);

  // Track when user is actively interacting
  useEffect(() => {
    isActiveRef.current = !!expandedId || !!expandedCertId || !!actionLoading || Object.keys(certUploadingPdf).length > 0;
  }, [expandedId, expandedCertId, actionLoading, certUploadingPdf]);

  // ─── Realtime subscription for admin tables ─────────────────
  useEffect(() => {
    const channel = supabase
      .channel('admin-certificates-realtime')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'skill_certifications' },
        () => { fetchCerts(false); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'internship_applications' },
        () => { fetchInternApplicants(false); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchCerts, fetchInternApplicants]);

  // ─── Persist generatedCodes across refresh/re-login ──────────────
  // Read existing certificates from the DB and populate generatedCodes
  // so QR codes + upload/send sections show up even after page refresh.
  useEffect(() => {
    if (certificates.length === 0 || internApplicants.length === 0) return;

    setGeneratedCodes(prev => {
      const next = { ...prev };
      let changed = false;
      for (const cert of certificates) {
        if (cert.status !== 'active') continue;
        const intern = internApplicants.find(a => a.id === cert.user_id);
        if (!intern) continue;
        const type = cert.certificate_type === 'lor' ? 'lor' : 'internship';
        const key = `${cert.user_id}-${type}`;
        // Only set if not already in state (preserves any fresh/loading codes)
        if (!next[key] || next[key].loading === true) {
          const verifyUrl = `${window.location.origin}/certificate/${cert.verification_code}`;
          next[key] = {
            code: cert.verification_code,
            url: verifyUrl,
            type: type === 'lor' ? 'LOR' : 'Certificate',
            loading: false,
            certId: cert.id,
            pdfUrl: cert.certificate_url || undefined,
          };
          changed = true;
        }
      }
      return changed ? next : prev; // avoid unnecessary re-render
    });
  }, [certificates, internApplicants]);

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
        <button
          onClick={() => setActiveTab('qr')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'qr'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <QrCode className="w-4 h-4" />
          QR Management
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

          {/* Bulk Action Bar */}
          {bulkSelectedIds.size > 0 && (
            <div className="sticky top-4 z-50 flex items-center justify-between px-5 py-3 rounded-2xl animate-fade-in"
              style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-white">{bulkSelectedIds.size} selected</span>
                <select value={bulkCertType} onChange={e => setBulkCertType(e.target.value as 'internship' | 'lor')}
                  className="bg-slate-800 border border-white/10 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer">
                  <option value="internship">→ Certificate</option>
                  <option value="lor">→ LOR</option>
                </select>
                <button onClick={handleBulkGenerateCodes} disabled={actionLoading === 'bulk-generate'}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {actionLoading === 'bulk-generate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                  Generate Codes
                </button>
                <button onClick={handleBulkSendEmail} disabled={actionLoading === 'bulk-email'}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
                  {actionLoading === 'bulk-email' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send Emails
                </button>
              </div>
              <button onClick={() => setBulkSelectedIds(new Set())}
                className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                Clear Selection
              </button>
            </div>
          )}

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
              <>
                <div className="flex items-center gap-3 px-1 py-1" style={{ color: '#64748B' }}>
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider hover:text-emerald-400 transition-colors"
                  >
                    {bulkSelectedIds.size === filteredInterns.length ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    {bulkSelectedIds.size === filteredInterns.length ? 'Deselect All' : 'Select All'} ({filteredInterns.length})
                  </button>
                </div>
              {filteredInterns.map(app => (
                <div key={app.id} className="rounded-2xl overflow-hidden transition-all duration-200"
                  style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>                    {/* Card Header - Always visible */}
                  <div className="p-5 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSelect(app.id); }}
                          className="mt-2 shrink-0 hover:text-emerald-400 transition-colors"
                        >
                          {bulkSelectedIds.has(app.id) ? (
                            <CheckSquare className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-500" />
                          )}
                        </button>
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
                          {/* QR Code URL — visible for interns with existing certs */}
                          {(() => {
                            const internCerts = certificates.filter(c => c.user_id === app.id && c.status === 'active');
                            if (internCerts.length === 0) return null;
                            const latestCert = internCerts[0];
                            const url = `${window.location.origin}/certificate/${latestCert.verification_code}`;
                            const isLOR = latestCert.certificate_type === 'lor';
                            return (
                              <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=40x40&data=${encodeURIComponent(url)}`}
                                  alt="QR" className="w-8 h-8 rounded shrink-0 bg-white p-0.5" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] font-bold ${isLOR ? 'text-violet-400' : 'text-emerald-400'}`}>
                                      {isLOR ? 'LOR' : 'Certificate'} URL
                                    </span>
                                    <button onClick={() => { navigator.clipboard.writeText(url); setCopiedId(`hdr-${app.id}`); setTimeout(() => setCopiedId(null), 2000); }}
                                      className="flex items-center gap-0.5 text-[9px] text-slate-500 hover:text-emerald-400 transition-colors">
                                      {copiedId === `hdr-${app.id}` ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  </div>
                                  <p className="text-[9px] font-mono text-slate-600 truncate">{url}</p>
                                </div>
                              </div>
                            );
                          })()}
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
                      


                      {/* ─── Internship Certificate ─────────────────────────────── */}
                      <div className="p-4 rounded-xl" style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                        <div className="flex items-center gap-2 mb-3">
                          <GraduationCap className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Internship Certificate</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mb-3">Generate a unique certificate verification code for this intern.</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => handleGenerateCode(app, 'internship')}
                            disabled={generatedCodes[`${app.id}-internship`]?.loading}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-bold hover:bg-amber-500/20 disabled:opacity-30 transition-all">
                            {generatedCodes[`${app.id}-internship`]?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GraduationCap className="w-3.5 h-3.5" />}
                            Generate Certificate Code
                          </button>
                        </div>

                        {/* Show Generated Code - Certificate */}
                        {generatedCodes[`${app.id}-internship`]?.url && (() => {
                          const key = `${app.id}-internship`;
                          const gen = generatedCodes[key]!;
                          const certId = gen.certId;
                          const uploading = generatedCodes[`${key}-uploading`]?.uploading || false;
                          const sending = generatedCodes[`${key}-sending`]?.sending || false;
                          const pdfUrl = gen.pdfUrl;
                          return (
                            <div className="mt-3 space-y-3">
                              {/* QR + URL */}
                              <div className="p-3 rounded-lg animate-fade-in" style={{ background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.2)' }}>
                                <div className="flex items-start gap-3">
                                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(gen.url)}`} alt="QR" className="w-16 h-16 rounded-lg shrink-0 bg-white p-1" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <span className="text-xs font-bold text-emerald-400">Certificate URL Ready:</span>
                                      </div>
                                      <button onClick={() => { navigator.clipboard.writeText(gen.url); setCopiedId(`code-${key}`); setTimeout(() => setCopiedId(null), 2000); }}
                                        className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 shrink-0">
                                        {copiedId === `code-${key}` ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                        {copiedId === `code-${key}` ? 'Copied!' : 'Copy URL'}
                                      </button>
                                    </div>
                                    <a href={gen.url} target="_blank" rel="noopener noreferrer"
                                      className="block text-xs font-mono text-emerald-400/70 hover:text-emerald-300 truncate">{gen.url}</a>
                                  </div>
                                </div>
                              </div>
                              {/* PDF Upload */}
                              {certId && (
                                <div className="p-3 rounded-lg" style={{ background: pdfUrl ? 'rgba(5, 150, 105, 0.05)' : 'rgba(59, 130, 246, 0.05)', border: pdfUrl ? '1px solid rgba(5, 150, 105, 0.2)' : '1px solid rgba(59, 130, 246, 0.15)' }}>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                      <FileText className={pdfUrl ? 'w-3.5 h-3.5 text-emerald-400' : 'w-3.5 h-3.5 text-blue-400'} />
                                      <span className={pdfUrl ? 'text-[10px] font-bold uppercase tracking-widest text-emerald-400' : 'text-[10px] font-bold uppercase tracking-widest text-blue-400'}>
                                        Certificate PDF Document
                                      </span>
                                      {pdfUrl && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Uploaded ✓</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold cursor-pointer hover:bg-blue-500/20 transition-colors">
                                      {uploading ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</> : <><FileUp className="w-3 h-3" /> {pdfUrl ? 'Replace PDF' : 'Upload PDF'}</>}
                                      <input type="file" accept=".pdf,application/pdf" className="hidden" disabled={uploading}
                                        onChange={async (e) => {
                                          const f = e.target.files?.[0]; if (!f || !certId) return;
                                          setGeneratedCodes(p => ({ ...p, [`${key}-uploading`]: { uploading: true } }));
                                          try {
                                            const b64 = await new Promise<string>((rs, rj) => { const r = new FileReader(); r.onload = () => rs((r.result as string).split(',')[1]); r.onerror = rj; r.readAsDataURL(f); });
                                            const fp = `cert-docs/${certId}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                                            const { data: upRes, error: upErr } = await supabase.functions.invoke('admin-data', { method: 'POST', body: { action: 'storage_upload', bucket: 'certificate_documents', file_path: fp, file_base64: b64, content_type: f.type || 'application/pdf' } });
                                            if (upErr || upRes?.error) throw new Error(upRes?.error || upErr?.message);
                                            const pubUrl = upRes.publicUrl; if (!pubUrl) throw new Error('No URL');
                                            await supabase.functions.invoke('admin-data', { method: 'PATCH', body: { table: 'skill_certifications', id: certId, data: { certificate_url: pubUrl } } });
                                            setGeneratedCodes(p => ({ ...p, [key]: { ...p[key], pdfUrl: pubUrl }, [`${key}-uploading`]: { uploading: false } }));
                                            toast.success('Uploaded', 'PDF uploaded!'); fetchCerts();
                                          } catch (err) { toast.error('Failed', err instanceof Error ? err.message : 'Upload failed'); setGeneratedCodes(p => ({ ...p, [`${key}-uploading`]: { uploading: false } })); }
                                          e.target.value = '';
                                        }} />
                                    </label>
                                    {pdfUrl && <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-400 text-[10px] font-bold hover:text-emerald-400 transition-all"><ExternalLink className="w-3 h-3" /> View</a>}
                                  </div>
                                </div>
                              )}
                              {/* Send Email */}
                              {pdfUrl && certId && (
                                <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: 'rgba(5, 150, 105, 0.06)', border: '1px solid rgba(5, 150, 105, 0.2)' }}>
                                  <div className="flex items-center gap-2">
                                    <Send className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-[10px] font-bold text-emerald-400">Send Certificate Email</span>
                                  </div>
                                  <button onClick={async () => {
                                    if (!gen.certId || !gen.code) return;
                                    if (!confirm(`Send Certificate email to ${app.full_name} (${app.email})?`)) return;
                                    setGeneratedCodes(p => ({ ...p, [`${key}-sending`]: { sending: true } }));
                                    try {
                                      const r = await sendCertificateEmail({
                                        certificateId: gen.certId, recipientEmail: app.email, recipientName: app.full_name,
                                        certificateType: 'internship', roleName: app.role_name, level: 'intermediate',
                                        verificationCode: gen.code, certificateUrl: gen.pdfUrl,
                                        performanceSummary: '', skillsDemonstrated: [],
                                      });
                                      if (r.success) { toast.success('Email Sent!', `Certificate sent to ${app.full_name}`); setCertEmailLogs(p => ({ ...p, [gen.certId!]: [...(p[gen.certId!] || []), { type: 'Certificate', sent: true, time: new Date().toISOString() }] })); }
                                      else toast.error('Failed', r.error || 'Email failed');
                                    } catch (err) { toast.error('Failed', err instanceof Error ? err.message : 'Error'); }
                                    finally { setGeneratedCodes(p => ({ ...p, [`${key}-sending`]: { sending: false } })); }
                                  }} disabled={sending}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg disabled:opacity-30 text-white text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 transition-all">
                                    {sending ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending...</> : <><Send className="w-3 h-3" /> Send Now</>}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* ─── Letter of Recommendation (LOR) ────────────────────── */}
                      <div className="p-4 rounded-xl" style={{ background: 'rgba(124, 58, 237, 0.05)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
                        <div className="flex items-center gap-2 mb-3">
                          <Star className="w-4 h-4 text-violet-400" />
                          <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Letter of Recommendation (LOR)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mb-3">Generate a unique LOR verification code for this intern.</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => handleGenerateCode(app, 'lor')}
                            disabled={generatedCodes[`${app.id}-lor`]?.loading}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/10 text-violet-400 text-xs font-bold hover:bg-violet-500/20 disabled:opacity-30 transition-all">
                            {generatedCodes[`${app.id}-lor`]?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
                            Generate LOR Code
                          </button>
                        </div>

                        {/* Show Generated LOR Code */}
                        {generatedCodes[`${app.id}-lor`]?.url && (() => {
                          const key = `${app.id}-lor`;
                          const gen = generatedCodes[key]!;
                          const certId = gen.certId;
                          const uploading = generatedCodes[`${key}-uploading`]?.uploading || false;
                          const sending = generatedCodes[`${key}-sending`]?.sending || false;
                          const pdfUrl = gen.pdfUrl;
                          return (
                            <div className="mt-3 space-y-3">
                              {/* QR + URL */}
                              <div className="p-3 rounded-lg animate-fade-in" style={{ background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
                                <div className="flex items-start gap-3">
                                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(gen.url)}`} alt="QR" className="w-16 h-16 rounded-lg shrink-0 bg-white p-1" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
                                        <span className="text-xs font-bold text-violet-400">LOR URL Ready:</span>
                                      </div>
                                      <button onClick={() => { navigator.clipboard.writeText(gen.url); setCopiedId(`code-${key}`); setTimeout(() => setCopiedId(null), 2000); }}
                                        className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 shrink-0">
                                        {copiedId === `code-${key}` ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                        {copiedId === `code-${key}` ? 'Copied!' : 'Copy URL'}
                                      </button>
                                    </div>
                                    <a href={gen.url} target="_blank" rel="noopener noreferrer"
                                      className="block text-xs font-mono text-violet-400/70 hover:text-violet-300 truncate">{gen.url}</a>
                                  </div>
                                </div>
                              </div>
                              {/* PDF Upload */}
                              {certId && (
                                <div className="p-3 rounded-lg" style={{ background: pdfUrl ? 'rgba(5, 150, 105, 0.05)' : 'rgba(59, 130, 246, 0.05)', border: pdfUrl ? '1px solid rgba(5, 150, 105, 0.2)' : '1px solid rgba(59, 130, 246, 0.15)' }}>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                      <FileText className={pdfUrl ? 'w-3.5 h-3.5 text-emerald-400' : 'w-3.5 h-3.5 text-blue-400'} />
                                      <span className={pdfUrl ? 'text-[10px] font-bold uppercase tracking-widest text-emerald-400' : 'text-[10px] font-bold uppercase tracking-widest text-blue-400'}>
                                        LOR PDF Document
                                      </span>
                                      {pdfUrl && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Uploaded ✓</span>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold cursor-pointer hover:bg-blue-500/20 transition-colors">
                                      {uploading ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</> : <><FileUp className="w-3 h-3" /> {pdfUrl ? 'Replace PDF' : 'Upload PDF'}</>}
                                      <input type="file" accept=".pdf,application/pdf" className="hidden" disabled={uploading}
                                        onChange={async (e) => {
                                          const f = e.target.files?.[0]; if (!f || !certId) return;
                                          setGeneratedCodes(p => ({ ...p, [`${key}-uploading`]: { uploading: true } }));
                                          try {
                                            const b64 = await new Promise<string>((rs, rj) => { const r = new FileReader(); r.onload = () => rs((r.result as string).split(',')[1]); r.onerror = rj; r.readAsDataURL(f); });
                                            const fp = `cert-docs/${certId}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                                            const { data: upRes, error: upErr } = await supabase.functions.invoke('admin-data', { method: 'POST', body: { action: 'storage_upload', bucket: 'certificate_documents', file_path: fp, file_base64: b64, content_type: f.type || 'application/pdf' } });
                                            if (upErr || upRes?.error) throw new Error(upRes?.error || upErr?.message);
                                            const pubUrl = upRes.publicUrl; if (!pubUrl) throw new Error('No URL');
                                            await supabase.functions.invoke('admin-data', { method: 'PATCH', body: { table: 'skill_certifications', id: certId, data: { certificate_url: pubUrl } } });
                                            setGeneratedCodes(p => ({ ...p, [key]: { ...p[key], pdfUrl: pubUrl }, [`${key}-uploading`]: { uploading: false } }));
                                            toast.success('Uploaded', 'LOR PDF uploaded!'); fetchCerts();
                                          } catch (err) { toast.error('Failed', err instanceof Error ? err.message : 'Upload failed'); setGeneratedCodes(p => ({ ...p, [`${key}-uploading`]: { uploading: false } })); }
                                          e.target.value = '';
                                        }} />
                                    </label>
                                    {pdfUrl && <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-400 text-[10px] font-bold hover:text-emerald-400 transition-all"><ExternalLink className="w-3 h-3" /> View</a>}
                                  </div>
                                </div>
                              )}
                              {/* Send Email */}
                              {pdfUrl && certId && (
                                <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: 'rgba(124, 58, 237, 0.06)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
                                  <div className="flex items-center gap-2">
                                    <Send className="w-3.5 h-3.5 text-violet-400" />
                                    <span className="text-[10px] font-bold text-violet-400">Send LOR Email</span>
                                  </div>
                                  <button onClick={async () => {
                                    if (!gen.certId || !gen.code) return;
                                    if (!confirm(`Send LOR email to ${app.full_name} (${app.email})?`)) return;
                                    setGeneratedCodes(p => ({ ...p, [`${key}-sending`]: { sending: true } }));
                                    try {
                                      const r = await sendCertificateEmail({
                                        certificateId: gen.certId, recipientEmail: app.email, recipientName: app.full_name,
                                        certificateType: 'lor', roleName: app.role_name, level: 'advanced',
                                        verificationCode: gen.code, certificateUrl: gen.pdfUrl,
                                        performanceSummary: `Top performer during ${app.role_name} internship.`,
                                        skillsDemonstrated: [],
                                      });
                                      if (r.success) { toast.success('LOR Sent!', `LOR sent to ${app.full_name}`); setCertEmailLogs(p => ({ ...p, [gen.certId!]: [...(p[gen.certId!] || []), { type: 'LOR', sent: true, time: new Date().toISOString() }] })); }
                                      else toast.error('Failed', r.error || 'Email failed');
                                    } catch (err) { toast.error('Failed', err instanceof Error ? err.message : 'Error'); }
                                    finally { setGeneratedCodes(p => ({ ...p, [`${key}-sending`]: { sending: false } })); }
                                  }} disabled={sending}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg disabled:opacity-30 text-white text-[10px] font-bold bg-violet-600 hover:bg-violet-700 transition-all">
                                    {sending ? <><Loader2 className="w-3 h-3 animate-spin" /> Sending...</> : <><Send className="w-3 h-3" /> Send Now</>}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
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
              ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab: QR Management */}
      {activeTab === 'qr' && (
        <div className="space-y-4">
          {qrSelectedCert ? (
            <AdminQRManager
              credentialId={qrSelectedCert.id}
              verificationCode={qrSelectedCert.verification_code}
              recipientName={qrSelectedCert.recipient_name}
              onBack={() => setQrSelectedCert(null)}
            />
          ) : (
            <>
              <div className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 className="text-sm font-bold text-white mb-3">Select a Certificate for QR Management</h3>
                <p className="text-xs text-slate-400 mb-4">Choose a certificate below to manage its QR code, view version history, and audit logs.</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search certificates..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500/20" />
                </div>
              </div>
              <div className="space-y-2">
                {certificates
                  .filter(c => {
                    const q = searchQuery.toLowerCase();
                    return c.recipient_name?.toLowerCase().includes(q) ||
                      c.recipient_email?.toLowerCase().includes(q) ||
                      c.verification_code?.toLowerCase().includes(q);
                  })
                  .map(cert => (
                    <button
                      key={cert.id}
                      onClick={() => setQrSelectedCert(cert)}
                      className="w-full text-left p-4 rounded-xl transition-all hover:bg-slate-700/50"
                      style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          cert.certificate_type === 'lor' ? 'bg-violet-500/10' : 'bg-emerald-500/10'
                        }`}>
                          <QrCode className={`w-5 h-5 ${cert.certificate_type === 'lor' ? 'text-violet-400' : 'text-emerald-400'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white truncate">{cert.recipient_name}</p>
                          <p className="text-xs text-slate-400 truncate">{cert.skill} — {cert.verification_code}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          cert.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>{cert.status}</span>
                      </div>
                    </button>
                  ))}
                {certificates.length === 0 && (
                  <div className="text-center py-10 text-slate-500">
                    <QrCode className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No certificates found</p>
                  </div>
                )}
              </div>
            </>
          )}
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
