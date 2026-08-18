import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { teamProjectsService, type TeamProject } from '../lib/teamProjects';
import { ArrowRight, Plus, Users } from 'lucide-react';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { TipNote } from '../components/TipNote';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open:        { label: 'Open',        cls: 'bg-emerald-100 text-emerald-700' },
  in_progress: { label: 'In Progress', cls: 'bg-violet-100 text-violet-700' },
  completed:   { label: 'Completed',   cls: 'bg-sky-100 text-sky-700' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-slate-100 text-slate-500' },
};

export function ClientTeamProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const res = await teamProjectsService.listProjects(user.id);
    if (res.error) {
      setError(res.error);
    } else {
      setProjects(res.data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingSkeleton variant="full-page" />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Team Projects</h1>
          </div>
          <p className="text-slate-600 mt-1">
            Hire a whole team for bigger projects — each freelancer has their own protected escrow.
          </p>
        </div>
        <Link
          to="/client/team-projects/create"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all"
        >
          <Plus className="w-4 h-4" /> Post a Team Project
        </Link>
      </div>

      <TipNote tone="info" compact className="mb-6">
        Each role gets its own <strong>independent contract</strong> (own escrow / milestones / dispute). One member's issue never affects the rest of the team. Commission (5%) applies per contract — no separate team fee.
      </TipNote>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm mb-6">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-800 mb-1">No team projects yet</h2>
          <p className="text-slate-500 text-sm mb-5">
            Designer + Developer + Writer — sab ek project me hire karo, har ek apne contract ke saath.
          </p>
          <Link to="/client/team-projects/create" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-all">
            <Plus className="w-4 h-4" /> Post Your First Team Project
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const meta = STATUS_META[p.status] || STATUS_META.open;
            return (
              <Link
                key={p.id}
                to={`/client/team-projects/${p.id}`}
                className="block bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-violet-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 group-hover:text-violet-700">{p.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5 truncate">{p.description || 'No description'}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${meta.cls}`}>{meta.label}</span>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
