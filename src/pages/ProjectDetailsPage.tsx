import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Briefcase, Clock, DollarSign, Home, Tag, User } from 'lucide-react';
import { ROUTES } from '../routes';

interface ProjectDetails {
  id: string;
  title: string;
  description: string;
  budget_min: number;
  budget_max: number;
  skills_required: string[];
  status: string;
  deadline: string | null;
  category: string;
  experience_level: string;
  created_at: string;
  proposals_count?: number;
  client?: {
    name: string | null;
    avatar: string | null;
  };
}

export function ProjectDetailsPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const fetchProject = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('projects')
        .select('*, profiles!projects_client_id_fkey(name, avatar)')
        .eq('id', projectId)
        .single();

      if (error) {
        setError('Unable to load this project. It may have been removed.');
        setProject(null);
      } else {
        setProject(data as ProjectDetails);
      }

      setLoading(false);
    };

    void fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream px-4">
        <div className="animate-spin h-12 w-12 rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <main className="min-h-screen bg-cream flex items-center justify-center px-4 py-12">
        <div className="max-w-xl w-full bg-white rounded-3xl border border-slate-200 p-8 shadow-lg">
          <div className="text-center">
            <Briefcase className="mx-auto h-14 w-14 text-emerald-500 mb-4" />
            <h1 className="text-4xl font-display font-black text-slate-900 mb-2">Project not found</h1>
            <p className="text-sm text-slate-500 mb-6">
              {error ?? 'We could not find the project you were looking for.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to={ROUTES.HOME}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Home
              </Link>
              <Link
                to="/client/post"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Post a Project
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cream px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              to={ROUTES.HOME}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
            <h1 className="mt-4 text-4xl font-display font-black tracking-tight text-slate-900">
              {project.title}
            </h1>
            <p className="mt-2 text-slate-600 max-w-3xl">{project.description}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3 text-sm text-slate-500 mb-4">
              <User className="w-4 h-4" />
              <span>{project.client?.name ?? 'Client'}</span>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <span>{`Budget ${project.budget_min.toLocaleString()} - ${project.budget_max.toLocaleString()} USD`}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>{project.deadline ? new Date(project.deadline).toLocaleDateString() : 'No deadline'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-slate-500" />
                <span>{project.category}</span>
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-slate-500" />
                <span>{project.experience_level}</span>
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">
                {project.status || 'Open'} project
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <section className="space-y-8">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Project details</h2>
              <div className="space-y-4 text-slate-600">
                <div>
                  <div className="text-sm uppercase tracking-[0.2em] text-slate-500 font-semibold mb-2">Description</div>
                  <p className="leading-relaxed">{project.description}</p>
                </div>
                <div>
                  <div className="text-sm uppercase tracking-[0.2em] text-slate-500 font-semibold mb-2">Skills required</div>
                  <div className="flex flex-wrap gap-2">
                    {project.skills_required.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Proposals</h2>
              <p className="text-slate-600">
                This project has <span className="font-semibold text-slate-900">{project.proposals_count ?? 0}</span> proposals so far.
              </p>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Next steps</h3>
              <div className="space-y-3 text-slate-600 text-sm">
                <p>Log in to respond, review proposals, or invite freelancers.</p>
                <Link
                  to="/?modal=login"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  Login to continue
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Need a fresh project?</h3>
              <p className="text-slate-600 text-sm mb-4">Create a new posting and attract more qualified freelancers.</p>
              <Link
                to="/client/post"
                className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors"
              >
                Post a project
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
