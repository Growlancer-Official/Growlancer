import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Briefcase,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Repeat,
  ShoppingBag,
  Star,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { analyticsService, type AnalyticsData } from '../../lib/analyticsService';
import { supabase } from '../../lib/supabase';

export function AnalyticsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await analyticsService.getFreelancerAnalytics(user.id, timeframe);
      setData(result);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [user, timeframe]);

  useEffect(() => {
    fetchAnalytics();

    if (!user) return;
    // Real-time: refresh analytics when any relevant table changes for this user
    const channel = supabase
      .channel(`analytics-realtime:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts', filter: `freelancer_id=eq.${user.id}` }, () => void fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals', filter: `freelancer_id=eq.${user.id}` }, () => void fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${user.id}` }, () => void fetchAnalytics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `reviewee_id=eq.${user.id}` }, () => void fetchAnalytics())
      .subscribe();

    return () => { void channel.unsubscribe(); };
  }, [fetchAnalytics, user]);

  if (loading && !data) {
    return <LoadingSkeleton variant="full-page" />;
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const formatPercent = (value: number) => `${Math.round(value * 10) / 10}%`;

  const MetricCard = ({
    icon: Icon,
    label,
    value,
    sublabel,
    trend,
    trendLabel,
    color,
  }: {
    icon: React.ElementType;
    label: string;
    value: string;
    sublabel?: string;
    trend?: 'up' | 'down' | 'neutral';
    trendLabel?: string;
    color: string;
  }) => (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 mb-1">{label}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
        </div>
        <div className={`p-3 rounded-xl ${color.replace('text-', 'bg-').replace('-600', '-50').replace('-500', '-50').replace('-700', '-100')}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
      {trend && trendLabel && (
        <div className="flex items-center gap-1 mt-3 text-xs">
          {trend === 'up' ? (
            <ArrowUp className="w-3 h-3 text-emerald-500" />
          ) : trend === 'down' ? (
            <ArrowDown className="w-3 h-3 text-red-500" />
          ) : null}
          <span className={trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-400'}>
            {trendLabel}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 mt-1">Track your performance and growth</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAnalytics}
            className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="flex bg-slate-100 rounded-xl p-1">
            {(['7d', '30d', '90d', '1y'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  timeframe === t
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data && (
        <>
          {/* Earnings & Contracts Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={DollarSign}
              label="Total Earnings"
              value={formatCurrency(data.totalEarnings)}
              sublabel={`${formatCurrency(data.monthlyEarnings)} this month`}
              color="text-emerald-600"
            />
            <MetricCard
              icon={TrendingUp}
              label="Pending Payouts"
              value={formatCurrency(data.pendingPayouts)}
              color="text-amber-600"
            />
            <MetricCard
              icon={Briefcase}
              label="Active Contracts"
              value={String(data.activeContracts)}
              sublabel={`${data.completedContracts} completed`}
              color="text-blue-600"
            />
            <MetricCard
              icon={CheckCircle}
              label="Success Rate"
              value={formatPercent(data.contractSuccessRate)}
              sublabel={`${data.totalContracts} total contracts`}
              color="text-violet-600"
            />
          </div>

          {/* Earnings Chart */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Earnings Overview</h2>
                <p className="text-sm text-slate-500">Monthly earnings for the past 6 months</p>
              </div>
              <BarChart3 className="w-5 h-5 text-slate-400" />
            </div>
            <div className="h-48 flex items-end gap-2">
              {data.earningsByMonth.length > 0 ? (
                data.earningsByMonth.map((month, idx) => {
                  const maxAmount = Math.max(...data.earningsByMonth.map((m) => m.amount), 1);
                  const heightPercent = (month.amount / maxAmount) * 100;
                  const monthLabel = new Date(month.month + '-01').toLocaleDateString('en-US', { month: 'short' });
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {formatCurrency(month.amount)}
                      </div>
                      <div
                        className="w-full bg-emerald-500/20 rounded-t-lg hover:bg-emerald-500/30 transition-colors cursor-pointer relative"
                        style={{ height: `${Math.max(heightPercent, 2)}%` }}
                      >
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-emerald-500 rounded-t-lg transition-all"
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">{monthLabel}</span>
                    </div>
                  );
                })
              ) : (
                <div className="w-full flex items-center justify-center text-slate-400 text-sm py-12">
                  No earnings data yet
                </div>
              )}
            </div>
          </div>

          {/* Proposals & Reviews Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              icon={FileText}
              label="Proposals"
              value={String(data.totalProposals)}
              sublabel={`${formatPercent(data.proposalConversionRate)} conversion rate`}
              trend={data.proposalConversionRate >= 30 ? 'up' : data.proposalConversionRate > 0 ? 'down' : undefined}
              trendLabel={data.proposalConversionRate >= 30 ? 'Above average' : data.proposalConversionRate > 0 ? 'Needs improvement' : undefined}
              color="text-indigo-600"
            />
            <MetricCard
              icon={Star}
              label="Average Rating"
              value={data.averageRating > 0 ? data.averageRating.toFixed(1) : '—'}
              sublabel={`${data.totalReviews} reviews`}
              color="text-amber-500"
            />
            <MetricCard
              icon={Eye}
              label="Profile Views"
              value={String(data.profileViews)}
              trend={data.profileViewsChange > 0 ? 'up' : data.profileViewsChange < 0 ? 'down' : undefined}
              trendLabel={
                data.profileViewsChange > 0
                  ? `+${data.profileViewsChange}% vs last month`
                  : data.profileViewsChange < 0
                  ? `${data.profileViewsChange}% vs last month`
                  : undefined
              }
              color="text-cyan-600"
            />
          </div>

          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={Clock}
              label="On-Time Delivery"
              value={formatPercent(data.onTimeDelivery)}
              color="text-green-600"
            />
            <MetricCard
              icon={Users}
              label="Repeat Hire Rate"
              value={formatPercent(data.repeatHireRate)}
              color="text-pink-600"
            />
            <MetricCard
              icon={Activity}
              label="Response Rate"
              value={formatPercent(data.responseRate)}
              color="text-teal-600"
            />
            <MetricCard
              icon={ShoppingBag}
              label="Services"
              value={`${data.activeServices} active`}
              sublabel={`${data.totalServiceOrders} orders, ${data.totalServiceViews} views`}
              color="text-orange-600"
            />
          </div>

          {/* Project Matches */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">AI Project Matches</h2>
                <p className="text-sm text-slate-500">Projects matched to your skills</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl p-4">
                <p className="text-3xl font-bold text-violet-600">{data.newMatches}</p>
                <p className="text-sm text-violet-600/70">New Matches</p>
              </div>
              <div className="flex-1 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-4">
                <p className="text-3xl font-bold text-blue-600">{data.totalMatches}</p>
                <p className="text-sm text-blue-600/70">Total Matches</p>
              </div>
              <div className="flex-1 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-4">
                <p className="text-3xl font-bold text-emerald-600">
                  {data.totalProposals > 0 ? Math.round((data.acceptedProposals / data.totalProposals) * 100) : 0}%
                </p>
                <p className="text-sm text-emerald-600/70">Proposal Acceptance</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}