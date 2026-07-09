import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Loader2,
  RefreshCw,
  ExternalLink,
  Mail,
  Phone,
  Download,
  GraduationCap,
  Globe,
  Code2,
  FileText,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  Briefcase,
  MapPin,
  Building,
  Link2,
  CheckSquare,
  Square,
  FilterX,
  History,
  CheckCheck,
  Trash2,
  FileCheck,
  ShieldCheck,
  ScrollText,
  FileUp,
  FileDown,
  Video,
  Send,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';

type ApplicationStatus = 'applied' | 'shortlisted' | 'interview_scheduled' | 'selected' | 'rejected';

interface InternshipApplication {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  university: string | null;
  degree: string | null;
  graduation_year: string | null;
  role_id: string;
  role_name: string;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  resume_url: string | null;
  resume_file_path: string | null;
  resume_file_name: string | null;
  cover_letter: string;
  why_growlancer: string | null;
  google_meet_link: string | null;
  interview_time: string | null;
  weekly_availability: number | null;
  available_from: string | null;
  available_to: string | null;
  status: ApplicationStatus;
  notes: string | null;
  offer_letter_url: string | null;
  nda_url: string | null;
  internship_letter_url: string | null;
}

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

export function AdminInternshipsPage() {
  const [applications, setApplications] = useState<InternshipApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<ApplicationStatus>('shortlisted');
  const [emailLogs, setEmailLogs] = useState<Record<string, { status: string; sent: boolean; time: string }[]>>({});
  const selectAllRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const [uploadingDoc, setUploadingDoc] = useState<Record<string, { type: string; loading: boolean }>>({});

  const handleDocumentUpload = async (appId: string, field: 'offer_letter_url' | 'nda_url' | 'internship_letter_url', file: File) => {
    if (!file) return;
    const label = { offer_letter_url: 'Offer Letter', nda_url: 'NDA', internship_letter_url: 'Internship Letter' }[field];
    setUploadingDoc(prev => ({ ...prev, [`${appId}-${field}`]: { type: field, loading: true } }));
    try {
      // Read file as base64
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1]; // Remove data:application/pdf;base64, prefix
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const fileExt = file.name.split('.').pop() || 'pdf';
      const filePath = `${appId}/${field.replace('_url', '')}.${fileExt}`;

      // Use edge function with service_role to bypass storage RLS
      const { data: uploadResult, error: fnError } = await supabase.functions.invoke('admin-data', {
        method: 'POST',
        body: {
          action: 'storage_upload',
          bucket: 'internship_documents',
          file_path: filePath,
          file_base64: fileBase64,
          content_type: file.type || 'application/pdf',
        },
      });

      if (fnError || uploadResult?.error) throw new Error(uploadResult?.error || fnError?.message || 'Upload failed');
      
      const publicUrl = uploadResult.publicUrl;
      if (!publicUrl) throw new Error('No public URL returned');

      const { error: updateError } = await supabase
        .from('internship_applications')
        .update({ [field]: publicUrl } as any)
        .eq('id', appId);
      if (updateError) throw updateError;
      toast.success('Uploaded', `${label} PDF uploaded successfully.`);
      // Update local state directly to avoid auto-refresh
      setApplications(prev => 
        prev.map(a => a.id === appId ? { ...a, [field]: publicUrl } : a)
      );
    } catch (err) {
      console.error('Document upload error:', err);
      toast.error('Upload Failed', `Failed to upload ${label}. Please try again.`);
    } finally {
      setUploadingDoc(prev => ({ ...prev, [`${appId}-${field}`]: { type: field, loading: false } }));
    }
  };

  const fetchApplications = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data: fnData, error } = await supabase.functions.invoke(
        'internship-applications',
        { method: 'GET' }
      );
      
      if (error) throw error;
      
      let apps = (fnData?.applications || []) as InternshipApplication[];
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        apps = apps.filter(a => new Date(a.created_at).getTime() >= from);
      }
      if (dateTo) {
        const to = new Date(dateTo + 'T23:59:59').getTime();
        apps = apps.filter(a => new Date(a.created_at).getTime() <= to);
      }
      
      setApplications(apps);
    } catch (err) {
      console.error('Failed to fetch internship applications:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [roleFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // Polling fallback for cross-session sync (replaces realtime WebSocket which requires Supabase JWT)
  const isActiveRef = useRef(false);
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isActiveRef.current && !actionLoading && !expandedId && Object.keys(uploadingDoc).length === 0) {
        fetchApplications(false);
      }
    }, 25000);
    return () => clearInterval(interval);
  }, [fetchApplications, actionLoading, expandedId, uploadingDoc]);

  // Track when user is actively interacting
  useEffect(() => {
    isActiveRef.current = !!expandedId || !!actionLoading || Object.keys(uploadingDoc).length > 0;
  }, [expandedId, actionLoading, uploadingDoc]);

  const handleDeleteApplication = async (id: string, name: string) => {
    if (!confirm(`Delete application from "${name}"? This cannot be undone!`)) return;
    setActionLoading(`delete-${id}`);
    try {
      await supabase.functions.invoke('internship-applications', {
        method: 'DELETE',
        body: { application_id: id },
      }).catch(async () => {
        await supabase.functions.invoke('admin-data', {
          method: 'DELETE',
          body: { table: 'internship_applications', id },
        });
      });
      await fetchApplications();
    } catch (err) { console.error('Delete error:', err); }
    finally { setActionLoading(null); }
  };

  const getCurrentAppStatus = (id: string): ApplicationStatus | undefined =>
    applications.find(a => a.id === id)?.status;

  const [meetLinkInput, setMeetLinkInput] = useState<Record<string, string>>({});
  const [interviewTimeInput, setInterviewTimeInput] = useState<Record<string, string>>({});
  const [sendEmailOnStatus, setSendEmailOnStatus] = useState<Record<string, boolean>>({});

  const handleSendEmail = async (id: string) => {
    const app = applications.find(a => a.id === id);
    if (!app) return;
    const statusLabel = STATUS_LABELS[app.status];
    if (!confirm(`Send "${statusLabel}" email to ${app.full_name} (${app.email})?`)) return;

    setActionLoading(`email-${id}`);
    try {
      // Always save pending meet link & time to DB before sending email
      const googleMeetLink = meetLinkInput[id] ?? app?.google_meet_link ?? undefined;
      const interviewTime = interviewTimeInput[id] ?? (app?.interview_time ? app.interview_time.slice(0, 16) : undefined);

      const { data, error } = await supabase.functions.invoke('internship-applications', {
        method: 'PATCH',
        body: {
          application_id: id,
          status: app.status,
          send_email_only: true,
          google_meet_link: googleMeetLink,
          interview_time: interviewTime || undefined,
        },
      });

      const emailSent = data?.status_email_sent === true;
      if (error || !emailSent) {
        toast.error('Email Failed', `Could not send "${statusLabel}" email. Check Brevo settings.`);
      } else {
        toast.success('Email Sent', `"${statusLabel}" email delivered to ${app.full_name}.`);
      }

      // Update local state so meet link/time persist in UI
      if (googleMeetLink || interviewTime) {
        setApplications(prev => prev.map(a =>
          a.id === id ? {
            ...a,
            google_meet_link: googleMeetLink ?? a.google_meet_link,
            interview_time: interviewTime || a.interview_time,
          } : a
        ));
        setMeetLinkInput(prev => { const n = { ...prev }; delete n[id]; return n; });
        setInterviewTimeInput(prev => { const n = { ...prev }; delete n[id]; return n; });
      }

      setEmailLogs(prev => ({
        ...prev,
        [id]: [...(prev[id] || []), { status: app.status, sent: emailSent, time: new Date().toISOString() }],
      }));
    } catch (err) {
      console.error('Send email error:', err);
      toast.error('Email Failed', 'An unexpected error occurred.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStatusChange = async (id: string, status: ApplicationStatus, sendEmail = false) => {
    const prevStatus = getCurrentAppStatus(id);
    const isRealStatusChange = prevStatus !== undefined && prevStatus !== status;
    const app = applications.find(a => a.id === id);

    setActionLoading(`status-${id}`);
    let emailSent = false;
    try {
      const notes = notesInput[id] || undefined;
      // Use typed input OR existing DB value as fallback to always persist meet link/time
      const googleMeetLink = meetLinkInput[id] ?? app?.google_meet_link ?? undefined;
      const interviewTime = interviewTimeInput[id] ?? (app?.interview_time ? app.interview_time.slice(0, 16) : undefined);
      
      // First update the status
      const { data, error } = await supabase.functions.invoke('internship-applications', {
        method: 'PATCH',
        body: {
          application_id: id,
          status,
          notes,
          google_meet_link: googleMeetLink,
          interview_time: interviewTime || undefined,
        },
      });

      if (error) {
        console.error('Status update via edge function failed:', error);
        await supabase
          .from('internship_applications')
          .update({ status, notes: notes || null })
          .eq('id', id);
        toast.error('Status Update Failed', 'Status was not updated. Please try again.');
      } else {
        // If status changed successfully AND email requested, send email now          if (sendEmail && isRealStatusChange && app) {
            // Also pass meet link/time to ensure email has them
            const emailMeetLink = meetLinkInput[id] ?? app?.google_meet_link ?? undefined;
            const emailInterviewTime = interviewTimeInput[id] ?? (app?.interview_time ? app.interview_time.slice(0, 16) : undefined);
            try {
              const emailResult = await supabase.functions.invoke('internship-applications', {
                method: 'PATCH',
                body: {
                  application_id: id,
                  status,
                  send_email_only: true,
                  google_meet_link: emailMeetLink,
                  interview_time: emailInterviewTime || undefined,
                },
              });
              emailSent = emailResult.data?.status_email_sent === true;
            if (emailSent) {
              setEmailLogs(prev => ({
                ...prev,
                [id]: [...(prev[id] || []), { status, sent: true, time: new Date().toISOString() }],
              }));
            }
          } catch (emailErr) {
            console.error('Auto email send error:', emailErr);
            // Don't throw — status was already updated successfully
          }
        }

        const msg = isRealStatusChange
          ? sendEmail
            ? emailSent
              ? `Status updated to "${STATUS_LABELS[status]}" & email sent!`
              : `Status updated to "${STATUS_LABELS[status]}" (email failed)`
            : `Status updated to "${STATUS_LABELS[status]}" (email not sent yet)`
          : 'Notes updated successfully.';
        toast.success(isRealStatusChange ? 'Status Updated' : 'Note Saved', msg);
      }

      // Update local state directly to avoid auto-refresh
      setApplications(prev => prev.map(a => 
        a.id === id ? { 
          ...a, 
          status, 
          notes: notes || a.notes,
          google_meet_link: googleMeetLink ?? a.google_meet_link,
          interview_time: interviewTime || a.interview_time,
        } : a
      ));
      setNotesInput(prev => ({ ...prev, [id]: '' }));
      setSendEmailOnStatus(prev => ({ ...prev, [id]: false })); // Reset checkbox
    } catch (err) {
      console.error('Status update error:', err);
      toast.error('Update Failed', 'An unexpected error occurred.');
    } finally {
      setActionLoading(null);
    }
  };

  const getResumeDownloadUrl = (app: InternshipApplication): string | null => {
    if (app.resume_file_path) {
      const { data } = supabase.storage
        .from('internship_resumes')
        .getPublicUrl(app.resume_file_path);
      return data.publicUrl;
    }
    return app.resume_url || null;
  };

  const filteredApplications = applications.filter(a => {
    const q = searchQuery.toLowerCase();
    return (
      a.full_name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      a.role_name.toLowerCase().includes(q) ||
      (a.university?.toLowerCase().includes(q) ?? false) ||
      (a.country?.toLowerCase().includes(q) ?? false)
    );
  });

  const handleBulkStatusUpdate = async () => {
    if (selectedIds.size === 0) return;
    setActionLoading('bulk');
    let successCount = 0;
    let failCount = 0;
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        try {
          const { error } = await supabase.functions.invoke('internship-applications', {
            method: 'PATCH',
            body: { application_id: id, status: bulkStatus },
          });
          if (error) {
            await supabase.from('internship_applications' as any).update({ status: bulkStatus }).eq('id', id);
            failCount++;
          } else {
            successCount++;
          }
        } catch {
          failCount++;
        }
      }
      setSelectedIds(new Set());
      await fetchApplications();

      if (failCount === 0) {
        toast.success('Bulk Complete', `${successCount} statuses updated (emails not sent).`);
      } else {
        toast.warning('Bulk Partial', `${successCount} updated, ${failCount} failed.`);
      }
    } catch (err) {
      console.error('Bulk update error:', err);
      toast.error('Bulk Update Error', 'An unexpected error occurred during bulk update.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Full Name', 'Email', 'Role', 'Status', 'Applied Date', 'LinkedIn', 'GitHub', 'Portfolio', 'University', 'Degree', 'Country', 'Phone', 'Cover Letter', 'Why Growlancer', 'Weekly Availability', 'Notes'];
    const rows = filteredApplications.map(a => [
      a.full_name, a.email, a.role_name, a.status, a.created_at,
      a.linkedin_url || '', a.github_url || '', a.portfolio_url || '',
      a.university || '', a.degree || '', a.country || '', a.phone || '',
      `"${(a.cover_letter || '').replace(/"/g, '""')}"`,
      `"${(a.why_growlancer || '').replace(/"/g, '""')}"`,
      a.weekly_availability?.toString() || '', `"${(a.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `internship-applications-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredApplications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredApplications.map(a => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setRoleFilter('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const stats = {
    total: applications.length,
    applied: applications.filter(a => a.status === 'applied').length,
    shortlisted: applications.filter(a => a.status === 'shortlisted').length,
    interview: applications.filter(a => a.status === 'interview_scheduled').length,
    selected: applications.filter(a => a.status === 'selected').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  };

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Internship Applications</h1>
        <p className="text-slate-400 text-sm mt-1">Manage, review, and process internship applications</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-100' },
          { label: 'Applied', value: stats.applied, color: 'text-blue-400' },
          { label: 'Shortlisted', value: stats.shortlisted, color: 'text-amber-400' },
          { label: 'Interview', value: stats.interview, color: 'text-purple-400' },
          { label: 'Selected', value: stats.selected, color: 'text-emerald-400' },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-400' },
        ].map((stat, i) => (
          <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters + Actions */}
      <div className="space-y-3" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '1rem' }}>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, university..." className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
            </div>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              className="bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer min-w-[120px]">
              <option value="all">All Roles</option>
              <option value="frontend-dev">Frontend</option>
              <option value="backend-supabase">Backend</option>
              <option value="qa-testing">QA</option>
              <option value="ui-ux-design">UI/UX</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer min-w-[120px]">
              <option value="all">All Status</option>
              <option value="applied">Applied</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="interview_scheduled">Interview</option>
              <option value="selected">Selected</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExportCSV}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-emerald-400 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={() => void fetchApplications()}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-800/50 border border-white/5 text-xs text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          <span className="text-xs text-slate-500">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-slate-800/50 border border-white/5 text-xs text-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          {(dateFrom || dateTo || searchQuery || roleFilter !== 'all' || statusFilter !== 'all') && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:text-red-300 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
              <FilterX className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-50 flex items-center justify-between px-5 py-3 rounded-2xl animate-fade-in"
          style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white">{selectedIds.size} selected</span>
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value as ApplicationStatus)}
              className="bg-slate-800 border border-white/10 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer">
              <option value="shortlisted">→ Shortlist</option>
              <option value="interview_scheduled">→ Interview</option>
              <option value="selected">→ Select</option>
              <option value="rejected">→ Reject</option>
            </select>
            <button onClick={handleBulkStatusUpdate} disabled={actionLoading === 'bulk'}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {actionLoading === 'bulk' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
              Apply
            </button>
          </div>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
            Clear Selection
          </button>
        </div>
      )}

      {/* Applications List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">No applications found</p>
          </div>
        ) : (
          <>
            {filteredApplications.length > 0 && (
              <div className="flex items-center gap-3 px-1 py-1" style={{ color: '#64748B' }}>
                <button
                  ref={selectAllRef}
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider hover:text-emerald-400 transition-colors"
                >
                  {selectedIds.size === filteredApplications.length ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  {selectedIds.size === filteredApplications.length ? 'Deselect All' : 'Select All'} ({filteredApplications.length})
                </button>
              </div>
            )}
          {filteredApplications.map(app => (
            <div
              key={app.id}
              className="rounded-2xl overflow-hidden transition-all duration-200"
              style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              {/* Card Header */}
              <div
                className="p-5 flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(app.id); }}
                    className="mt-0.5 shrink-0 hover:text-emerald-400 transition-colors"
                  >
                    {selectedIds.has(app.id) ? (
                      <CheckSquare className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-500" />
                    )}
                  </button>
                  <div className="h-12 w-12 rounded-xl bg-slate-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {app.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-bold text-white text-sm">{app.full_name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[app.status]}`}>
                        {STATUS_LABELS[app.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{app.role_name}</span>
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{app.email}</span>
                      {app.country && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{app.country}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelativeTime(app.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}>
                  {expandedId === app.id ? (
                    <ChevronUp className="w-5 h-5 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-500" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === app.id && (
                <div className="border-t border-white/5 px-5 py-5 space-y-6 animate-fade-in">
                  {/* Quick Actions - Status Update Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => handleStatusChange(app.id, 'shortlisted', sendEmailOnStatus[app.id])}
                      disabled={actionLoading === `status-${app.id}` || app.status === 'shortlisted'}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-30 transition-colors">
                      Shortlist
                    </button>
                    <button onClick={() => handleStatusChange(app.id, 'interview_scheduled', sendEmailOnStatus[app.id])}
                      disabled={actionLoading === `status-${app.id}` || app.status === 'interview_scheduled'}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 disabled:opacity-30 transition-colors">
                      Interview Scheduled
                    </button>
                    <button onClick={() => handleStatusChange(app.id, 'selected', sendEmailOnStatus[app.id])}
                      disabled={actionLoading === `status-${app.id}` || app.status === 'selected'}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 transition-colors">
                      Select
                    </button>
                    <button onClick={() => handleStatusChange(app.id, 'rejected', sendEmailOnStatus[app.id])}
                      disabled={actionLoading === `status-${app.id}` || app.status === 'rejected'}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-30 transition-colors">
                      Reject
                    </button>
                    <button onClick={() => handleDeleteApplication(app.id, app.full_name)}
                      disabled={actionLoading === `delete-${app.id}`}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-30 transition-colors flex items-center gap-1">
                      {actionLoading === `delete-${app.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </button>
                    <label className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-700/30 text-slate-400 text-[10px] font-bold cursor-pointer hover:bg-slate-700/50 hover:text-emerald-400 transition-colors select-none"
                      onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={!!sendEmailOnStatus[app.id]}
                        onChange={(e) => setSendEmailOnStatus(prev => ({ ...prev, [app.id]: e.target.checked }))}
                        className="w-3 h-3 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500/20 cursor-pointer" />
                      <Send className="w-3 h-3" />
                      Auto Email
                    </label>
                  </div>

                  {/* Type-Specific Send Email Buttons - One per status */}
                  {app.status === 'shortlisted' && (
                    <div className="p-4 rounded-xl flex items-center justify-between" style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <Send className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-amber-400">Send Shortlisted Email</h4>
                          <p className="text-[10px] text-slate-500">Notify {app.full_name} they have been shortlisted for interview</p>
                        </div>
                      </div>
                      <button onClick={() => handleSendEmail(app.id)}
                        disabled={actionLoading === `email-${app.id}`}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-30 text-white text-xs font-bold transition-all">
                        {actionLoading === `email-${app.id}` ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</> : <><Send className="w-3.5 h-3.5" /> Send</>}
                      </button>
                    </div>
                  )}

                  {app.status === 'interview_scheduled' && (
                    <div className="p-4 rounded-xl flex items-center justify-between" style={{ background: 'rgba(124, 58, 237, 0.05)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                          <Send className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-purple-400">Send Interview Invitation</h4>
                          <p className="text-[10px] text-slate-500">Send Google Meet link & time to {app.full_name}</p>
                        </div>
                      </div>
                      <button onClick={() => handleSendEmail(app.id)}
                        disabled={actionLoading === `email-${app.id}`}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-30 text-white text-xs font-bold transition-all">
                        {actionLoading === `email-${app.id}` ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</> : <><Send className="w-3.5 h-3.5" /> Send</>}
                      </button>
                    </div>
                  )}

                  {app.status === 'selected' && (
                    <div className="p-4 rounded-xl flex items-center justify-between" style={{ background: 'rgba(5, 150, 105, 0.05)', border: '1px solid rgba(5, 150, 105, 0.2)' }}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <Send className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-emerald-400">Send Selected Email</h4>
                          <p className="text-[10px] text-slate-500">Send offer letter, NDA & documents to {app.full_name}</p>
                        </div>
                      </div>
                      <button onClick={() => handleSendEmail(app.id)}
                        disabled={actionLoading === `email-${app.id}`}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 text-white text-xs font-bold transition-all">
                        {actionLoading === `email-${app.id}` ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</> : <><Send className="w-3.5 h-3.5" /> Send</>}
                      </button>
                    </div>
                  )}

                  {app.status === 'rejected' && (
                    <div className="p-4 rounded-xl flex items-center justify-between" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                          <Send className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-red-400">Send Rejection Email</h4>
                          <p className="text-[10px] text-slate-500">Politely inform {app.full_name} about the decision</p>
                        </div>
                      </div>
                      <button onClick={() => handleSendEmail(app.id)}
                        disabled={actionLoading === `email-${app.id}`}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-30 text-white text-xs font-bold transition-all">
                        {actionLoading === `email-${app.id}` ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</> : <><Send className="w-3.5 h-3.5" /> Send</>}
                      </button>
                    </div>
                  )}

                  {/* Interview Scheduling - Google Meet + Time */}
                  {(app.status === 'shortlisted' || app.status === 'interview_scheduled') && (
                    <div className="p-4 rounded-xl" style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(124, 58, 237, 0.2)' }}>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-purple-400" />
                        Interview Scheduling
                        {app.status === 'interview_scheduled' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 ml-1">
                            Scheduled
                          </span>
                        )}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Google Meet Link</label>
                          <div className="relative">
                            <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                            <input
                              type="url"
                              value={meetLinkInput[app.id] ?? app.google_meet_link ?? ''}
                              onChange={(e) => setMeetLinkInput(prev => ({ ...prev, [app.id]: e.target.value }))}
                              placeholder="https://meet.google.com/..."
                              className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 placeholder-slate-600"
                            />
                          </div>
                          {app.google_meet_link && !meetLinkInput[app.id] && (
                            <p className="text-[10px] text-slate-500 mt-1">Current: {app.google_meet_link}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Interview Date & Time</label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                            <input
                              type="datetime-local"
                              value={interviewTimeInput[app.id] ?? (app.interview_time ? app.interview_time.slice(0, 16) : '')}
                              onChange={(e) => setInterviewTimeInput(prev => ({ ...prev, [app.id]: e.target.value }))}
                              className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 [color-scheme:dark]"
                            />
                          </div>
                          {app.interview_time && !interviewTimeInput[app.id] && (
                            <p className="text-[10px] text-slate-500 mt-1">Current: {new Date(app.interview_time).toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                      {app.status === 'interview_scheduled' && (
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => handleStatusChange(app.id, 'interview_scheduled')}
                            disabled={actionLoading === `status-${app.id}`}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-30 text-white text-xs font-bold transition-all"
                          >
                            {actionLoading === `status-${app.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
                            Save Interview Details
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Contact Info & Links */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                            <a href={`tel:${app.phone}`} className="hover:text-emerald-400 transition-colors">{app.phone}</a>
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
                        {app.graduation_year && (
                          <p className="flex items-center gap-2 text-slate-300">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            Graduation: {app.graduation_year}
                          </p>
                        )}
                        {!app.university && !app.degree && (
                          <p className="text-slate-500 text-xs">Not provided</p>
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

                  {/* Resume */}
                  {getResumeDownloadUrl(app) && (
                    <div>
                      <a
                        href={getResumeDownloadUrl(app)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {app.resume_file_name || 'Download Resume'}
                      </a>
                    </div>
                  )}

                  {/* Documents Section - Upload Offer Letter, NDA, Internship Letter */}
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Internship Documents
                      {app.status === 'selected' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-1">
                          Upload PDFs for Selected Intern
                        </span>
                      )}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { key: 'offer_letter_url' as const, label: 'Offer Letter', icon: ScrollText, desc: 'Formal offer letter PDF' },
                        { key: 'nda_url' as const, label: 'NDA', icon: ShieldCheck, desc: 'Non-Disclosure Agreement PDF' },
                        { key: 'internship_letter_url' as const, label: 'Internship Letter', icon: FileText, desc: 'Internship confirmation letter PDF' },
                      ].map(({ key, label, icon: Icon, desc }) => {
                        const docKey = `${app.id}-${key}`;
                        const isUploading = uploadingDoc[docKey]?.loading;
                        const existingUrl = app[key];
                        return (
                          <div key={key} className="p-4 rounded-xl" style={{ background: 'rgba(15, 23, 42, 0.5)', border: existingUrl ? '1px solid rgba(5, 150, 105, 0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className={`w-4 h-4 ${existingUrl ? 'text-emerald-400' : 'text-slate-500'}`} />
                              <span className="text-sm font-semibold text-slate-300">{label}</span>
                              {existingUrl && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ml-auto">
                                  Uploaded
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mb-3">{desc}</p>
                            <div className="flex gap-2">
                              <label className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                                isUploading
                                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                  : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              }`}>
                                {isUploading ? (
                                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
                                ) : (
                                  <><FileUp className="w-3.5 h-3.5" /> {existingUrl ? 'Replace' : 'Upload PDF'}</>
                                )}
                                <input
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  disabled={isUploading}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleDocumentUpload(app.id, key, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {existingUrl && (
                                <a
                                  href={existingUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-slate-700/50 text-slate-400 text-xs font-bold hover:text-emerald-400 transition-colors"
                                  title="Download PDF"
                                >
                                  <FileDown className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cover Letter */}
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Cover Letter</h4>
                    <div className="p-4 rounded-xl text-sm text-slate-300 leading-relaxed" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                      {app.cover_letter}
                    </div>
                  </div>

                  {/* Why Growlancer */}
                  {app.why_growlancer && (
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Why Growlancer?</h4>
                      <div className="p-4 rounded-xl text-sm text-slate-300 leading-relaxed" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                        {app.why_growlancer}
                      </div>
                    </div>
                  )}

                  {/* Availability */}
                  {(app.weekly_availability || app.available_from) && (
                    <div className="p-4 rounded-xl flex flex-wrap gap-6" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                      {app.weekly_availability && (
                        <p className="flex items-center gap-2 text-sm text-slate-300">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          {app.weekly_availability} hrs/week
                        </p>
                      )}
                      {app.available_from && (
                        <p className="flex items-center gap-2 text-sm text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          From: {formatDate(app.available_from)}
                        </p>
                      )}
                      {app.available_from && (
                        <p className="flex items-center gap-2 text-sm text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          To: {formatDate(app.available_to || app.available_from)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Email Log */}
                  {emailLogs[app.id] && emailLogs[app.id].length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5" /> Email Log
                      </h4>
                      <div className="space-y-1.5">
                        {emailLogs[app.id].map((log, i) => (
                          <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
                            <Mail className={`w-3 h-3 ${log.sent ? 'text-emerald-400' : 'text-red-400'}`} />
                            <span className="text-slate-300 font-medium uppercase text-[10px]">{log.status.replace('_', ' ')}</span>
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

                  {/* Notes */}
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Admin Notes</h4>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={notesInput[app.id] || ''}
                        onChange={(e) => setNotesInput(prev => ({ ...prev, [app.id]: e.target.value }))}
                        placeholder="Add a note..."
                        className="flex-1 px-4 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                      <button
                        onClick={() => handleStatusChange(app.id, app.status)}
                        disabled={!notesInput[app.id]?.trim()}
                        className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 disabled:opacity-30 transition-colors"
                      >
                        Save Note
                      </button>
                    </div>
                    {app.notes && (
                      <p className="mt-2 text-xs text-slate-500 italic">Previous note: {app.notes}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          </>
        )}
      </div>
    </div>
  );
}