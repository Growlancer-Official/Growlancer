import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CheckCircle2, Clock, CreditCard, DollarSign, FileText, Handshake, Plus, Sparkles, Users,  } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  projectsService,
  contractsService,
  proposalsService,
} from '../lib/dataService';
import { notificationService } from '../lib/notifications';

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
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <p className="text-red-700 font-medium mb-4">{error}</p>
          <button
            onClick={() => fetchDashboardData()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
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
      value: `$${stats.totalSpent.toLocaleString()}`, 
      icon: DollarSign, 
      color: 'bg-orange-50 text-orange-600' 
    },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Welcome back, {user?.name || 'Client'}!
        </h1>
        <p className="text-slate-600 mt-2">Manage your projects and freelancers all in one place.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <div
            key={index}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300 transform animate-scale-in"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`h-12 w-12 rounded-2xl ${stat.color} flex items-center justify-center animate-workflow-glow`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-slate-600 text-sm">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-6">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.path}
              to={action.path}
              className="flex flex-col items-center p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm hover:scale-[1.03] active:scale-[0.97] transition-all duration-300 transform"
            >
              <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center mb-3 transition-transform duration-300 hover:rotate-6`}>
                <action.icon className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm font-medium text-slate-700">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Your Projects</h3>
            <Link to="/client/projects" className="text-emerald-600 font-medium text-sm hover:underline">
              View All →
            </Link>
          </div>

          {recentProjects.length > 0 ? (
            <div className="space-y-4">
              {recentProjects.slice(0, 4).map((project) => (
                <Link
                  key={project.id}
                  to={`/client/projects?id=${project.id}`}
                  className="block p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-900 truncate">{project.title}</h4>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-1">{project.description}</p>
                    </div>
                    <span className={`ml-3 px-2 py-1 text-xs font-medium rounded-full ${
                      project.status === 'open' ? 'bg-emerald-100 text-emerald-700' :
                      project.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {project.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm text-slate-500">
                      Budget: ${project.budget_min}-${project.budget_max}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Briefcase className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-slate-600 mb-4 max-w-xs mx-auto text-sm">You haven't posted any projects yet. Start by creating your first project.</p>
              <Link
                to="/client/post"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-600/20"
              >
                <Plus className="w-5 h-5" />
                Post Your First Project
              </Link>
            </div>
          )}
        </div>

        {/* Active Contracts */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900">Active Contracts</h3>
            <Link to="/client/contracts" className="text-emerald-600 font-medium text-sm hover:underline">
              View All →
            </Link>
          </div>

          {recentContracts.length > 0 ? (
            <div className="space-y-4">
              {recentContracts.slice(0, 4).map((contract) => (
                <Link
                  key={contract.id}
                  to={`/client/contracts?id=${contract.id}`}
                  className="block p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-slate-900 truncate">
                        {contract.projects?.title || 'Project'}
                      </h4>
                      <p className="text-sm text-slate-500 mt-1">
                        Freelancer: {contract.profiles?.name || 'Unknown'}
                      </p>
                    </div>
                    <span className={`ml-3 px-2 py-1 text-xs font-medium rounded-full ${
                      contract.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      contract.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      contract.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {contract.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-medium text-slate-900">
                      ${Number(contract.amount).toLocaleString()}
                    </span>
                    {contract.escrow_funded ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" /> Escrow Funded
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-yellow-600">
                        <Clock className="w-3 h-3" /> Awaiting Payment
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Handshake className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-slate-600 mb-4 max-w-xs mx-auto text-sm">No active contracts yet. Accept a proposal or invite a freelancer to get started.</p>
              <div className="flex gap-3 justify-center">
                <Link
                  to="/client/proposals"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors text-sm shadow-md shadow-emerald-600/20"
                >
                  <FileText className="w-4 h-4" />
                  Review Proposals
                </Link>
                <Link
                  to="/client/matches"
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors text-sm"
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-emerald-500/20 hover:-translate-y-0.5 transition-all duration-300 transform animate-workflow-flow">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-6 h-6 animate-workflow-pulse" />
            <h3 className="text-lg font-semibold flex items-center gap-1.5">
              AI-Powered Talent Matching <span className="flex h-2 w-2 rounded-full bg-emerald-300 animate-ping"></span>
            </h3>
          </div>
          <p className="text-emerald-100 mb-4">
            Let our AI find the perfect freelancers for your projects based on skills, experience, and reviews.
          </p>
          <Link
            to="/client/ai-subscription"
            className="inline-block bg-white text-emerald-600 px-4 py-2 rounded-lg font-medium hover:bg-emerald-50 hover:scale-105 active:scale-95 transition-all duration-200"
          >
            Upgrade to AI Plus
          </Link>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Need Help?</h3>
          <p className="text-slate-600 mb-4">
            Use our AI Assistant or create a support ticket for any questions.
          </p>
          <div className="flex flex-col gap-2">
            <Link to="/client/tickets" className="text-emerald-600 font-medium hover:underline">
              Create Support Ticket →
            </Link>
            <Link to="/help-center" className="text-emerald-600 font-medium hover:underline">
              Visit Help Center →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}