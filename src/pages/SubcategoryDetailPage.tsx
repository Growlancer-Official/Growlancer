import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCategories } from '../hooks/useCategories';
import { resolveCategoryMeta } from '../lib/categories';
import { dbFunctions } from '../lib/supabase';
import { AlertCircle, ArrowLeft, ArrowRight, Briefcase, ChevronRight, Clock, DollarSign, ExternalLink, Loader2, MapPin, Search, Star, Users, X,  } from 'lucide-react';

interface Project {
  id: string;
  title: string;
  description: string;
  budget_min: number | null;
  budget_max: number | null;
  experience_level: string | null;
  status: string;
  created_at: string;
  client: { name: string; avatar: string | null };
}

interface Freelancer {
  id: string;
  user_id: string;
  name: string;
  avatar: string | null;
  title: string | null;
  hourly_rate: number | null;
  rating: number | null;
  total_reviews: number | null;
  availability: boolean | null;
  location: string | null;
  skills: string[];
}

interface ProjectsResult {
  total: number;
  projects: Project[];
}

interface FreelancersResult {
  total: number;
  freelancers: Freelancer[];
}

export function SubcategoryDetailPage() {
  const { slug, subslug } = useParams<{ slug: string; subslug: string }>();
  const { categories, counts, freelancerCounts, loading: categoriesLoading } = useCategories();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [freelancersTotal, setFreelancersTotal] = useState(0);
  const [freelancersLoading, setFreelancersLoading] = useState(false);
  const [freelancersError, setFreelancersError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'projects' | 'freelancers'>('projects');
  const [searchQuery, setSearchQuery] = useState('');

  // Find the category and subcategory from loaded data
  const category = categories.find((c) => c.slug === slug);
  const subcategory = category?.subcategories.find((s) => s.slug === subslug);

  // Load projects
  useEffect(() => {
    if (!slug) return;
    setProjectsLoading(true);
    setProjectsError(null);

    dbFunctions
      .getProjectsByCategory({
        p_category_slug: slug,
        p_search_query: searchQuery || '',
        p_limit: 20,
        p_offset: 0,
      })
      .then((result: any) => {
        if (result.error) {
          setProjectsError(result.error.message || 'Failed to load projects');
        } else if (result.data) {
          const parsed = result.data as ProjectsResult;
          setProjects(parsed.projects || []);
          setProjectsTotal(parsed.total || 0);
        }
      })
      .catch((err: Error) => {
        setProjectsError(err.message);
      })
      .finally(() => {
        setProjectsLoading(false);
      });
  }, [slug, searchQuery]);

  // Load freelancers
  useEffect(() => {
    if (!slug) return;
    setFreelancersLoading(true);
    setFreelancersError(null);

    dbFunctions
      .searchFreelancersByCategory({
        p_category_slug: slug,
        p_search_query: searchQuery || '',
        p_sort_by: 'rating',
        p_limit: 20,
        p_offset: 0,
      })
      .then((result: any) => {
        if (result.error) {
          setFreelancersError(result.error.message || 'Failed to load freelancers');
        } else if (result.data) {
          const parsed = result.data as FreelancersResult;
          setFreelancers(parsed.freelancers || []);
          setFreelancersTotal(parsed.total || 0);
        }
      })
      .catch((err: Error) => {
        setFreelancersError(err.message);
      })
      .finally(() => {
        setFreelancersLoading(false);
      });
  }, [slug, searchQuery]);

  const meta = category ? resolveCategoryMeta(category.name) : null;
  const Icon = meta?.icon;

  // Loading state
  const isInitialLoading = categoriesLoading && !category;

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  // Not found state
  if (!category || !subcategory) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">Category Not Found</h1>
          <p className="text-slate-500 mb-6">
            The category or subcategory you're looking for doesn't exist or has been moved.
          </p>
          <Link
            to="/categories"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Browse All Categories
          </Link>
        </div>
      </div>
    );
  }

  const catCount = counts[category.name] ?? 0;
  const freelancerCount = freelancerCounts[category.name] ?? 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/categories"
              className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Categories</span>
            </Link>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            <span className="text-sm font-medium text-slate-900 truncate">{category.name}</span>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            <span className="text-sm text-slate-500 truncate">{subcategory.name}</span>
          </div>
          <Link
            to="/"
            className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors shrink-0 ml-4"
          >
            Home
          </Link>
        </div>
      </header>

      {/* Subcategory Hero */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 p-8">
            <div className="flex items-start gap-5">
              {Icon && meta && (
                <div
                  className={`h-16 w-16 ${meta.bgColor} ${meta.ringColor} ring-1 rounded-2xl flex items-center justify-center flex-shrink-0`}
                >
                  <Icon className={`w-8 h-8 ${meta.color}`} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Link
                    to={`/categories`}
                    className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors uppercase tracking-wider"
                  >
                    {category.name}
                  </Link>
                </div>
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
                  {subcategory.name}
                </h1>
                {subcategory.description && (
                  <p className="text-slate-600 text-lg max-w-2xl">{subcategory.description}</p>
                )}
                <div className="flex items-center gap-4 mt-4">
                  <span className="text-emerald-600 text-sm font-semibold flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4" />
                    {catCount.toLocaleString()} open jobs
                  </span>
                  <span className="text-slate-400 text-sm flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    {freelancerCount.toLocaleString()} freelancers
                  </span>
                </div>
              </div>
            </div>

            {/* Skills */}
            {subcategory.skills.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Popular Skills in {subcategory.name}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {subcategory.skills.map((skill) => (
                    <span
                      key={skill.id}
                      className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors cursor-default"
                    >
                      {skill.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Search & Tabs */}
      <section className="pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Search Bar */}
          <div className="relative mb-6 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab === 'projects' ? 'projects' : 'freelancers'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-9 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 w-fit mb-6">
            <button
              onClick={() => setActiveTab('projects')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'projects'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Briefcase className="w-4 h-4 inline-block mr-1.5" />
              Projects
              {projectsTotal > 0 && (
                <span className="ml-1.5 text-xs opacity-70">({projectsTotal})</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('freelancers')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'freelancers'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4 inline-block mr-1.5" />
              Freelancers
              {freelancersTotal > 0 && (
                <span className="ml-1.5 text-xs opacity-70">({freelancersTotal})</span>
              )}
            </button>
          </div>

          {/* Error State */}
          {(projectsError || freelancersError) && (
            <div className="mb-6 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                {activeTab === 'projects' ? projectsError : freelancersError || 'An error occurred'}
              </span>
            </div>
          )}

          {/* Projects Tab */}
          {activeTab === 'projects' && (
            <div>
              {projectsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                </div>
              ) : projects.length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-4xl mb-4">📋</div>
                  <h3 className="font-display text-lg font-bold text-slate-900 mb-1">
                    No open projects yet
                  </h3>
                  <p className="text-slate-500 text-sm">
                    There are currently no open projects in {subcategory.name}.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map((project) => (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}`}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 hover:shadow-md hover:border-emerald-200/60 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h3 className="font-display font-bold text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-1">
                          {project.title}
                        </h3>
                        <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0 mt-1" />
                      </div>
                      <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                        {project.description}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        {(project.budget_min || project.budget_max) && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5" />
                            {project.budget_min && `$${project.budget_min}`}
                            {project.budget_min && project.budget_max && ' — '}
                            {project.budget_max && `$${project.budget_max}`}
                          </span>
                        )}
                        {project.experience_level && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5" />
                            {project.experience_level}
                          </span>
                        )}
                        <span className="flex items-center gap-1 ml-auto">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Freelancers Tab */}
          {activeTab === 'freelancers' && (
            <div>
              {freelancersLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                </div>
              ) : freelancers.length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-4xl mb-4">👥</div>
                  <h3 className="font-display text-lg font-bold text-slate-900 mb-1">
                    No freelancers found
                  </h3>
                  <p className="text-slate-500 text-sm">
                    There are currently no freelancers listed in {subcategory.name}.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {freelancers.map((freelancer) => (
                    <Link
                      key={freelancer.user_id}
                      to={`/freelancer/${freelancer.user_id}`}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-5 hover:shadow-md hover:border-emerald-200/60 transition-all group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center text-emerald-700 font-bold text-lg flex-shrink-0">
                          {freelancer.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                              {freelancer.name}
                            </h3>
                            {freelancer.hourly_rate && (
                              <span className="text-sm font-bold text-emerald-600 shrink-0">
                                ${freelancer.hourly_rate}/hr
                              </span>
                            )}
                          </div>
                          {freelancer.title && (
                            <p className="text-sm text-slate-500 truncate mt-0.5">
                              {freelancer.title}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            {freelancer.rating && (
                              <span className="flex items-center gap-1 text-xs text-amber-600">
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                {freelancer.rating.toFixed(1)}
                                {freelancer.total_reviews != null && (
                                  <span className="text-slate-400">
                                    ({freelancer.total_reviews})
                                  </span>
                                )}
                              </span>
                            )}
                            {freelancer.location && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <MapPin className="w-3.5 h-3.5" />
                                {freelancer.location}
                              </span>
                            )}
                            {freelancer.availability && (
                              <span className="flex items-center gap-1 text-xs text-emerald-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Available
                              </span>
                            )}
                          </div>
                          {freelancer.skills && freelancer.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {freelancer.skills.slice(0, 4).map((skill) => (
                                <span
                                  key={skill}
                                  className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-[10px] font-medium text-slate-600"
                                >
                                  {skill}
                                </span>
                              ))}
                              {freelancer.skills.length > 4 && (
                                <span className="text-[10px] text-slate-400 self-center">
                                  +{freelancer.skills.length - 4} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-[2.5rem] p-8 sm:p-12 text-center border border-slate-200 shadow-sm">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
              Need help with {subcategory.name}?
            </h2>
            <p className="text-slate-600 mb-8 max-w-lg mx-auto">
              Post a project and get matched with top freelancers skilled in {subcategory.name}.
            </p>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors"
            >
              Post a Project
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
