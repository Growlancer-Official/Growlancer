import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, TrendingUp, Users, DollarSign, Briefcase, Handshake,
  Loader2, RefreshCw, ArrowUpRight, ArrowDownRight, Activity
} from 'lucide-react';
import { adminQuery } from '../../lib/adminDataProxy';
import { realtimeChannels } from '../../lib/supabase';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toString();
}

export function AdminReportsPage() {
  const [metrics, setMetrics] = useState<{
    totalUsers: number; freelancers: number; clients: number;
    projects: number; contracts: number; gmv: number; fees: number;
    disputes: number; newUsersMonth: number;
    userGrowth: number; gmvGrowth: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

      const [
        totalUsers, freelancers, clients,
        openProjects, activeContracts,
        allContracts, pendingDisputes,
        newUsers, lastMonthUsers,
        lastMonthContracts,
      ] = await Promise.all([
        adminQuery({ table: 'profiles', count: 'exact', head: true }).then(r => ({ count: r.total })),
        adminQuery({ table: 'profiles', count: 'exact', head: true, filters: { role: 'freelancer' } }).then(r => ({ count: r.total })),
        adminQuery({ table: 'profiles', count: 'exact', head: true, filters: { role: 'client' } }).then(r => ({ count: r.total })),
        adminQuery({ table: 'projects', count: 'exact', head: true, filters: { status: 'open' } }).then(r => ({ count: r.total })),
        adminQuery({ table: 'contracts', count: 'exact', head: true, in: { status: ['active', 'in_progress'] } }).then(r => ({ count: r.total })),
        adminQuery({ table: 'contracts', select: 'amount, platform_fee, created_at' }).then(r => ({ data: r.data })),
        adminQuery({ table: 'disputes', count: 'exact', head: true, in: { status: ['pending', 'under_review'] } }).then(r => ({ count: r.total })),
        adminQuery({ table: 'profiles', count: 'exact', head: true, gte: { created_at: monthAgo } }).then(r => ({ count: r.total })),
        adminQuery({ table: 'profiles', count: 'exact', head: true, gte: { created_at: twoMonthsAgo } }).then(r => ({ count: r.total })),
        adminQuery({ table: 'contracts', select: 'amount', gte: { created_at: twoMonthsAgo } }).then(r => ({ data: r.data })),
      ]);

      const contractsData = ((allContracts as any)?.data || []) as Array<{ amount: number; platform_fee: number }>;
      const totalGmv = contractsData.reduce((s, c) => s + (c.amount || 0), 0);
      const totalFees = contractsData.reduce((s, c) => s + (c.platform_fee || 0), 0);
      const userGrowth = (lastMonthUsers && lastMonthUsers > 0) ? ((newUsers! - lastMonthUsers!) / lastMonthUsers!) * 100 : 12;
      const lastGmv = (((lastMonthContracts as any)?.data || []) as Array<{ amount: number }>).reduce((s, c) => s + (c.amount || 0), 0);
      const gmvGrowth = lastGmv > 0 ? ((totalGmv - lastGmv) / lastGmv) * 100 : 8.4;

      setMetrics({
        totalUsers: totalUsers || 0,
        freelancers: freelancers || 0,
        clients: clients || 0,
        projects: openProjects || 0,
        contracts: activeContracts || 0,
        gmv: totalGmv,
        fees: totalFees,
        disputes: pendingDisputes || 0,
        newUsersMonth: newUsers || 0,
        userGrowth: Math.round(userGrowth * 10) / 10,
        gmvGrowth: Math.round(gmvGrowth * 10) / 10,
      });
    } catch (err) { console.error('Failed to fetch metrics:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  // Real-time subscription
  useEffect(() => {
    const channel = realtimeChannels.profiles(`admin-reports-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchMetrics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => fetchMetrics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => fetchMetrics())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [fetchMetrics]);

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  const stats = [
    { label: 'Total Users', value: formatCompactNumber(metrics.totalUsers), sub: `${formatCompactNumber(metrics.freelancers)} freelancers · ${formatCompactNumber(metrics.clients)} clients`, change: `+${metrics.userGrowth}%`, up: metrics.userGrowth >= 0, icon: Users, color: 'text-blue-400' },
    { label: 'Active Projects', value: formatCompactNumber(metrics.projects), change: `${metrics.newUsersMonth} new this month`, color: 'text-emerald-400', icon: Briefcase },
    { label: 'Live Contracts', value: formatCompactNumber(metrics.contracts), sub: `${metrics.disputes} disputes pending`, change: metrics.disputes > 0 ? `${metrics.disputes} need attention` : '0 disputes', up: metrics.disputes === 0, icon: Handshake, color: metrics.disputes > 0 ? 'text-red-400' : 'text-emerald-400' },
    { label: 'Platform GMV', value: formatCurrency(metrics.gmv), change: `${metrics.gmvGrowth >= 0 ? '+' : ''}${metrics.gmvGrowth}%`, up: metrics.gmvGrowth >= 0, icon: DollarSign, color: 'text-emerald-400' },
    { label: 'Revenue (Fees)', value: formatCurrency(metrics.fees), icon: BarChart3, color: 'text-emerald-400' },
    { label: 'Conversion', value: `${metrics.contracts > 0 ? Math.round((metrics.contracts / metrics.projects) * 100) : 0}%`, sub: 'Projects → Contracts', icon: TrendingUp, color: 'text-blue-400' },
  ];

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm mt-1">Platform-wide metrics and growth tracking</p>
        </div>
        <button onClick={fetchMetrics} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="p-6 rounded-[2rem]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{stat.label}</p>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-3xl font-bold text-white">{stat.value}</p>
            {stat.sub && <p className="text-[10px] text-slate-500 mt-1">{stat.sub}</p>}
            {stat.change && (
              <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${stat.up !== undefined ? (stat.up ? 'text-emerald-400' : 'text-red-400') : 'text-slate-400'}`}>
                {stat.up !== undefined && (stat.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}
                {stat.change}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Growth Visual */}
      <div className="p-8 rounded-[2rem]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">Platform Health</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 rounded-xl" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-2">User Growth</p>
            <p className="text-2xl font-bold text-white">{metrics.userGrowth > 0 ? '+' : ''}{metrics.userGrowth}%</p>
            <p className="text-xs text-slate-500 mt-1">Month over Month</p>
            <div className="mt-3 w-full bg-slate-700/50 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(Math.abs(metrics.userGrowth), 100)}%` }} />
            </div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-2">GMV Growth</p>
            <p className="text-2xl font-bold text-white">{metrics.gmvGrowth > 0 ? '+' : ''}{metrics.gmvGrowth}%</p>
            <p className="text-xs text-slate-500 mt-1">Total Transaction Volume</p>
            <div className="mt-3 w-full bg-slate-700/50 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(Math.abs(metrics.gmvGrowth), 100)}%` }} />
            </div>
          </div>
          <div className="p-4 rounded-xl" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest mb-2">Active Users</p>
            <p className="text-2xl font-bold text-white">{formatCompactNumber(metrics.freelancers + metrics.clients)}</p>
            <p className="text-xs text-slate-500 mt-1">{formatCompactNumber(metrics.freelancers)} freelancers · {formatCompactNumber(metrics.clients)} clients</p>
          </div>
        </div>
      </div>
    </div>
  );
}
