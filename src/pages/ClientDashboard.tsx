import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, CheckCircle2, Clock, CreditCard, IndianRupee, FileText,
  Handshake, LayoutDashboard, Plus, Users, TrendingUp, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageSkeleton } from '../components/PageSkeleton';
import { formatCurrency } from '../lib/currency';
import {
  projectsService,
  contractsService,
  proposalsService,
} from '../lib/dataService';
import { notificationService } from '../lib/notifications';
import { formatBudgetRange, safeFormatDate, safeNumber } from '../utils/date';

interface ClientStats {
  activeProjects: number;
  activeContracts: number;
  totalSpent: number;
  freelancersHired: number;
  pendingProposals: number;
  unreadNotifications: number;
}

export default function ClientDashboard() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<ClientStats>({
    activeProjects: 0,
    activeContracts: 0,
    totalSpent: 0,
    freelancersHired: 0,
    pendingProposals: 0,
    unreadNotifications: 0,
  });
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [recentContracts, setRecentContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!user || role !== 'client') return;

    try {
      setLoading(true);
      setError(null);

      const [projectsData, contractsData, notificationResult] = await Promise.all([
        projectsService.getClientProjects(user.id, true),
        contractsService.getByUser(user.id, 'client', true),
        notificationService.getByUser(user.id),
      ]);

      const activeProjects = Array.isArray(projectsData)
        ? projectsData.filter((p: any) => p.status === 'open').length
        : 0;
      const activeContracts = Array.isArray(contractsData)
        ? contractsData.filter((c: any) => c.status === 'active' || c.status === 'pending').length
        : 0;
      const totalSpent = Array.isArray(contractsData)
        ? contractsData
            .filter((c: any) => c.status === 'completed')
            .reduce((sum: number, c: any) => sum + Number(c.amount), 0)
        : 0;
      const freelancersHired = Array.isArray(contractsData)
        ? new Set(contractsData.map((c: any) => c.freelancer_id)).size
        : 0;

      const pendingProposals = await proposalsService.countPendingForClient(user.id);

      setStats({
        activeProjects,
        activeContracts,
        totalSpent,
        freelancersHired,
        pendingProposals,
        unreadNotifications: 0,
      });

      setRecentProjects(Array.isArray(projectsData) ? projectsData.slice(0, 4) : []);
      setRecentContracts(Array.isArray(contractsData) ? contractsData.slice(0, 4) : []);
    } catch (err) {
      console.error('Error fetching client dashboard data:', err);
      setError('Failed to load dashboard. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    void fetchDashboardData();
    if (!user?.id) return;

    const contractSub = contractsService.subscribe(user.id, 'client', fetchDashboardData);
    const proposalSub = proposalsService.subscribeForClient(user.id, fetchDashboardData);
    const projectSub = proposalsService.subscribeForClientProjects(user.id, fetchDashboardData);
    const notifSub = notificationService.subscribe(user.id, () => void fetchDashboardData());

    return () => {
      contractSub.unsubscribe();
      proposalSub.unsubscribe();
      projectSub.unsubscribe();
      notifSub.unsubscribe();
    };
  }, [fetchDashboardData, user?.id]);

  if (loading) {
    return <PageSkeleton />;;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700 font-medium mb-3">{error}</p>
          <button
            onClick={() => fetchDashboardData()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const quickStats = [
    { label: 'Active Projects', value: stats.activeProjects, icon: Briefcase, color: 'bg-blue-50 text-blue-600', link: '/client/projects' },
    { label: 'Total Hired', value: stats.freelancersHired, icon: Users, color: 'bg-purple-50 text-purple-600', link: '/client/matches' },
    { label: 'Active Contracts', value: stats.activeContracts, icon: FileText, color: 'bg-emerald-50 text-emerald-600', link: '/client/contracts' },
    { label: 'Total Spent', value: formatCurrency(safeNumber(stats.totalSpent)), icon: IndianRupee, color: 'bg-orange-50 text-orange-600', link: '/client/payments' },
  ];

  const quickActions = [
    { label: 'Post a Project', path: '/client/post', icon: Plus, color: 'bg-emerald-500' },
    { label: 'Find Talent', path: '/client/matches', icon: Users, color: 'bg-blue-500' },
    { label: 'View Contracts', path: '/client/contracts', icon: FileText, color: 'bg-purple-500' },
    { label: 'Payments', path: '/client/payments', icon: CreditCard, color: 'bg-orange-500' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-3 flex-wrap">
            Welcome back, {user?.name || 'Client'}!
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
            Manage your projects and freelancers all in one place.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {quickStats.map((stat, index) => (
          <Link
            key={index}
            to={stat.link}
            className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-emerald-200 transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center`}>
                <stat.icon className="w-4 h-4" />
              </div>
              <TrendingUp className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 transition-colors" />
            </div>
            <p className="text-xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-xs text-slate-500">{stat.label}</p>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <h2 className="text-xs font-semibold text-slate-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {quickActions.map((action) => (
            <Link
              key={action.path}
              to={action.path}
              className="flex flex-col items-center p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm transition-all"
            >
              <div className={`w-9 h-9 ${action.color} rounded-lg flex items-center justify-center mb-2`}>
                <action.icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs font-medium text-slate-700 text-center">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Recent Projects */}
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Briefcase className="w-3.5 h-3.5 text-blue-500" />
              Your Projects
            </h3>
            <Link to="/client/projects" className="text-emerald-600 font-medium text-xs hover:underline">
              View All →
            </Link>
          </div>

          {recentProjects.length > 0 ? (
            <div className="space-y-2">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  to={`/client/projects?id=${project.id}`}
                  className="block p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium text-slate-900 text-sm line-clamp-2 flex-1">{project.title}</h4>
                    <span className={`ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap ${
                      project.status === 'open' ? 'bg-emerald-100 text-emerald-700' :
                      (project.status === 'in_progress' || project.status === 'active') ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {project.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-1.5">{project.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Budget: {formatBudgetRange(project.budget_min, project.budget_max)}
                    </span>
                    <span className="text-[10px] text-slate-400">{safeFormatDate(project.created_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                <Briefcase className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-slate-500 text-xs mb-2">No projects yet</p>
              <Link
                to="/client/post"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white font-medium text-xs rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Post Project
              </Link>
            </div>
          )}
        </div>

        {/* Active Contracts */}
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Handshake className="w-3.5 h-3.5 text-emerald-500" />
              Active Contracts
            </h3>
            <Link to="/client/contracts" className="text-emerald-600 font-medium text-xs hover:underline">
              View All →
            </Link>
          </div>

          {recentContracts.length > 0 ? (
            <div className="space-y-2">
              {recentContracts.map((contract) => (
                <Link
                  key={contract.id}
                  to={`/client/contracts?id=${contract.id}`}
                  className="block p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium text-slate-900 text-sm line-clamp-2 flex-1">
                      {contract.projects?.title || 'Project'}
                    </h4>
                    <span className={`ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full whitespace-nowrap ${
                      contract.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      contract.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      contract.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {contract.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-1.5">
                    Freelancer: {contract.freelancer_profile?.name || 'Unknown'}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-900">
                      {formatCurrency(safeNumber(contract.amount))}
                    </span>
                    {contract.escrow_funded ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Escrow Funded
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                        <Clock className="w-3 h-3" /> Awaiting Payment
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                <Handshake className="w-5 h-5 text-slate-300" />
              </div>
              <p className="text-slate-500 text-xs mb-2">No active contracts yet</p>
              <div className="flex gap-2 justify-center">
                <Link
                  to="/client/proposals"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" /> Review Proposals
                </Link>
                <Link
                  to="/client/matches"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
                >
                  <Users className="w-3.5 h-3.5" /> Find Talent
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Matching + Proposals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          to="/client/matches"
          className="bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-600 rounded-xl p-4 text-white shadow-md hover:shadow-lg transition-all group"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 animate-pulse" />
            <h3 className="text-sm font-bold">AI Talent Matching</h3>
          </div>
          <p className="text-emerald-100 text-xs mb-2">
            Find perfect freelancers based on skills, experience, and reviews.
          </p>
          <span className="inline-block bg-white text-emerald-600 px-3 py-1 rounded-lg font-medium text-xs group-hover:bg-emerald-50 transition-all">
            View Matches
          </span>
        </Link>

        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Pending Proposals</h3>
              <p className="text-xs text-slate-500">{stats.pendingProposals} awaiting review</p>
            </div>
          </div>
          <Link
            to="/client/proposals"
            className="inline-block text-emerald-600 font-medium text-xs hover:underline mt-1"
          >
            Review Proposals →
          </Link>
        </div>
      </div>
    </div>
  );
}
