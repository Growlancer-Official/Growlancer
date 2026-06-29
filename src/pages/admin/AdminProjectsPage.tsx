import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, Loader2, RefreshCw, Search, CheckCircle, XCircle,
  ArrowRight, Trash2
} from 'lucide-react';
import { adminQuery, adminUpdate, adminDelete } from '../../lib/adminDataProxy';
import { supabase, realtimeChannels } from '../../lib/supabase';

interface AdminProject {
  id: string; title: string; description: string;
  budget_min: number | null; budget_max: number | null;
  status: string; category: string | null; skills: string[];
  client_id: string; created_at: string; visibility: string | null;
  client?: { name: string; email: string } | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

const statusColors: Record<string, string> = {
  open: 'bg-emerald-500/10 text-emerald-400',
  in_progress: 'bg-blue-500/10 text-blue-400',
  completed: 'bg-slate-500/10 text-slate-400',
  cancelled: 'bg-red-500/10 text-red-400',
};

export function AdminProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const opts: any = {
        table: 'projects',
        select: 'id, title, description, budget_min, budget_max, status, category, skills, client_id, created_at, visibility',
        order: 'created_at',
        orderDir: 'desc',
        limit: 100,
      };
      if (statusFilter !== 'all') opts.filters = { status: statusFilter };

      const { data, error } = await adminQuery(opts);
      if (error) throw error;

      const projs = (data || []) as AdminProject[];
      const clientIds = [...new Set(projs.map(p => p.client_id))];
      const { data: clients } = await adminQuery({ table: 'profiles', select: 'id, name, email', in: { id: clientIds } });
      const clientMap = new Map((clients || []).map(c => [c.id, { name: c.name, email: c.email }]));
      const projectsWithClients = projs.map(p => ({ ...p, client: clientMap.get(p.client_id) || null }));

      setProjects(projectsWithClients);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => {
    const channel = realtimeChannels.projects(`admin-projects-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchProjects())
      .subscribe();
    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [fetchProjects]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpenDropdown(null);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleUpdateStatus = async (projectId: string, status: string, title: string) => {
    if (!confirm(`Update "${title}" status to "${status.replace('_', ' ')}"?`)) return;
    setActionLoading(`${projectId}-${status}`);
    try {
      await adminUpdate('projects', projectId, { status, updated_at: new Date().toISOString() });
      await fetchProjects();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); setOpenDropdown(null); }
  };

  const handleDeleteProject = async (projectId: string, title: string) => {
    if (!confirm(`🗑️ Delete project "${title}"? This cannot be undone!`)) return;
    setActionLoading(`delete-${projectId}`);
    try {
      await adminDelete('projects', projectId);
      await fetchProjects();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  };

  const handleViewProject = (projectId: string) => {
    window.open(`/projects/${projectId}`, '_blank');
    setOpenDropdown(null);
  };

  const stats = {
    total: projects.length,
    open: projects.filter(p => p.status === 'open').length,
    inProgress: projects.filter(p => p.status === 'in_progress').length,
    completed: projects.filter(p => p.status === 'completed').length,
    cancelled: projects.filter(p => p.status === 'cancelled').length,
    totalBudget: projects.reduce((sum, p) => sum + (p.budget_max || 0), 0),
  };

  const filteredProjects = projects.filter(p =>
    p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-white">Projects</h1>
        <p className="text-slate-400 text-sm mt-1">Browse and moderate all platform projects</p>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-100' },
          { label: 'Open', value: stats.open, color: 'text-emerald-400' },
          { label: 'In Progress', value: stats.inProgress, color: 'text-blue-400' },
          { label: 'Completed', value: stats.completed, color: 'text-slate-400' },
          { label: 'Cancelled', value: stats.cancelled, color: 'text-red-400' },
          { label: 'Total Budget', value: formatCurrency(stats.totalBudget), color: 'text-emerald-400' },
        ].map((stat, i) => (
          <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
        style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '1rem' }}>
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects..." className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer">
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button onClick={fetchProjects}
          className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="rounded-[2rem] overflow-hidden" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-white/5">
                <th className="px-6 py-4">Project</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Budget</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></td></tr>
              ) : filteredProjects.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500 text-xs">No projects found</td></tr>
              ) : (
                filteredProjects.map(project => (
                  <tr key={project.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-white text-sm">{project.title}</p>
                      <p className="text-[10px] text-slate-500 line-clamp-1">{project.description}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-300">{project.client?.name || 'Unknown'}</p>
                      <p className="text-[10px] text-slate-500">{project.client?.email || ''}</p>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      {project.budget_min ? formatCurrency(project.budget_min) : '—'} - {project.budget_max ? formatCurrency(project.budget_max) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${statusColors[project.status] || 'text-slate-400'}`}>
                        {project.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">{project.category || '—'}</td>
                    <td className="px-6 py-4 text-[10px] text-slate-500">{formatRelativeTime(project.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1" ref={openDropdown === project.id ? dropdownRef : undefined}>
                        <button onClick={() => handleViewProject(project.id)}
                          className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors" title="View Project">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {project.status === 'open' && (
                          <button onClick={() => handleUpdateStatus(project.id, 'in_progress', project.title)}
                            disabled={actionLoading === `${project.id}-in_progress`}
                            className="p-1.5 hover:bg-blue-500/10 rounded-lg text-blue-400 transition-colors" title="Mark In Progress">
                            {actionLoading === `${project.id}-in_progress` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {project.status === 'open' && (
                          <button onClick={() => handleUpdateStatus(project.id, 'cancelled', project.title)}
                            disabled={actionLoading === `${project.id}-cancelled`}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors" title="Cancel Project">
                            {actionLoading === `${project.id}-cancelled` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {project.status === 'in_progress' && (
                          <button onClick={() => handleUpdateStatus(project.id, 'completed', project.title)}
                            disabled={actionLoading === `${project.id}-completed`}
                            className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-emerald-400 transition-colors" title="Mark Completed">
                            {actionLoading === `${project.id}-completed` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {project.status !== 'completed' && (
                          <button onClick={() => handleDeleteProject(project.id, project.title)}
                            disabled={actionLoading === `delete-${project.id}`}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors" title="Delete Project">
                            {actionLoading === `delete-${project.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
