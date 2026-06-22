import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { realtimeChannels, tables } from '../lib/supabase';
import { Briefcase, Clock, Copy, DollarSign, Edit, Edit3, Eye, Filter, MoreVertical, Plus, Trash2, View,  } from 'lucide-react';

/* ── Dropdown menu for each project card ── */
function ProjectMenu({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-2 hover:bg-slate-100 rounded-lg transition-colors relative z-10"
      >
        <MoreVertical className="w-5 h-5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white rounded-xl border border-slate-200 shadow-xl py-1.5 animate-in fade-in slide-in-from-top-1">
          <Link
            to={`/client/matches?project_id=${projectId}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            onClick={() => setOpen(false)}
          >
            <Eye className="w-4 h-4 text-slate-400" />
            <span>AI Matches</span>
          </Link>
          <Link
            to={`/client/proposals`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            onClick={() => setOpen(false)}
          >
            <Copy className="w-4 h-4 text-slate-400" />
            <span>View Proposals</span>
          </Link>
          <Link
            to={`/client/post?edit=${projectId}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            onClick={() => setOpen(false)}
          >
            <Edit3 className="w-4 h-4 text-slate-400" />
            <span>Edit Project</span>
          </Link>
          <div className="h-px bg-slate-100 my-1.5 mx-3" />
          <Link
            to={`/client/matches?project_id=${projectId}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            onClick={() => setOpen(false)}
          >
            <Trash2 className="w-4 h-4 text-red-400" />
            <span>Close Project</span>
          </Link>
        </div>
      )}
    </div>
  );
}

interface Project {
  id: string;
  title: string;
  description: string;
  budget_min: number;
  budget_max: number;
  skills_required: string[];
  status: 'open' | 'active' | 'completed' | 'cancelled';
  deadline: string;
  category: string;
  experience_level: 'entry' | 'intermediate' | 'expert';
  created_at: string;
  proposals_count?: number;
}

export function ClientProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'active' | 'completed'>('all');

  const fetchProjects = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await tables.projects()
      .select('*, proposals(count)')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
    } else {
      setProjects(data as unknown as Project[] || []);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    fetchProjects();

    // Set up real-time subscription
    const subscription = realtimeChannels.projects(`client-projects-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
          filter: `client_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setProjects((prev) => [payload.new as Project, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setProjects((prev) =>
              prev.map((p) => (p.id === payload.new.id ? (payload.new as Project) : p))
            );
          } else if (payload.eventType === 'DELETE') {
            setProjects((prev) => prev.filter((p) => p.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id, fetchProjects]);

  const filteredProjects = projects.filter((p) =>
    filter === 'all' ? true : p.status === filter
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-emerald-100 text-emerald-700';
      case 'active':
        return 'bg-blue-100 text-blue-700';
      case 'completed':
        return 'bg-slate-100 text-slate-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const formatBudget = (min: number, max: number) => {
    return `$${min?.toLocaleString()} - $${max?.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">My Projects</h1>
          <p className="text-slate-500 mt-1">Manage your posted projects and track progress</p>
        </div>
        <Link
          to="/client/post"
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25"
        >
          <Plus className="w-5 h-5" />
          Post New Project
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(['all', 'open', 'active', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 font-medium transition-colors ${
              filter === f
                ? 'text-emerald-600 border-b-2 border-emerald-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-100">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Briefcase className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            {filter === 'all' ? 'No projects yet' : `No ${filter} projects`}
          </h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-6">
            {filter === 'all'
              ? 'Post your first project and start receiving proposals from talented freelancers.'
              : `You don\'t have any ${filter} projects at the moment.`}
          </p>
          {filter === 'all' ? (
            <Link
              to="/client/post"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-600/25 transition-all hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5" />
              Post Your First Project
            </Link>
          ) : (
            <Link
              to="/client/projects"
              className="text-emerald-600 font-medium hover:underline text-sm"
            >
              View all projects →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="bg-white p-6 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-display text-lg font-bold text-slate-900">{project.title}</h3>
                    <span
                      className={`px-3 py-1 text-xs font-bold uppercase rounded-full ${getStatusColor(
                        project.status
                      )}`}
                    >
                      {project.status}
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm line-clamp-2">{project.description}</p>
                </div>
                <ProjectMenu projectId={project.id} />
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-slate-500 mb-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  <span>{formatBudget(project.budget_min, project.budget_max)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>
                    {project.deadline
                      ? new Date(project.deadline).toLocaleDateString()
                      : 'No deadline'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  <span>{project.proposals_count || 0} proposals</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {project.skills_required.slice(0, 4).map((skill) => (
                  <span
                    key={skill}
                    className="px-3 py-1 bg-slate-50 text-slate-600 text-xs font-medium rounded-full border border-slate-200"
                  >
                    {skill}
                  </span>
                ))}
                {project.skills_required.length > 4 && (
                  <span className="px-3 py-1 bg-slate-50 text-slate-600 text-xs font-medium rounded-full border border-slate-200">
                    +{project.skills_required.length - 4} more
                  </span>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                <Link
                  to={`/client/matches?project_id=${project.id}`}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700"
                >
                  <Eye className="w-4 h-4" />
                  AI Matches
                </Link>
                <Link
                  to={`/client/proposals`}
                  className="flex items-center gap-2 px-4 py-2 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  View Proposals
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
