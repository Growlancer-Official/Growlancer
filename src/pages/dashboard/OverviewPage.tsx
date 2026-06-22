import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Briefcase, CheckCircle2, Clock, CreditCard, DollarSign, FileText, Filter, Handshake, MessageSquare, Plus, Sparkles, Users, View, Wallet, Zap,  } from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { CacheManager } from '../../lib/services/cacheManager';
import {
  projectsService,
  proposalsService,
  contractsService,
  invitesService,
  transactionsService,
} from '../../lib/dataService';
import { analyticsService } from '../../lib/analyticsService';
import { notificationService } from '../../lib/notifications';

interface DashboardStats {
  activeContracts: number;
  pendingProposals: number;
  newMatches: number;
  pendingInvites: number;
  totalEarnings: number;
  monthlyEarnings: number;
  profileViews: number;
  unreadNotifications: number;
}

interface QuickStat {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
}

/** Calculate profile completion percentage from freelancer_profiles data */
function calculateProfileCompletion(profile: Record<string, unknown> | null): number {
  if (!profile) return 0;
  const fields = [
    'name', 'title', 'bio', 'hourly_rate', 'experience',
    'skills', 'languages', 'location', 'availability', 'avatar'
  ];
  const filled = fields.filter(f => {
    const val = profile[f];
    if (val === null || val === undefined) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  }).length;
  return Math.round((filled / fields.length) * 100);
}

export function OverviewPage() {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    activeContracts: 0,
    pendingProposals: 0,
    newMatches: 0,
    pendingInvites: 0,
    totalEarnings: 0,
    monthlyEarnings: 0,
    profileViews: 0,
    unreadNotifications: 0,
  });
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [recentContracts, setRecentContracts] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [hasProfile, setHasProfile] = useState<boolean>(true);
  const [profileStrength, setProfileStrength] = useState<number>(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Fetch all dashboard data with forceRefetch=true to bypass cache */
  const fetchDashboardData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      if (role === 'freelancer') {
        // ---------- FREELANCER DASHBOARD ----------
        // Clear only stale (expired) entries — keeps fresh data in cache for instant load
        CacheManager.prune();

        const [
          contractsData,
          proposalsData,
          invitesData,
          projectsData,
          notificationResult,
          earningsData,
          profileCheck,
          analyticsResult,
        ] = await Promise.all([
          contractsService.getByUser(user.id, 'freelancer', true),
          proposalsService.getByFreelancer(user.id, true),
          invitesService.getFreelancerInvites(user.id, true),
          projectsService.getOpenProjects(100, true),
          notificationService.getByUser(user.id),
          transactionsService.getEarningsSummary(user.id),
          supabase
            .from('freelancer_profiles')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle(),
          analyticsService.getFreelancerAnalytics(user.id),
        ]);

        setHasProfile(!!profileCheck?.data);

        // Calculate profile strength from actual data
        const profileData = profileCheck?.data as Record<string, unknown> | null;
        setProfileStrength(calculateProfileCompletion(profileData));

        // Calculate stats
        const activeContracts = Array.isArray(contractsData)
          ? contractsData.filter(c => c.status === 'active' || c.status === 'in_progress').length
          : 0;
        const pendingProposals = Array.isArray(proposalsData)
          ? proposalsData.filter(p => p.status === 'pending').length
          : 0;
        const pendingInvites = Array.isArray(invitesData)
          ? invitesData.filter(i => i.status === 'pending').length
          : 0;
        const unreadNotifications = Array.isArray(notificationResult?.notifications)
          ? notificationResult.notifications.filter((n: any) => !n.read).length
          : 0;

        // Filter projects by matching skills
        const freelancerSkills: string[] = profileData && Array.isArray(profileData.skills)
          ? profileData.skills
          : [];

        const matchedProjects = Array.isArray(projectsData)
          ? projectsData.filter((project: any) => {
              const required = Array.isArray(project.skills_required) ? project.skills_required : [];
              if (freelancerSkills.length === 0) return false;
              return required.some((skill: string) =>
                freelancerSkills.some((fs: string) => fs.toLowerCase().trim() === skill.toLowerCase().trim())
              );
            })
          : [];

        setRecentProjects(matchedProjects.slice(0, 5));

        // Create activity feed from recent events
        const recentActivities = [
          ...(Array.isArray(contractsData) ? contractsData.slice(0, 3).map((c: any) => ({
            id: c.id,
            type: 'contract',
            title: c.status === 'active' ? 'Contract Active' : 'Contract Pending',
            description: `Project: ${c.projects?.title || 'Unknown'}`,
            timestamp: c.created_at,
            icon: Handshake,
          })) : []),
          ...(Array.isArray(proposalsData) ? proposalsData.slice(0, 3).map((p: any) => ({
            id: p.id,
            type: 'proposal',
            title: p.status === 'pending' ? 'Proposal Pending' : `Proposal ${p.status}`,
            description: `Project: ${p.projects?.title || 'Unknown'}`,
            timestamp: p.created_at,
            icon: FileText,
          })) : []),
          ...(Array.isArray(invitesData) ? invitesData.slice(0, 2).map((i: any) => ({
            id: i.id,
            type: 'invite',
            title: 'New Invitation',
            description: `Project: ${i.projects?.title || 'Unknown'}`,
            timestamp: i.created_at,
            icon: Briefcase,
          })) : []),
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);

        setStats({
          activeContracts,
          pendingProposals,
          newMatches: pendingProposals + pendingInvites,
          pendingInvites,
          totalEarnings: earningsData.total,
          monthlyEarnings: earningsData.monthly,
          profileViews: analyticsResult.profileViews || 0,
          unreadNotifications,
        });

        setActivities(recentActivities);
      } else if (role === 'client') {
        // ---------- CLIENT DASHBOARD ----------
        CacheManager.clear();

        const [projectsData, contractsData, notificationResult] = await Promise.all([
          projectsService.getClientProjects(user.id, true),
          contractsService.getByUser(user.id, 'client', true),
          notificationService.getByUser(user.id),
        ]);

        const activeProjects = Array.isArray(projectsData)
          ? projectsData.filter(p => p.status === 'open').length
          : 0;
        const activeContracts = Array.isArray(contractsData)
          ? contractsData.filter(c => c.status === 'active' || c.status === 'pending').length
          : 0;
        const totalSpent = Array.isArray(contractsData)
          ? contractsData
              .filter(c => c.status === 'completed')
              .reduce((sum: number, c: any) => sum + Number(c.amount), 0)
          : 0;
        const freelancersHired = Array.isArray(contractsData)
          ? new Set(contractsData.map((c: any) => c.freelancer_id)).size
          : 0;
        const unreadNotifications = Array.isArray(notificationResult?.notifications)
          ? notificationResult.notifications.filter((n: any) => !n.read).length
          : 0;
        const pendingProposals = await proposalsService.countPendingForClient(user.id);

        setStats({
          activeContracts,
          pendingProposals,
          newMatches: pendingProposals,
          pendingInvites: 0,
          totalEarnings: totalSpent,
          monthlyEarnings: 0,
          profileViews: 0,
          unreadNotifications,
        });

        setRecentProjects(Array.isArray(projectsData) ? projectsData.slice(0, 5) : []);
        setRecentContracts(Array.isArray(contractsData) ? contractsData.slice(0, 5) : []);
        setHasProfile(true);
        setProfileStrength(100);

        // Build client activity feed
        const recentActivities = [
          ...(Array.isArray(projectsData) ? projectsData.slice(0, 3).map((p: any) => ({
            id: p.id,
            type: 'project',
            title: p.status === 'open' ? 'Project Posted' : 'Project Updated',
            description: p.title || 'Untitled',
            timestamp: p.created_at,
            icon: Briefcase,
          })) : []),
          ...(Array.isArray(contractsData) ? contractsData.slice(0, 3).map((c: any) => ({
            id: c.id,
            type: 'contract',
            title: c.status === 'active' ? 'Contract Started' : 'Contract Pending',
            description: `Freelancer: ${c.freelancer_profile?.name || 'Unknown'}`,
            timestamp: c.created_at,
            icon: Handshake,
          })) : []),
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);

        setActivities(recentActivities);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Pull to refresh or try again later.');
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    fetchDashboardData();

    if (user) {
      if (role === 'freelancer') {
        const contractSub = contractsService.subscribe(user.id, 'freelancer', fetchDashboardData);
        const proposalSub = proposalsService.subscribe(user.id, fetchDashboardData);
        const txSub = transactionsService.subscribe(user.id, fetchDashboardData);
        const notifSub = notificationService.subscribe(user.id, fetchDashboardData);
        const inviteSub = invitesService.subscribeFreelancer(user.id, fetchDashboardData);

        return () => {
          contractSub.unsubscribe();
          proposalSub.unsubscribe();
          txSub.unsubscribe();
          notifSub.unsubscribe();
          inviteSub.unsubscribe();
        };
      } else if (role === 'client') {
        const contractSub = contractsService.subscribe(user.id, 'client', fetchDashboardData);
        const proposalSub = proposalsService.subscribeForClient(user.id, fetchDashboardData);
        const projectSub = proposalsService.subscribeForClientProjects(user.id, fetchDashboardData);
        const notifSub = notificationService.subscribe(user.id, () => fetchDashboardData());

        return () => {
          contractSub.unsubscribe();
          proposalSub.unsubscribe();
          projectSub.unsubscribe();
          notifSub.unsubscribe();
        };
      }
    }
  }, [fetchDashboardData, user, role]);

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <p className="text-red-700 font-medium mb-4">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isFreelancer = role === 'freelancer';
  const isClient = role === 'client';

  // Build stats based on role
  const quickStats: QuickStat[] = isFreelancer
    ? [
        {
          label: 'Active Contracts',
          value: stats.activeContracts,
          change: stats.activeContracts > 0 ? 'Live from workspace' : 'Apply or accept invites',
          changeType: stats.activeContracts > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Pending Proposals',
          value: stats.pendingProposals,
          change: stats.pendingProposals > 0 ? 'Awaiting client review' : 'Browse project feed',
          changeType: 'neutral',
        },
        {
          label: 'Invites Received',
          value: stats.pendingInvites,
          change: stats.pendingInvites > 0 ? 'Respond in Invites' : 'No pending invites',
          changeType: stats.pendingInvites > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Earnings (USD)',
          value: `$${stats.totalEarnings.toLocaleString()}`,
          change: `$${stats.monthlyEarnings.toLocaleString()} this month`,
          changeType: stats.monthlyEarnings > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Profile Views',
          value: stats.profileViews.toLocaleString(),
          change: 'From your public profile',
          changeType: stats.profileViews > 0 ? 'positive' : 'neutral',
        },
      ]
    : [
        {
          label: 'Active Projects',
          value: stats.activeContracts, // reused as activeProjects count
          change: stats.activeContracts > 0 ? 'Open for proposals' : 'Post a new project',
          changeType: stats.activeContracts > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Pending Proposals',
          value: stats.pendingProposals,
          change: stats.pendingProposals > 0 ? 'Awaiting your review' : 'No pending proposals',
          changeType: stats.pendingProposals > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Total Spent',
          value: `$${stats.totalEarnings.toLocaleString()}`,
          change: 'Across all contracts',
          changeType: 'neutral',
        },
        {
          label: 'Notifications',
          value: stats.unreadNotifications,
          change: stats.unreadNotifications > 0 ? 'Unread messages' : 'All caught up',
          changeType: stats.unreadNotifications > 0 ? 'positive' : 'neutral',
        },
      ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
          Welcome back, {user?.name || (isFreelancer ? 'Freelancer' : 'Client')}!
        </h1>
        <p className="text-slate-500 text-sm sm:text-base mt-1">
          {isFreelancer
            ? "Here's what's happening with your freelancing career."
            : 'Manage your projects and freelancers all in one place.'}
        </p>
      </div>

      {/* Profile Completion Banner Removed */}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {quickStats.slice(0, 4).map((stat, index) => (
          <div key={index} className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all duration-300">
            <p className="text-slate-500 text-xs sm:text-sm font-medium truncate">{stat.label}</p>
            <p className="text-xl sm:text-3xl font-bold text-slate-900 mt-1 sm:mt-2">{stat.value}</p>
            {stat.change && (
              <p className={`text-[10px] sm:text-xs mt-1 sm:mt-2 truncate ${
                stat.changeType === 'positive' ? 'text-emerald-600' :
                stat.changeType === 'negative' ? 'text-red-600' : 'text-slate-500'
              }`}>
                {stat.change}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left Column - 2/3 */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* AI Recommendations / Projects */}
          {isFreelancer ? (
            <div className="bg-gradient-to-r from-emerald-500 via-teal-600 to-emerald-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-emerald-500/20 hover:-translate-y-0.5 transition-all duration-300 transform animate-workflow-flow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center animate-workflow-pulse">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-1.5">
                      AI-Powered Recommendations <span className="flex h-2 w-2 rounded-full bg-emerald-300 animate-ping"></span>
                    </h3>
                    <p className="text-emerald-100 text-sm">Projects matching your skills</p>
                  </div>
                </div>
                <Link
                  to="/dashboard/feed"
                  className="bg-white text-emerald-600 px-4 py-2 rounded-lg font-medium hover:bg-emerald-50 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-2"
                >
                  View All <ArrowRight className="w-4 h-4" />
                </Link>
              </div>                  {recentProjects.length > 0 ? (
                <div className="mt-6 space-y-3">
                  {recentProjects
                    .slice(0, 3)
                    .map((project: any) => (
                    <Link
                      key={project.id}
                      to={`/dashboard/feed?project=${project.id}`}
                      className="block bg-white/10 hover:bg-white/20 rounded-xl p-4 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{project.title}</h4>
                          <p className="text-emerald-100 text-sm mt-1 line-clamp-1">{project.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">${project.budget_min}-${project.budget_max}</p>
                          <p className="text-emerald-100 text-xs">{project.experience_level}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-6 text-center py-8">
                  <p className="text-emerald-100">No matching projects found. Update your skills to get better matches.</p>
                  <Link to="/dashboard/profile" className="inline-block mt-3 text-sm font-medium underline">
                    Update Profile
                  </Link>
                </div>
              )}
            </div>
          ) : (
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
          )}

          {/* Recent Activity */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Recent Activity</h2>
              <Link
                to={isFreelancer ? '/dashboard/contracts' : '/client/contracts'}
                className="text-emerald-600 font-medium text-sm hover:underline"
              >
                View All
              </Link>
            </div>

            {activities.length > 0 ? (
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      activity.type === 'contract' ? 'bg-emerald-100 text-emerald-600' :
                      activity.type === 'proposal' ? 'bg-blue-100 text-blue-600' :
                      activity.type === 'project' ? 'bg-orange-100 text-orange-600' :
                      'bg-purple-100 text-purple-600'
                    }`}>
                      <activity.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900">{activity.title}</p>
                      <p className="text-sm text-slate-500 truncate">{activity.description}</p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(activity.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-500">
                  {isFreelancer
                    ? 'No recent activity. Start by submitting proposals!'
                    : 'No recent activity. Post a project to get started!'}
                </p>
                <Link
                  to={isFreelancer ? '/dashboard/feed' : '/client/post'}
                  className="inline-block mt-3 text-emerald-600 font-medium hover:underline"
                >
                  {isFreelancer ? 'Browse Projects' : 'Post a Project'}
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right Column - 1/3 */}
        <div className="space-y-4 sm:space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100">
            <h3 className="font-semibold text-slate-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              {isFreelancer ? (
                <>
                  <Link
                    to="/dashboard/feed"
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <Briefcase className="w-5 h-5 text-slate-600" />
                    <span className="font-medium text-slate-700">Find Projects</span>
                  </Link>
                  <Link
                    to="/dashboard/proposals"
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <FileText className="w-5 h-5 text-slate-600" />
                    <span className="font-medium text-slate-700">My Proposals</span>
                  </Link>
                  <Link
                    to="/dashboard/invites"
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <MessageSquare className="w-5 h-5 text-slate-600" />
                    <span className="font-medium text-slate-700">Invites ({stats.pendingInvites})</span>
                  </Link>
                  <Link
                    to="/dashboard/wallet"
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <Wallet className="w-5 h-5 text-slate-600" />
                    <span className="font-medium text-slate-700">Earnings</span>
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/client/post"
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <Plus className="w-5 h-5 text-slate-600" />
                    <span className="font-medium text-slate-700">Post a Project</span>
                  </Link>
                  <Link
                    to="/client/matches"
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <Users className="w-5 h-5 text-slate-600" />
                    <span className="font-medium text-slate-700">Find Talent</span>
                  </Link>
                  <Link
                    to="/client/contracts"
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <FileText className="w-5 h-5 text-slate-600" />
                    <span className="font-medium text-slate-700">Contracts</span>
                  </Link>
                  <Link
                    to="/client/payments"
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <CreditCard className="w-5 h-5 text-slate-600" />
                    <span className="font-medium text-slate-700">Payments</span>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Notifications</h3>
              {stats.unreadNotifications > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {stats.unreadNotifications}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">
              {isFreelancer
                ? 'Stay updated with your latest project activities.'
                : 'Stay informed about proposals and contract updates.'}
            </p>
            <Link
              to={isFreelancer ? '/dashboard/inbox' : '/client/contracts'}
              className="block mt-4 text-emerald-600 font-medium text-sm hover:underline"
            >
              View Details →
            </Link>
          </div>

          {/* Profile Completion Widget Removed */}
        </div>
      </div>
    </div>
  );
}