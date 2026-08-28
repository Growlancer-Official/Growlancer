import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot, Briefcase, Check, CreditCard, FileText, Handshake, Headphones, MessageSquare, Plus, Sparkles, Trophy, Users, Wallet, Zap,  } from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatBudgetRange, safeFormatDate, safeLower, safeNumber } from '../../utils/date';
import { formatCurrency } from '../../lib/currency';
import { CacheManager } from '../../lib/services/cacheManager';
import {
  projectsService,
  proposalsService,
  contractsService,
  invitesService,
  transactionsService,
} from '../../lib/dataService';
import { notificationService } from '../../lib/notifications';
import { ProBadge } from '../../components/ProBadge';
import { VerifiedBadge } from '../../components/VerifiedBadge';
import { InfoTip } from '../../components/InfoTip';
import { useProStatus } from '../../hooks/useProStatus';
import { ACTIVE_STATUSES, PENDING_STATUSES } from '../../lib/contractStatuses';
import { getSellerLevelInfo, getSellerLevelProgress, type SellerLevel } from '../../lib/sellerLevels';

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
  /** Short plain-language explanation shown as a hover tooltip next to the label. */
  hint?: string;
}

/**
 * Resolve a project title from a row that embeds `projects`/`project`
 * (PostgREST may embed a to-one FK as an object OR an array depending on
 * relationship detection). Falls back gracefully instead of showing 'Unknown'.
 */
function resolveProjectTitle(row: any): string {
  const embedded = row?.projects ?? row?.project;
  const target = Array.isArray(embedded) ? embedded[0] : embedded;
  const title = target?.title;
  return title && String(title).trim() ? String(title) : 'Untitled project';
}

/**
 * Resolve a party (client/freelancer) name from an embedded profile key.
 */
function resolvePartyName(row: any, key: string, fallback: string): string {
  const embedded = row?.[key];
  const target = Array.isArray(embedded) ? embedded[0] : embedded;
  const name = target?.name;
  return name && String(name).trim() ? String(name) : fallback;
}

export function OverviewPage() {
  const { user, role } = useAuth();
  const { isPro } = useProStatus();
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
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Seller position (level) — recomputed server-side when contracts complete
  const [sellerInfo, setSellerInfo] = useState<{
    level: SellerLevel;
    rating: number;
    completionRate: number;
    completedProjects: number;
  }>({ level: 'new', rating: 0, completionRate: 100, completedProjects: 0 });

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

        // ⚡ Performance: ONE light query fetches `skills` (for matching) and
        // one tiny usage_logs count for profile views. Previously this called
        // analyticsService.getFreelancerAnalytics() — 8 parallel heavy queries
        // (contracts, proposals, reviews, services, ai_matches, wallet RPC,
        // transactions) — just to display a single profile-views number.
        const [
          contractsData,
          proposalsData,
          invitesData,
          projectsData,
          notificationResult,
          earningsData,
          profileResult,
          profileViewsResult,
          matchCountResult,
        ] = await Promise.all([
          contractsService.getByUser(user.id, 'freelancer', true),
          proposalsService.getByFreelancer(user.id, true),
          invitesService.getFreelancerInvites(user.id, true),
          projectsService.getOpenProjects(50, true),
          notificationService.getByUser(user.id),
          transactionsService.getEarningsSummary(user.id),
          supabase
            .from('freelancer_profiles')
            .select('skills, seller_level, rating, completion_rate')
            .eq('user_id', user.id)
            .maybeSingle(),
          // Profile views live in usage_logs (feature='profile_view') — the
          // freelancer_profiles table has no such column (old code silently
          // returned 0 via a non-existent column). Count rows headlessly.
          supabase
            .from('usage_logs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('feature', 'profile_view'),
          // Real AI match count (was: proposals + invites — never updated live).
          // Same >= 40 threshold the feed uses, so the number matches the feed.
          supabase
            .from('ai_matches')
            .select('id', { count: 'exact', head: true })
            .eq('freelancer_id', user.id)
            .gte('match_score', 40),
        ]);

        const profileData = profileResult?.data as Record<string, unknown> | null;
        const profileViews = profileViewsResult?.count ?? 0;
        const matchesCount = matchCountResult?.count ?? 0;

        // Seller position (level) — server-computed, shown live here
        const sellerLevelRaw = (profileData?.seller_level as string | null | undefined) || 'new';
        const sellerLevel = (
          ['top_rated_plus', 'top_rated', 'rising_talent', 'level_1', 'new'].includes(sellerLevelRaw)
            ? sellerLevelRaw
            : 'new'
        ) as SellerLevel;
        const completedProjects = Array.isArray(contractsData)
          ? contractsData.filter(c => c.status === 'completed').length
          : 0;

        // Calculate stats
        const activeContracts = Array.isArray(contractsData)
          ? contractsData.filter(c => ACTIVE_STATUSES.includes(c.status || '')).length
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
              return required.some((skill: unknown) =>
                freelancerSkills.some((fs: unknown) =>
                  safeLower(fs) !== '' && safeLower(fs) === safeLower(skill)
                )
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
            description: `Project: ${resolveProjectTitle(c)}`,
            timestamp: c.created_at,
            icon: Handshake,
          })) : []),
          ...(Array.isArray(proposalsData) ? proposalsData.slice(0, 3).map((p: any) => ({
            id: p.id,
            type: 'proposal',
            title: p.status === 'pending' ? 'Proposal Pending' : `Proposal ${p.status}`,
            description: `Project: ${resolveProjectTitle(p)}`,
            timestamp: p.created_at,
            icon: FileText,
          })) : []),
          ...(Array.isArray(invitesData) ? invitesData.slice(0, 2).map((i: any) => ({
            id: i.id,
            type: 'invite',
            title: 'New Invitation',
            description: `Project: ${resolveProjectTitle(i)}`,
            timestamp: i.created_at,
            icon: Briefcase,
          })) : []),
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);

        setStats({
          activeContracts,
          pendingProposals,
          newMatches: matchesCount,
          pendingInvites,
          totalEarnings: earningsData.total,
          monthlyEarnings: earningsData.monthly,
          profileViews,
          unreadNotifications,
        });

        setSellerInfo({
          level: sellerLevel,
          rating: Number(profileData?.rating) || 0,
          completionRate: Number(profileData?.completion_rate) || 100,
          completedProjects,
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

        // Only genuinely in-progress work counts as "active" — pending contracts
        // (not yet started) are NOT active, which previously made the overview
        // show "Active Contract" while the contracts page showed it as pending.
        const activeContracts = Array.isArray(contractsData)
          ? contractsData.filter(c => ACTIVE_STATUSES.includes(c.status || '')).length
          : 0;
        const pendingContracts = Array.isArray(contractsData)
          ? contractsData.filter(c => PENDING_STATUSES.includes(c.status || '')).length
          : 0;
        const totalSpent = Array.isArray(contractsData)
          ? contractsData
              .filter(c => c.status === 'completed')
              .reduce((sum: number, c: any) => sum + Number(c.amount), 0)
          : 0;
        const unreadNotifications = Array.isArray(notificationResult?.notifications)
          ? notificationResult.notifications.filter((n: any) => !n.read).length
          : 0;
        const pendingProposals = await proposalsService.countPendingForClient(user.id);

        setStats({
          activeContracts,
          pendingProposals,
          newMatches: pendingProposals,
          pendingInvites: pendingContracts,
          totalEarnings: totalSpent,
          monthlyEarnings: 0,
          profileViews: 0,
          unreadNotifications,
        });

        setRecentProjects(Array.isArray(projectsData) ? projectsData.slice(0, 5) : []);

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
            description: `Freelancer: ${resolvePartyName(c, 'freelancer_profile', 'Freelancer')}`,
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
        // Live AI matches count — new match → number updates instantly
        const matchSub = supabase
          .channel(`overview-matches-${user.id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'ai_matches', filter: `freelancer_id=eq.${user.id}` },
            () => { fetchDashboardData(); }
          )
          .subscribe();
        // Live seller position — level bump (contract completed) shows instantly
        const levelSub = supabase
          .channel(`overview-level-${user.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'freelancer_profiles', filter: `user_id=eq.${user.id}` },
            () => { fetchDashboardData(); }
          )
          .subscribe();

        return () => {
          contractSub.unsubscribe();
          proposalSub.unsubscribe();
          txSub.unsubscribe();
          notifSub.unsubscribe();
          inviteSub.unsubscribe();
          matchSub.unsubscribe();
          levelSub.unsubscribe();
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
      <div className="p-6 lg:p-8 max-w-[100rem] mx-auto">
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
          label: 'AI Matches',
          value: stats.newMatches,
          change: stats.newMatches > 0 ? 'Fresh matches, live' : 'Update skills to get matched',
          changeType: stats.newMatches > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Earnings (INR)',
          value: formatCurrency(safeNumber(stats.totalEarnings)),
          change: `${formatCurrency(safeNumber(stats.monthlyEarnings))} this month`,
          changeType: stats.monthlyEarnings > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Profile Views',
          value: safeNumber(stats.profileViews).toLocaleString(),
          change: 'From your public profile',
          changeType: stats.profileViews > 0 ? 'positive' : 'neutral',
        },
      ]
    : [
        {
          label: 'Active Contracts',
          value: stats.activeContracts,
          change: stats.activeContracts > 0 ? 'In progress right now' : 'No active contracts',
          changeType: stats.activeContracts > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Pending Contracts',
          value: stats.pendingInvites,
          change: stats.pendingInvites > 0 ? 'Awaiting freelancer start' : 'No pending contracts',
          changeType: stats.pendingInvites > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Pending Proposals',
          value: stats.pendingProposals,
          change: stats.pendingProposals > 0 ? 'Awaiting your review' : 'No pending proposals',
          changeType: stats.pendingProposals > 0 ? 'positive' : 'neutral',
        },
        {
          label: 'Total Spent',
          value: formatCurrency(safeNumber(stats.totalEarnings)),
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2.5 flex-wrap">
            Welcome back, {user?.name || (isFreelancer ? 'Freelancer' : 'Client')}!
            {user?.verificationStatus === 'verified' && <VerifiedBadge size="sm" />}
            {isFreelancer && isPro && <ProBadge size="md" />}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isFreelancer
              ? "Here's your freelancing overview."
              : 'Manage your projects and freelancers.'}
          </p>
        </div>
      </div>

      {/* Profile Completion Banner Removed */}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {quickStats.slice(0, 4).map((stat, index) => (
          <div key={index} className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all duration-300">
            <p className="flex items-center gap-1 text-slate-500 text-xs sm:text-sm font-medium truncate">
              {stat.label}
              {stat.hint && <InfoTip text={stat.hint} />}
            </p>
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
            <div className="bg-gradient-to-r from-emerald-500 via-teal-600 to-emerald-600 rounded-2xl p-4 sm:p-6 text-white shadow-lg hover:shadow-emerald-500/20 hover:-translate-y-0.5 transition-all duration-300 transform animate-workflow-flow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-xl flex items-center justify-center animate-workflow-pulse shrink-0">
                    <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-lg font-semibold flex items-center gap-1.5 flex-wrap">
                      AI Recommendations <span className="flex h-2 w-2 rounded-full bg-emerald-300 animate-ping shrink-0"></span>
                    </h3>
                    <p className="text-emerald-100 text-xs sm:text-sm">Projects matched to your skills</p>
                  </div>
                </div>
                <Link
                  to="/dashboard/feed"
                  className="                  w-full sm:w-auto text-center self-start sm:self-auto bg-white text-emerald-600 px-4 sm:px-4 py-2 sm:py-2 rounded-lg text-sm sm:text-base font-semibold hover:bg-emerald-50 hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
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
                          <p className="font-semibold">{formatBudgetRange(project.budget_min, project.budget_max)}</p>
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
                Let our AI find the best freelancers for your projects.
              </p>
              <Link
                to="/client/ai-assistant"
                className="inline-block bg-white text-emerald-600 px-4 py-2 rounded-lg font-medium hover:bg-emerald-50 hover:scale-105 active:scale-95 transition-all duration-200"
              >
                Chat with AI — Free
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
                      {safeFormatDate(activity.timestamp)}
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
                  <Link
                    to="/contests"
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                  >
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <span className="font-medium text-slate-700">Contests</span>
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

          {/* Seller Level / Position — updates live when contracts complete */}
          {isFreelancer && (() => {
            const levelInfo = getSellerLevelInfo(sellerInfo.level);
            const nextInfo = levelInfo.nextLevel ? getSellerLevelInfo(levelInfo.nextLevel) : null;
            const progress = getSellerLevelProgress({
              rating: sellerInfo.rating,
              totalProjects: sellerInfo.completedProjects,
              completionRate: sellerInfo.completionRate,
            });
            // Requirement checklist with live met/unmet state
            const levelReqs: { label: string; met: boolean }[] = nextInfo
              ? nextInfo.nextRequirements.map((req) => {
                  const reqLower = req.toLowerCase();
                  const isRating = reqLower.includes('rating');
                  const isProjects = reqLower.includes('project') || reqLower.includes('completed');
                  const isCompletion = reqLower.includes('completion');
                  const met = isRating
                    ? sellerInfo.rating >= parseFloat(reqLower.match(/\d+(?:\.\d+)?/)?.[0] || '99')
                    : isProjects
                    ? sellerInfo.completedProjects >= parseInt(reqLower.match(/\d+/)?.[0] || '99')
                    : isCompletion
                    ? sellerInfo.completionRate >= parseFloat(reqLower.match(/\d+(?:\.\d+)?/)?.[0] || '99')
                    : false;
                  return { label: req, met };
                })
              : [];
            return (
              <div className="bg-white rounded-2xl p-6 border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="flex items-center gap-1.5 font-semibold text-slate-900">
                    Your Position
                    <InfoTip
                      title="Freelancer levels"
                      text="Your position grows automatically as you complete contracts on time with happy clients: New → Level 1 → Rising Talent → Top Rated → Top Rated Plus. Higher levels unlock more visibility and trust with clients."
                    />
                  </h3>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${levelInfo.bgColor} ${levelInfo.color} ${levelInfo.borderColor}`}>
                    {levelInfo.label}
                  </span>
                </div>
                <p className="text-sm text-slate-500">{levelInfo.description}</p>

                {/* Live performance metrics */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
                    <p className="text-base font-bold text-slate-900">{sellerInfo.completedProjects}</p>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Completed</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
                    <p className="text-base font-bold text-slate-900">{sellerInfo.rating.toFixed(1)}</p>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Rating</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
                    <p className="text-base font-bold text-slate-900">{sellerInfo.completionRate}%</p>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Completion</p>
                  </div>
                </div>

                {nextInfo ? (
                  <>
                    <div className="mt-4">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-medium text-slate-600">Progress to {nextInfo.label}</span>
                        <span className="font-bold text-emerald-600">{Number.isFinite(progress.percent) ? progress.percent : 0}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700"
                          style={{ width: `${Number.isFinite(progress.percent) ? Math.min(100, progress.percent) : 0}%` }}
                        />
                      </div>
                    </div>
                    <ul className="mt-4 space-y-1.5">
                      {levelReqs.map((req) => (
                        <li key={req.label} className="text-xs flex items-center gap-2">
                          <span
                            className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                              req.met ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {req.met ? <Check className="w-2.5 h-2.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                          </span>
                          <span className={req.met ? 'text-slate-700 font-medium' : 'text-slate-500'}>{req.label}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-xs text-emerald-600 mt-3 font-medium">🎉 Highest level achieved!</p>
                )}
              </div>
            );
          })()}

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
              to={isFreelancer ? '/dashboard/notifications' : '/client/contracts'}
              className="block mt-4 text-emerald-600 font-medium text-sm hover:underline"
            >
              View Details →
            </Link>
          </div>

          {/* Profile Completion Widget Removed */}
        </div>
      </div>

      {/* AI Assistant & Support — prominent section for both roles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-emerald-500/20 hover:-translate-y-0.5 transition-all duration-300">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">AI Assistant</h3>
              <p className="text-emerald-100 text-xs">
                {isFreelancer ? 'Proposals, contracts, escrow, career help' : 'Hiring, contracts, escrow, project help'}
              </p>
            </div>
          </div>
          <p className="text-emerald-50 text-sm leading-relaxed mb-4">
            Ask anything in any language — get instant, accurate answers about how your{' '}
            {isFreelancer ? 'freelancing business' : 'projects'} work on Growlancer.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to={isFreelancer ? '/dashboard/ai-assistant' : '/client/ai-assistant'}
              className="inline-flex items-center gap-2 bg-white text-emerald-700 px-4 py-2 rounded-xl font-semibold text-sm hover:bg-emerald-50 transition-colors"
            >
              <Bot className="w-4 h-4" />
              Chat with AI
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-11 w-11 rounded-xl bg-orange-100 flex items-center justify-center">
              <Headphones className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Support & Help</h3>
              <p className="text-slate-500 text-xs">Payments, verification, disputes, account issues</p>
            </div>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed mb-4">
            Guided AI support for account and payment issues, or raise a support ticket and our team will help.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to={isFreelancer ? '/dashboard/ai-assistant' : '/client/ai-assistant'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors"
            >
              <Headphones className="w-4 h-4" />
              AI Support
            </Link>
            <Link
              to={isFreelancer ? '/dashboard/tickets' : '/client/tickets'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Support Tickets
            </Link>
            <Link
              to="/help-center"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Help Center
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}