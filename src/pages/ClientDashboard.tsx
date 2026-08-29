import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CheckCircle2, Clock, CreditCard, IndianRupee, FileText, Handshake, Plus, Sparkles, Users,  } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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

interface QuickAction {
  label: string;
  path: string;
  icon: React.ElementType;
  color: string;
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

      // Bypass cache for real-time data freshness
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
      const unreadNotifications = notificationResult?.notifications
        ? notificationResult.notifications.filter((n: any) => !n.read).length
        : 0;

      const pendingProposals = await proposalsService.countPendingForClient(user.id);

      setStats({
        activeProjects,
        activeContracts,
        totalSpent,
        freelancersHired,
        pendingProposals,
        unreadNotifications
      });

      setRecentProjects(Array.isArray(projectsData) ? projectsData.slice(0, 5) : []);
      setRecentContracts(Array.isArray(contractsData) ? contractsData.slice(0, 5) : []);
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
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8 max-w-[100rem] mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <p className="text-red-700 font-medium mb-4">{error}</p>
          <button
            onClick={() => fetchDashboardData()}
            className="inline-flex items-center gap-3 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const quickActions: QuickAction[] = [
    { label: 'Post a Project', path: '/client/post', icon: Plus, color: 'bg-emerald-500' },
    { label: 'Find Talent', path: '/client/matches', icon: Users, color: 'bg-blue-500' },
    { label: 'View Contracts', path: '/client/contracts', icon: FileText, color: 'bg-purple-500' },
    { label: 'Payments', path: '/client/payments', icon: CreditCard, color: 'bg-orange-500' },
  ];

  const statCards = [
    { 
      label: 'Active Projects', 
      value: stats.activeProjects, 
      icon: Briefcase, 
      color: 'bg-blue-50 text-blue-600' 
    },
    { 
      label: 'Total Hired', 
      value: stats.freelancersHired, 
      icon: Users, 
      color: 'bg-purple-50 text-purple-600' 
    },
    { 
      label: 'Active Contracts', 
      value: stats.activeContracts, 
      icon: FileText, 
      color: 'bg-emerald-50 text-emerald-600' 
    },
    { 
      label: 'Total Spent', 
      value: formatCurrency(safeNumber(stats.totalSpent)), 
      icon: IndianRupee, 
      color: 'bg-orange-50 text-orange-600' 
    },
  ];

  return (
    <div className="max-w-[100rem] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            Welcome back, {user?.name || 'Client'}!
          </h1>
          <p className="text-slate-600 text-xs sm:text-xs mt-0.5">Manage your projects and freelancers all in one place.</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {statCards.map((stat, index) => (
          <div
            key={index}
            className="bg-white p-2.5 sm:p-3 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all duration-300"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className={`h-7 w-7 rounded-lg ${stat.color} flex items-center justify-center`}>
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-slate-600 text-xs sm:text-xs">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-3 mb-3">
        <h2 className="text-xs font-semibold text-slate-900 mb-2">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
          {quickActions.map((action) => (
            <Link
              key={action.path}
              to={action.path}
              className="flex flex-col items-center p-2 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm transition-all duration-200"
            >
              <div className={`w-7 h-7 ${action.color} rounded-lg flex items-center justify-center mb-1.5`}>
                <action.icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs font-medium text-slate-700">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Recent Projects */}
        <div className="bg-white rounded-xl p-3 border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-900">Your Projects</h3>
            <Link to="/client/projects" className="text-emerald-600 font-medium text-xs hover:underline">
              View All →
            </Link>
          </div>

          {recentProjects.length > 0 ? (
            <div className="space-y-2">
              {recentProjects.slice(0, 4).map((project) => (
                <Link
                  key={project.id}
                  to={`/client/projects?id=${project.id}`}
                  className="block p-2 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-900 text-xs sm:text-xs truncate">{project.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{project.description}</p>
                    </div>
                    <span className={`ml-3 px-2 py-1 text-xs font-medium rounded-full ${
                      project.status === 'open' ? 'bg-emerald-100 text-emerald-700' :
                      (project.status === 'in_progress' || project.status === 'active') ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {project.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-500">
                      Budget: {formatBudgetRange(project.budget_min, project.budget_max)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {safeFormatDate(project.created_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-1.5">
                <Briefcase className="w-4 h-4 text-slate-300" />
              </div>
              <p className="text-slate-600 mb-2 max-w-xs mx-auto text-xs">No projects yet. Create your first one.</p>
              <Link
                to="/client/post"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white font-semibold text-xs rounded-lg hover:bg-emerald-700 transition-colors"
              >                <Plus className="w-4 h-4" />
                Post Project
              </Link>
            </div>
          )}
        </div>

        {/* Active Contracts */}
        <div className="bg-white rounded-xl p-3 border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-900">Active Contracts</h3>
            <Link to="/client/contracts" className="text-emerald-600 font-medium text-xs hover:underline">
              View All →
            </Link>
          </div>

          {recentContracts.length > 0 ? (
            <div className="space-y-2">
              {recentContracts.slice(0, 4).map((contract) => (
                <Link
                  key={contract.id}
                  to={`/client/contracts?id=${contract.id}`}
                  className="block p-2 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-900 text-xs sm:text-xs truncate">
                        {contract.projects?.title || 'Project'}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Freelancer: {contract.freelancer_profile?.name || 'Unknown'}
                      </p>
                    </div>
                    <span className={`ml-2 px-1.5 py-0.5 text-xs font-medium rounded-full ${
                      contract.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      contract.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      contract.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {contract.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-medium text-slate-900">
                      {formatCurrency(safeNumber(contract.amount))}
                    </span>
                    {contract.escrow_funded ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Escrow Funded
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-yellow-600">
                        <Clock className="w-2.5 h-2.5" /> Awaiting Payment
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-1.5">
                <Handshake className="w-4 h-4 text-slate-300" />
              </div>
              <p className="text-slate-600 mb-2 max-w-xs mx-auto text-xs">No active contracts yet.</p>
              <div className="flex gap-1.5 justify-center">
                <Link
                  to="/client/proposals"
                  className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Review Proposals
                </Link>
                <Link
                  to="/client/matches"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors text-xs"
                >
                  <Users className="w-4 h-4" />
                  Find Talent
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section - AI & Help */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <div className="bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-600 rounded-xl p-3 text-white shadow-md">
          <div className="flex items-center gap-3 mb-1.5">
            <Sparkles className="w-4 h-4 animate-workflow-pulse" />
            <h3 className="text-xs font-semibold flex items-center gap-1.5">
              AI Talent Matching <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-300 animate-ping"></span>
            </h3>
          </div>
          <p className="text-emerald-100 text-xs mb-2">
            Find perfect freelancers based on skills, experience, and reviews.
          </p>
          <Link
            to="/client/matches"
            className="inline-block bg-white text-emerald-600 px-2.5 py-1 rounded-lg font-medium text-xs hover:bg-emerald-50 transition-all duration-200"
          >
            View Matches
          </Link>
        </div>

        <div className="bg-white rounded-xl p-3 border border-slate-100">
          <h3 className="text-xs font-semibold text-slate-900 mb-1.5">Need Help?</h3>
          <p className="text-slate-600 text-xs mb-2">
            Use our AI Assistant or Help Center.
          </p>
          <div className="flex flex-col gap-0.5">
            <Link to="/client/ai-assistant" className="text-emerald-600 font-medium text-xs hover:underline">
              Chat with AI Assistant →
            </Link>
            <Link to="/help-center" className="text-emerald-600 font-medium text-xs hover:underline">
              Visit Help Center →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}