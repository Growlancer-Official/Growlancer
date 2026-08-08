import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminQuery, adminUpdate } from '../../lib/adminDataProxy';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import {
  AlertCircle,
  Bug,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  Mail,
  Megaphone,
  MessageSquareHeart,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Star,
} from 'lucide-react';
import { safeFormatDate } from '../../utils/date';

interface UserReport {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  report_type: 'bug' | 'feature' | 'feedback' | 'security' | 'other';
  category: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  page_url: string | null;
  browser_info: string | null;
  status: 'new' | 'reviewing' | 'resolved' | 'wontfix';
  created_at: string;
}

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  bug: { label: 'Bug', icon: Bug, color: 'bg-red-100 text-red-700' },
  feature: { label: 'Feature', icon: Sparkles, color: 'bg-blue-100 text-blue-700' },
  feedback: { label: 'Feedback', icon: MessageSquareHeart, color: 'bg-emerald-100 text-emerald-700' },
  security: { label: 'Security', icon: Shield, color: 'bg-purple-100 text-purple-700' },
  other: { label: 'Other', icon: Megaphone, color: 'bg-slate-100 text-slate-700' },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700' },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-700' },
  reviewing: { label: 'Reviewing', color: 'bg-amber-100 text-amber-700' },
  resolved: { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700' },
  wontfix: { label: 'Won\'t Fix', color: 'bg-slate-100 text-slate-600' },
};

const STATUS_FLOW = ['new', 'reviewing', 'resolved', 'wontfix'];

export function AdminUserReportsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminQuery<UserReport>({
        table: 'user_reports',
        order: 'created_at',
        orderDir: 'desc',
        limit: 200,
      });
      setReports(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchReports();

    if (!user?.id) return;
    // Real-time: new reports appear instantly (admin RLS policy allows reads).
    const channel = supabase
      .channel('admin-user-reports-' + user.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_reports' },
        () => { void fetchReports(); }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, fetchReports]);

  const handleStatusChange = async (report: UserReport, nextStatus: string) => {
    setUpdatingId(report.id);
    setError(null);
    try {
      await adminUpdate('user_reports', report.id, {
        status: nextStatus,
        updated_at: new Date().toISOString(),
      });
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status: nextStatus as UserReport['status'] } : r))
      );
      toast.success('Status updated', `Report marked as ${nextStatus}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
      toast.error('Update failed', 'Could not update report status');
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = reports.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter !== 'all' && r.report_type !== typeFilter) return false;
    if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${r.title} ${r.description} ${r.name} ${r.email || ''} ${r.category || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    new: reports.filter((r) => r.status === 'new').length,
    reviewing: reports.filter((r) => r.status === 'reviewing').length,
    resolved: reports.filter((r) => r.status === 'resolved').length,
    critical: reports.filter((r) => r.priority === 'critical' && r.status !== 'resolved').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Inbox className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">User Reports & Feedback</h1>
            <p className="text-slate-500 text-sm">Triage bug reports, feature requests and feedback</p>
          </div>
        </div>
        <button
          onClick={() => void fetchReports()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">New</p>
          <p className="text-2xl font-bold text-blue-600">{counts.new}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Reviewing</p>
          <p className="text-2xl font-bold text-amber-600">{counts.reviewing}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Resolved</p>
          <p className="text-2xl font-bold text-emerald-600">{counts.resolved}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Open Critical</p>
          <p className="text-2xl font-bold text-red-600">{counts.critical}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, name, email…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="all">All Status</option>
          <option value="new">New</option>
          <option value="reviewing">Reviewing</option>
          <option value="resolved">Resolved</option>
          <option value="wontfix">Won't Fix</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="all">All Types</option>
          <option value="bug">Bug</option>
          <option value="feature">Feature</option>
          <option value="feedback">Feedback</option>
          <option value="security">Security</option>
          <option value="other">Other</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="all">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <Inbox className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <h3 className="font-semibold text-slate-900 mb-1">No reports found</h3>
          <p className="text-sm text-slate-500">Reports submitted by users will appear here in real time.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((report) => {
            const typeMeta = TYPE_META[report.report_type] || TYPE_META.other;
            const priorityMeta = PRIORITY_META[report.priority] || PRIORITY_META.medium;
            const statusMeta = STATUS_META[report.status] || STATUS_META.new;
            const expanded = expandedId === report.id;
            const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(report.status) + 1];

            return (
              <div key={report.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : report.id)}
                  className="w-full flex flex-col sm:flex-row sm:items-center gap-3 p-5 text-left hover:bg-slate-50/60 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${typeMeta.color}`}>
                    <typeMeta.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${priorityMeta.color}`}>
                        {priorityMeta.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${statusMeta.color}`}>
                        {statusMeta.label}
                      </span>
                      {report.category && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          {report.category}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-slate-900 mt-1.5 truncate">{report.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {report.name || 'Guest'}{report.email ? ` · ${report.email}` : ''} · {safeFormatDate(report.created_at, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {nextStatus && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleStatusChange(report, nextStatus);
                        }}
                        disabled={updatingId === report.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      >
                        {updatingId === report.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Mark {nextStatus}
                      </button>
                    )}
                    {expanded ? <Clock className="w-4 h-4 text-slate-400" /> : <Star className="w-4 h-4 text-slate-300" />}
                  </div>
                </button>

                {expanded && (
                  <div className="px-5 pb-5 pt-1 border-t border-slate-100">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{report.description}</p>
                    {(report.page_url || report.browser_info) && (
                      <div className="mt-4 p-4 bg-slate-50 rounded-xl text-xs space-y-2">
                        {report.page_url && (
                          <p className="flex items-start gap-2">
                            <span className="text-slate-400 font-semibold w-14 shrink-0">Page</span>
                            <a href={report.page_url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline break-all">
                              {report.page_url}
                            </a>
                          </p>
                        )}
                        {report.browser_info && (
                          <p className="flex items-start gap-2">
                            <span className="text-slate-400 font-semibold w-14 shrink-0">Browser</span>
                            <span className="text-slate-600 break-all">{report.browser_info}</span>
                          </p>
                        )}
                        {report.user_id && (
                          <p className="flex items-start gap-2">
                            <span className="text-slate-400 font-semibold w-14 shrink-0">User</span>
                            <span className="text-slate-600 font-mono">{report.user_id}</span>
                          </p>
                        )}
                        {report.email && (
                          <p className="flex items-start gap-2">
                            <span className="text-slate-400 font-semibold w-14 shrink-0">Email</span>
                            <a href={`mailto:${report.email}`} className="text-emerald-700 hover:underline break-all">
                              <Mail className="w-3 h-3 inline mr-1" />
                              {report.email}
                            </a>
                          </p>
                        )}
                      </div>
                    )}
                    {/* Manual status controls */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Set status:</span>
                      {STATUS_FLOW.map((s) => (
                        <button
                          key={s}
                          onClick={() => void handleStatusChange(report, s)}
                          disabled={updatingId === report.id || report.status === s}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            report.status === s
                              ? `${STATUS_META[s].color} border-transparent`
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {STATUS_META[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
