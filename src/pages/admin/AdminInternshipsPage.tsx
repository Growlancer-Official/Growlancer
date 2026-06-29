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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Briefcase,
  MapPin,
  Building,
  BookOpen,
  Award,
  MoreHorizontal,
  X,
  Link2,
  CheckSquare,
  Square,
  FilterX,
  Upload,
  History,
  CheckCheck,
  Trash2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
  weekly_availability: number | null;
  available_from: string | null;
  available_to: string | null;
  status: ApplicationStatus;
  notes: string | null;
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

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch via edge function (uses service_role key, bypasses RLS)
      const { data: fnData, error } = await supabase.functions.invoke(
        'internship-applications',
        { method: 'GET' }
      );
      
      if (error) throw error;
      
      // Apply client-side date range filter
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
      setLoading(false);
    }
  }, [roleFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase.channel(`admin-internships-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internship_applications' }, () => fetchApplications())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [fetchApplications]);

  const handleDeleteApplication = async (id: string, name: string) => {
    if (!confirm(`🗑️ Delete application from "${name}"? This cannot be undone!`)) return;
    setActionLoading(`delete-${id}`);
    try {
      await supabase.functions.invoke('internship-applications', {
        method: 'DELETE',
        body: { application_id: id },
      }).catch(async () => {
        // Fallback: delete via edge function admin-data
        await supabase.functions.invoke('admin-data', {
          method: 'DELETE',
          body: { table: 'internship_applications', id },
        });
      });
      await fetchApplications();
    } catch (err) { console.error('Delete error:', err); }
    finally { setActionLoading(null); }
  };

  const handleStatusChange = async (id: string, status: ApplicationStatus) => {
    setActionLoading(`status-${id}`);
    try {
      const notes = notesInput[id] || undefined;
      const { error } = await supabase.functions.invoke('internship-applications', {
        method: 'PATCH',
        body: { application_id: id, status, notes },
      });
      if (error) {
        console.error('Status update via edge function failed:', error);
        await supabase
          .from('internship_applications')
          .update({ status, notes: notes || null })
          .eq('id', id);
      }
      setNotesInput(prev => ({ ...prev, [id]: '' }));
      setEmailLogs(prev => ({
        ...prev,
        [id]: [...(prev[id] || []), { status, sent: true, time: new Date().toISOString() }],
      }));
      await fetchApplications();
    } catch (err) {
      console.error('Status update error:', err);
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
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await supabase.functions.invoke('internship-applications', {
          method: 'PATCH',
          body: { application_id: id, status: bulkStatus },
        }).catch(() =>
          supabase.from('internship_applications').update({ status: bulkStatus }).eq('id', id)
        );
        setEmailLogs(prev => ({
          ...prev,
          [id]: [...(prev[id] || []), { status: bulkStatus, sent: true, time: new Date().toISOString() }],
        }));
      }
      setSelectedIds(new Set());
      await fetchApplications();
    } catch (err) {
      console.error('Bulk update error:', err);
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
        {/* Row 1: Search + Filters */}
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
            {/* CSV Export */}
            <button onClick={handleExportCSV}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-emerald-400 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            {/* Refresh */}
            <button onClick={fetchApplications}
              className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
        {/* Row 2: Date Range */}
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
            {/* Select All Header */}
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
                  {/* Bulk Select Checkbox */}
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
                  {/* Quick Actions */}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleStatusChange(app.id, 'shortlisted')}
                      disabled={actionLoading === `status-${app.id}` || app.status === 'shortlisted'}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-30 transition-colors">
                      Shortlist
                    </button>
                    <button onClick={() => handleStatusChange(app.id, 'interview_scheduled')}
                      disabled={actionLoading === `status-${app.id}` || app.status === 'interview_scheduled'}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 disabled:opacity-30 transition-colors">
                      Interview Scheduled
                    </button>
                    <button onClick={() => handleStatusChange(app.id, 'selected')}
                      disabled={actionLoading === `status-${app.id}` || app.status === 'selected'}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 transition-colors">
                      Select
                    </button>
                    <button onClick={() => handleStatusChange(app.id, 'rejected')}
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
                  </div>

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