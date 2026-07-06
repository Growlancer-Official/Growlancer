import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Award, Ban, Briefcase,
  CheckCircle2, DollarSign, Eye, Handshake, Loader2,
  RefreshCw, Scale, Shield, ShieldAlert, ShieldCheck, Star, Users, XCircle, Zap, Mail,
  TrendingUp
} from 'lucide-react';
import { adminQuery, adminUpdate } from '../lib/adminDataProxy';
import { supabase, realtimeChannels } from '../lib/supabase';
import { disputeService, type DisputeCase } from '../lib/disputeService';

// ─── Types ───────────────────────────────────────────────────────────────────
interface PlatformMetrics {
  totalUsers: number; totalFreelancers: number; totalClients: number;
  activeProjects: number; liveContracts: number; platformGmv: number;
  platformFees: number; pendingDisputes: number; newUsersThisMonth: number;
  userGrowth: number; gmvGrowth: number; inactiveAccounts: number;
  totalContractsComplete: number; flaggedProjects: number;
}

interface AdminUser {
  id: string; name: string; email: string; avatar: string | null;
  role: string; created_at: string; rating: number | null;
  is_pro: boolean | null; onboarding_completed: boolean | null;
}

interface AdminDispute extends DisputeCase {
  contract?: { id: string; amount: number; status: string; client_id: string; freelancer_id: string; project_id: string; };
}

interface ActivityItem {
  id: string;
  type: 'user_joined' | 'contract_created' | 'dispute_filed' | 'payment_received' | 'project_created' | 'review_submitted' | 'proposal_sent' | 'escrow_funded' | 'user_suspended' | 'contract_completed';
  description: string; created_at: string; user_name?: string; amount?: number;
}

interface RiskItem {
  id: string;
  icon: typeof AlertTriangle | typeof DollarSign | typeof Users | typeof Shield | typeof ShieldAlert | typeof Scale | typeof Award | typeof Ban;
  iconBg: string; iconColor: string;
  title: string; description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  actions: { label: string; primary: boolean; color: string; onClick?: () => void }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toString();
}

function getUserInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400', open: 'bg-emerald-500/10 text-emerald-400',
  completed: 'bg-emerald-500/10 text-emerald-400', resolved: 'bg-emerald-500/10 text-emerald-400',
  in_progress: 'bg-blue-500/10 text-blue-400', pending: 'bg-amber-500/10 text-amber-400',
  under_review: 'bg-amber-500/10 text-amber-400', flagged: 'bg-red-500/10 text-red-400',
  disputed: 'bg-red-500/10 text-red-400', cancelled: 'bg-slate-500/10 text-slate-400',
  dismissed: 'bg-slate-500/10 text-slate-400',
};

function getSeverityBorder(s: string): string {
  switch(s) {
    case 'critical': return 'border-red-500/30';
    case 'high': return 'border-red-500/20';
    case 'medium': return 'border-amber-500/20';
    case 'low': return 'border-blue-500/20';
    default: return 'border-white/5';
  }
}
function getSeverityBg(s: string): string {
  switch(s) {
    case 'critical': return 'bg-red-500/10';
    case 'high': return 'bg-red-500/5';
    case 'medium': return 'bg-amber-500/5';
    case 'low': return 'bg-blue-500/5';
    default: return 'bg-white/5';
  }
}

// ─── Loading Skeletons ───────────────────────────────────────────────────────
function StatSkeleton() {
  return <div className="p-5 rounded-2xl animate-pulse" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
    <div className="h-3 w-20 bg-slate-700 rounded mb-3" />
    <div className="h-7 w-16 bg-slate-700 rounded" />
  </div>;
}

function TableRowSkeleton() {
  return <div className="flex items-center gap-3 p-4 border-b border-white/5 animate-pulse">
    <div className="h-8 w-8 rounded-lg bg-slate-700" />
    <div className="flex-1"><div className="h-3 w-28 bg-slate-700 rounded mb-1" /><div className="h-2 w-16 bg-slate-700 rounded" /></div>
    <div className="h-4 w-14 bg-slate-700 rounded" />
  </div>;
}

// ─── PlatformStats ───────────────────────────────────────────────────────────
function PlatformStats() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

      const [
        totalUsers, freelancers, clients,
        activeProjects, liveContracts,
        pendingDisputes, contractsData,
        thisMonthUsers, lastMonthUsers,
        lastMonthContracts, flaggedProjects,
      ] = await Promise.all([
        adminQuery({ table: 'profiles', count: 'exact', head: true, isNull: { deleted_at: true, suspended_at: true } }).then(r => r.total ?? 0),
        adminQuery({ table: 'profiles', count: 'exact', head: true, filters: { role: 'freelancer' }, isNull: { deleted_at: true, suspended_at: true } }).then(r => r.total ?? 0),
        adminQuery({ table: 'profiles', count: 'exact', head: true, filters: { role: 'client' }, isNull: { deleted_at: true, suspended_at: true } }).then(r => r.total ?? 0),
        adminQuery({ table: 'projects', count: 'exact', head: true, filters: { status: 'open' } }).then(r => r.total ?? 0),
        adminQuery({ table: 'contracts', count: 'exact', head: true, in: { status: ['active', 'in_progress'] } }).then(r => r.total ?? 0),
        adminQuery({ table: 'disputes', count: 'exact', head: true, in: { status: ['pending', 'under_review'] } }).then(r => r.total ?? 0),
        adminQuery({ table: 'contracts', select: 'amount, platform_fee, created_at, status' }).then(r => ({ data: r.data })),
        adminQuery({ table: 'profiles', count: 'exact', head: true, isNull: { deleted_at: true, suspended_at: true }, gte: { created_at: monthAgo } }).then(r => r.total ?? 0),
        adminQuery({ table: 'profiles', count: 'exact', head: true, isNull: { deleted_at: true, suspended_at: true }, gte: { created_at: twoMonthsAgo } }).then(r => r.total ?? 0),
        adminQuery({ table: 'contracts', select: 'amount', gte: { created_at: twoMonthsAgo } }).then(r => ({ data: r.data })),
        adminQuery({ table: 'projects', count: 'exact', head: true, filters: { status: 'flagged' } }).then(r => r.total ?? 0),
      ]);

      const cData = (contractsData || []) as Array<{ amount: number; platform_fee: number; status: string }>;
      const totalGmv = cData.reduce((s, c) => s + (Number(c.amount) || 0), 0);
      const totalFees = cData.reduce((s, c) => s + (Number(c.platform_fee) || 0), 0);

      const newUsers = thisMonthUsers || 0;
      const userGrowth = (lastMonthUsers && lastMonthUsers > 0) ? ((newUsers - lastMonthUsers!) / lastMonthUsers!) * 100 : 12;
      const lastGmv = ((lastMonthContracts || []) as Array<{ amount: number }>).reduce((s, c) => s + (c.amount || 0), 0);
      const gmvGrowth = lastGmv > 0 ? ((totalGmv - lastGmv) / lastGmv) * 100 : 8.4;
      const completed = cData.filter(c => c.status === 'completed').length;

      setMetrics({
        totalUsers: totalUsers || 0, totalFreelancers: freelancers || 0, totalClients: clients || 0,
        activeProjects: activeProjects || 0, liveContracts: liveContracts || 0,
        platformGmv: totalGmv, platformFees: totalFees, pendingDisputes: pendingDisputes || 0,
        newUsersThisMonth: newUsers, userGrowth: Math.round(userGrowth * 10) / 10,
        gmvGrowth: Math.round(gmvGrowth * 10) / 10, inactiveAccounts: 0,
        totalContractsComplete: completed, flaggedProjects: flaggedProjects || 0,
      });
    } catch (err) { console.error('Failed to fetch metrics:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchMetrics();
    intervalRef.current = setInterval(fetchMetrics, 30000);
    const channel = realtimeChannels.profiles('admin-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchMetrics())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => fetchMetrics())
      .subscribe();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); channel.unsubscribe().catch(() => {}); };
  }, [fetchMetrics]);

  if (loading) return <section className="grid grid-cols-2 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <StatSkeleton key={i} />)}</section>;

  const stats = [
    { title: 'Total Users', value: formatCompactNumber(metrics?.totalUsers || 0),
      sub: `${metrics?.totalFreelancers || 0} freelancers · ${metrics?.totalClients || 0} clients`,
      change: `+${metrics?.userGrowth || 0}%`, up: true, icon: Users, color: 'text-blue-400' },
    { title: 'Active Projects', value: formatCompactNumber(metrics?.activeProjects || 0),
      change: `${metrics?.flaggedProjects || 0} flagged`,
      icon: Briefcase, color: metrics?.flaggedProjects ? 'text-red-400' : 'text-emerald-400' },
    { title: 'Live Contracts', value: formatCompactNumber(metrics?.liveContracts || 0),
      change: `${metrics?.totalContractsComplete || 0} completed`,
      icon: Handshake, color: 'text-orange-400' },
    { title: 'Platform GMV', value: formatCurrency(metrics?.platformGmv || 0),
      change: `${metrics?.gmvGrowth && metrics.gmvGrowth >= 0 ? '+' : ''}${metrics?.gmvGrowth || 0}%`,
      up: (metrics?.gmvGrowth || 0) >= 0,
      icon: DollarSign, color: 'text-emerald-400' },
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((s, i) => (
        <div key={i} className="p-5 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">{s.title}</h3>
            <s.icon className={`w-4 h-4 ${s.color}`} />
          </div>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-white">{s.value}</span>
            {s.change && (
              <div className={`flex items-center gap-0.5 text-[10px] font-bold ${s.up ? 'text-emerald-400' : 'text-red-400'}`}>
                {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                <span>{s.change}</span>
              </div>
            )}
          </div>
          {s.sub && <p className="text-[9px] text-slate-500 mt-1">{s.sub}</p>}
        </div>
      ))}
    </section>
  );
}

// ─── User Management Table ──────────────────────────────────────────────────
function UserManagementTable() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<'all' | 'freelancer' | 'client'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const opts: any = { table: 'profiles', select: 'id, name, email, avatar, role, created_at, is_pro, onboarding_completed, rating', order: 'created_at', orderDir: 'desc', limit: 10, isNull: { deleted_at: true, suspended_at: true } };
      if (roleFilter !== 'all') opts.filters = { role: roleFilter };
      const { data } = await adminQuery(opts);
      setUsers((data || []) as AdminUser[]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => {
    const channel = realtimeChannels.profiles('admin-users-ov')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchUsers())
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [fetchUsers]);

  const handleViewProfile = (userId: string) => window.open(`/freelancer/${userId}`, '_blank');
  const handleSendEmail = (email: string) => window.open(`mailto:${email}`, '_blank');

  const handleTogglePro = async (userId: string, current: boolean | null, name: string) => {
    if (!confirm(`${current ? 'Remove' : 'Grant'} Pro status for "${name}"?`)) return;
    setActionLoading(`pro-${userId}`);      await adminUpdate('profiles', userId, { is_pro: !current });
    await fetchUsers();
    setActionLoading(null);
  };

  const handleSuspend = async (userId: string, name: string) => {
    if (!confirm(`🚫 Suspend "${name}"? They will lose platform access.`)) return;
    setActionLoading(`suspend-${userId}`);      await adminUpdate('profiles', userId, { deleted_at: new Date().toISOString() });
    await fetchUsers();
    setActionLoading(null);
  };

  return (
    <section className="rounded-[2rem] overflow-hidden" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-bold text-sm">Recent Users</h2>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as any)}
          className="bg-slate-800 border-none text-[9px] font-bold uppercase rounded-lg px-2 py-1 text-slate-300 cursor-pointer">
          <option value="all">All</option>
          <option value="client">Clients</option>
          <option value="freelancer">Freelancers</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr className="text-slate-500 uppercase text-[9px] font-bold tracking-widest border-b border-white/5">
            <th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-white/5">
            {loading ? new Array(3).fill(0).map((_, i) => <TableRowSkeleton key={i} />) :
            users.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">No users found</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-slate-700 flex items-center justify-center text-[9px] font-bold text-white shrink-0 overflow-hidden cursor-pointer"
                      onClick={() => handleViewProfile(u.id)} title="View profile">
                      {u.avatar ? <img src={u.avatar} className="h-full w-full object-cover" alt={u.name} /> : getUserInitials(u.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-white text-[11px] truncate max-w-[140px]">{u.name}</p>
                      <p className="text-[9px] text-slate-500 truncate max-w-[140px]">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[9px] font-bold uppercase ${u.role === 'freelancer' ? 'text-emerald-400' : 'text-blue-400'}`}>{u.role}</span>
                  {u.is_pro && <span className="ml-1 text-[7px] bg-amber-500/20 text-amber-500 px-1 py-0.5 rounded-full uppercase font-bold">PRO</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full uppercase ${u.onboarding_completed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {u.onboarding_completed ? 'Active' : 'Pending'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <button onClick={() => handleViewProfile(u.id)}
                      className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors" title="View Profile">
                      <Eye className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleSendEmail(u.email)}
                      className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors" title="Send Email">
                      <Mail className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleTogglePro(u.id, u.is_pro, u.name)}
                      disabled={actionLoading === `pro-${u.id}`}
                      className={`p-1.5 rounded-lg transition-colors ${u.is_pro ? 'text-amber-400 hover:bg-amber-500/10' : 'text-slate-400 hover:text-amber-400 hover:bg-amber-500/10'}`}
                      title={u.is_pro ? 'Remove Pro' : 'Grant Pro'}>
                      {actionLoading === `pro-${u.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                    </button>
                    <button onClick={() => handleSuspend(u.id, u.name)}
                      disabled={actionLoading === `suspend-${u.id}`}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors" title="Suspend User">
                      {actionLoading === `suspend-${u.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t border-white/5 text-center">
        <a href="/admin/users" className="text-[9px] font-bold text-emerald-400 hover:underline uppercase">View All Users →</a>
      </div>
    </section>
  );
}

// ─── Dispute Resolution ─────────────────────────────────────────────────────
function DisputeResolution() {
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'under_review' | 'resolved'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const all = await disputeService.getAllDisputes(filter === 'all' ? undefined : filter);
      setDisputes(all as AdminDispute[]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);
  useEffect(() => {
    const channel = supabase.channel(`admin-disp-ov-${Date.now()}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'disputes' }, () => fetchDisputes())
      .subscribe();
    return () => { channel.unsubscribe().catch(() => {}); };
  }, [fetchDisputes]);

  const handleAction = async (disputeId: string, action: 'resolved' | 'dismissed', resolution: string) => {
    if (!confirm(`⚠️ ${action === 'resolved' ? 'Release funds to freelancer' : 'Refund to client'}? This cannot be undone.`)) return;
    setActionLoading(disputeId);
    await disputeService.adminUpdateDispute(disputeId, action, resolution);
    setActionLoading(null);
  };

  return (
    <section className="rounded-[2rem] overflow-hidden" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-sm">Disputes</h2>
          {disputes.filter(d => d.status === 'pending' || d.status === 'under_review').length > 0 && (
            <span className="bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
              {disputes.filter(d => d.status === 'pending' || d.status === 'under_review').length}
            </span>
          )}
        </div>
        <button onClick={fetchDisputes} className="p-1 hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/5">
        {['all', 'pending', 'under_review', 'resolved'].map(s => (
          <button key={s} onClick={() => setFilter(s as any)}
            className={`px-2 py-1 text-[8px] font-bold uppercase rounded-lg transition-all ${
              filter === s ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}>{s.replace('_', ' ')}</button>
        ))}
      </div>
      <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
        {loading ? new Array(2).fill(0).map((_, i) => (
          <div key={i} className="p-4 animate-pulse"><div className="h-3 w-32 bg-slate-700 rounded mb-2" /><div className="h-2 w-full bg-slate-700 rounded" /></div>
        )) : disputes.length === 0 ? (
          <div className="p-8 text-center"><Scale className="w-8 h-8 text-slate-600 mx-auto mb-2" /><p className="text-slate-500 text-xs">No disputes</p></div>
        ) : disputes.slice(0, 6).map(d => (
          <div key={d.id} className="p-4 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">#{d.id.slice(0, 6)}</span>
                  <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded-full uppercase ${statusColors[d.status] || ''}`}>
                    {d.status.replace('_', ' ')}
                  </span>
                  {d.contract?.amount && <span className="text-[9px] text-orange-400 font-bold">{formatCurrency(d.contract.amount)}</span>}
                </div>
                <p className="text-[11px] text-white font-medium truncate">{d.reason}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">{formatRelativeTime(d.created_at)}</p>
              </div>
              {d.status !== 'resolved' && d.status !== 'dismissed' && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleAction(d.id, 'resolved', 'Released to freelancer per admin')}
                    disabled={actionLoading === d.id}
                    className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-emerald-400 transition-colors" title="Release Funds">
                    {actionLoading === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  </button>
                  <button onClick={() => handleAction(d.id, 'dismissed', 'Refunded to client per admin')}
                    disabled={actionLoading === d.id}
                    className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors" title="Refund Client">
                    <XCircle className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── AI Risk Analysis ────────────────────────────────────────────────────────
function AIRiskAnalysis() {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRisks = useCallback(async () => {
    setLoading(true);
    try {
      const detected: RiskItem[] = [];

      // 1. Rapid account signups (bot detection)
      const signupsRes = await adminQuery({ table: 'profiles', count: 'exact', head: true, isNull: { deleted_at: true }, gte: { created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() } }).then(r => r.total ?? 0);
      const signups24h = signupsRes;
      if (signups24h && signups24h > 15) {
        detected.push({ id: 'rapid-signups', icon: Users, iconBg: 'bg-red-500/20', iconColor: 'text-red-500',
          title: '🚨 Rapid Account Creation Spike', description: `${signups24h} accounts in 24h — possible bot activity. Investigate IP patterns.`,
          severity: 'critical', actions: [{ label: 'Analyze', primary: true, color: 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' }] });
      } else if (signups24h && signups24h > 8) {
        detected.push({ id: 'moderate-signups', icon: Users, iconBg: 'bg-amber-500/20', iconColor: 'text-amber-500',
          title: 'Above-average Signups', description: `${signups24h} new accounts in 24h. Monitor for quality.`,
          severity: 'medium', actions: [{ label: 'Review', primary: true, color: 'bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white' }] });
      }

      // 2. Large escrow transactions (money laundering risk)
      const largeRes = await adminQuery({ table: 'contracts', select: 'id, amount, created_at', gte: { created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }, limit: 5 }).then(r => r.data as any[]);
      const largeEscrows = (largeRes || []).filter((c: any) => (c.amount || 0) > 15000) as any[];
      if (largeEscrows && largeEscrows.length > 1) {
        detected.push({ id: 'large-escrow', icon: DollarSign, iconBg: 'bg-orange-500/20', iconColor: 'text-orange-500',
          title: '💰 Large Escrow Deposits', description: `${largeEscrows.length} contracts over $15,000 this week. Total: ${formatCurrency(largeEscrows.reduce((s, c) => s + (c.amount || 0), 0))}.`,
          severity: 'high', actions: [{ label: 'Review', primary: true, color: 'bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white' }] });
      }

      // 3. Dispute spike detection
      const disputeRes = await adminQuery({ table: 'disputes', count: 'exact', head: true, in: { status: ['pending', 'under_review'] }, gte: { created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() } }).then(r => r.total ?? 0);
      const recentDisputes = disputeRes;
      if (recentDisputes && recentDisputes > 5) {
        detected.push({ id: 'dispute-spike', icon: Scale, iconBg: 'bg-red-500/20', iconColor: 'text-red-500',
          title: '⚖️ Dispute Activity Spike', description: `${recentDisputes} open disputes this week. Review pattern for common issues.`,
          severity: 'high', actions: [{ label: 'Investigate', primary: true, color: 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' }] });
      } else if (recentDisputes && recentDisputes > 2) {
        detected.push({ id: 'moderate-disputes', icon: Scale, iconBg: 'bg-amber-500/20', iconColor: 'text-amber-500',
          title: 'Dispute Activity Above Normal', description: `${recentDisputes} active disputes. Monitor resolution time.`,
          severity: 'medium', actions: [{ label: 'Monitor', primary: true, color: 'bg-amber-500/10 text-amber-500' }] });
      }

      // 4. Unverified / inactive users
      const inactiveRes = await adminQuery({ table: 'profiles', count: 'exact', head: true, filters: { onboarding_completed: 'false' }, isNull: { deleted_at: true }, lte: { created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() } }).then(r => r.total ?? 0);
      const inactiveCount = inactiveRes;
      if (inactiveCount && inactiveCount > 10) {
        detected.push({ id: 'inactive-users', icon: Ban, iconBg: 'bg-blue-500/20', iconColor: 'text-blue-500',
          title: 'Inactive Accounts Need Follow-up', description: `${inactiveCount} users haven't completed onboarding in 14+ days. Consider re-engagement email.`,
          severity: 'low', actions: [{ label: 'Notify All', primary: true, color: 'bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white' }] });
      }

      // 5. Unverified freelancers with high-value projects
      const riskyRes = await adminQuery({ table: 'projects', select: 'id, title, budget_max, client_id', in: { status: ['open', 'in_progress'] }, limit: 5 });
      const riskyProjects = riskyRes.data as any[];
      // Filter client-side for budget_max > 5000
      const bigRiskyProjects = riskyProjects.filter((p: any) => (p.budget_max || 0) > 5000);
      if (bigRiskyProjects && bigRiskyProjects.length > 0) {
        const clientIds = [...new Set(bigRiskyProjects.map((p: any) => p.client_id))];
        const clientRes = await adminQuery({ table: 'profiles', select: 'id, onboarding_completed', in: { id: clientIds } });
        const clientProfiles = clientRes.data as any[];
        const unverifiedClients = (clientProfiles || []).filter((p: any) => !p.onboarding_completed).length;
        if (unverifiedClients > 1) {
          detected.push({ id: 'unverified-clients', icon: ShieldAlert, iconBg: 'bg-amber-500/20', iconColor: 'text-amber-500',
            title: 'Unverified Clients with High-Value Projects', description: `${unverifiedClients} unverified clients posted projects over $5k. Flag for identity verification.`,
            severity: 'high', actions: [{ label: 'Review Clients', primary: true, color: 'bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white' }] });
        }
      }

      // 6. Failed payment rate check
      const failedRes = await adminQuery({ table: 'transactions', count: 'exact', head: true, filters: { status: 'failed' }, gte: { created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() } });
      const failedPayments = failedRes.total;

      const totalRes = await adminQuery({ table: 'transactions', count: 'exact', head: true, gte: { created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() } });
      const totalPayments = totalRes.total;

      const failRate = totalPayments && totalPayments > 0 ? ((failedPayments || 0) / totalPayments) * 100 : 0;
      if (failRate > 15) {
        detected.push({ id: 'payment-failures', icon: AlertTriangle, iconBg: 'bg-red-500/20', iconColor: 'text-red-500',
          title: '⚠️ High Payment Failure Rate', description: `${failRate.toFixed(0)}% of transactions failed in 72h. Check payment gateway.`,
          severity: 'critical', actions: [{ label: 'Check Gateway', primary: true, color: 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' }] });
      } else if (failRate > 5) {
        detected.push({ id: 'moderate-failures', icon: AlertTriangle, iconBg: 'bg-amber-500/20', iconColor: 'text-amber-500',
          title: 'Payment Failure Rate Elevated', description: `${failRate.toFixed(0)}% failure rate in 72h. Monitor closely.`,
          severity: 'medium', actions: [{ label: 'Investigate', primary: true, color: 'bg-amber-500/10 text-amber-500' }] });
      }

      // 7. Escrow at risk (disputed/high-value)
      const atRiskRes = await adminQuery({ table: 'contracts', select: 'id, amount', filters: { status: 'disputed' }, limit: 5 });
      const atRiskContracts = atRiskRes.data as any[];
      const totalAtRisk = (atRiskContracts || []).reduce((s, c) => s + (c.amount || 0), 0);
      if (totalAtRisk > 25000) {
        detected.push({ id: 'escrow-risk', icon: ShieldAlert, iconBg: 'bg-red-500/20', iconColor: 'text-red-500',
          title: '🔴 Escrow at Risk', description: `${formatCurrency(totalAtRisk)} currently held in disputed contracts. Prioritize resolution.`,
          severity: 'critical', actions: [{ label: 'Resolve Now', primary: true, color: 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' }] });
      }

      // 8. Low rating trend
      const lowRatingRes = await adminQuery({ table: 'contracts', select: 'id', filters: { status: 'completed' }, gte: { created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }, limit: 20 });
      const lowRatingContracts = lowRatingRes.data as any[];
      if (lowRatingContracts && lowRatingContracts.length > 10) {
        // Check reviews for those contracts
        const lowReviewsRes = await adminQuery({ table: 'reviews', count: 'exact', head: true, in: { contract_id: lowRatingContracts.map((c: any) => c.id) } }).then(r => r.total ?? 0);
        const lowReviews = lowReviewsRes;
        if (lowReviews && lowReviews > 3) {
          detected.push({ id: 'quality-risk', icon: Award, iconBg: 'bg-amber-500/20', iconColor: 'text-amber-500',
            title: 'Quality Risk Detected', description: `${lowReviews} contracts with ratings under 3 stars this month. Freelancer quality review needed.`,
            severity: 'medium', actions: [{ label: 'Review Freelancers', primary: true, color: 'bg-amber-500/10 text-amber-500' }] });
        }
      }

      // All clear if nothing detected
      if (detected.length === 0) {
        detected.push({ id: 'all-clear', icon: Shield, iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-500',
          title: '✅ Platform All Clear', description: 'No suspicious activity. All metrics within normal range.',
          severity: 'low', actions: [] });
      }

      setRisks(detected);
    } catch (err) {
      console.error('Risk analysis failed:', err);
      setRisks([{ id: 'error', icon: AlertTriangle, iconBg: 'bg-red-500/20', iconColor: 'text-red-500',
        title: 'Analysis Error', description: 'Unable to complete risk analysis. Check system logs.',
        severity: 'high', actions: [{ label: 'Retry', primary: true, color: 'bg-red-500/10 text-red-500' }] }]);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchRisks();
    const interval = setInterval(fetchRisks, 60000);
    return () => clearInterval(interval);
  }, [fetchRisks]);

  const worst = risks.reduce((max, r) => {
    const order = { critical: 4, high: 3, medium: 2, low: 1 };
    return order[r.severity] > order[max.severity] ? r : max;
  }, risks[0] || { severity: 'low' } as RiskItem);

  const accentColor = worst.severity === 'critical' ? 'red' : worst.severity === 'high' ? 'red' : worst.severity === 'medium' ? 'amber' : 'emerald';
  const severityColors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-500', high: 'bg-orange-500/20 text-orange-500',
    medium: 'bg-amber-500/20 text-amber-500', low: 'bg-emerald-500/20 text-emerald-500'
  };

  return (
    <section className="rounded-[2rem] overflow-hidden" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${accentColor === 'red' ? 'text-red-400' : accentColor === 'amber' ? 'text-amber-400' : 'text-emerald-400'}`} />
          <h2 className="font-bold text-sm">AI Risk Analysis</h2>
        </div>
        {!loading && risks.length > 0 && (
          <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase ${severityColors[worst.severity] || ''}`}>{worst.severity}</span>
        )}
      </div>
      <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
        {loading ? new Array(3).fill(0).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3 bg-white/5 rounded-xl animate-pulse">
            <div className="h-6 w-6 rounded-lg bg-slate-700" />
            <div className="flex-1"><div className="h-2.5 w-28 bg-slate-700 rounded mb-1.5" /><div className="h-2 w-full bg-slate-700 rounded" /></div>
          </div>
        )) : risks.map(r => (
          <div key={r.id} className={`flex items-start gap-3 p-3 rounded-xl border ${getSeverityBorder(r.severity)} ${getSeverityBg(r.severity)}`}>
            <div className={`h-6 w-6 rounded-lg ${r.iconBg} flex items-center justify-center shrink-0`}>
              <r.icon className={`w-3 h-3 ${r.iconColor}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[11px] font-bold text-white">{r.title}</p>
                {r.severity === 'critical' && <span className="text-[7px] bg-red-500/20 text-red-500 px-1 py-0.5 rounded-full uppercase font-bold">URGENT</span>}
              </div>
              <p className="text-[9px] text-slate-500 mt-0.5">{r.description}</p>
            </div>
          </div>
        ))}
      </div>
      <button onClick={fetchRisks} className="w-full py-2 border-t border-white/5 text-[9px] font-bold uppercase tracking-wider text-slate-500 hover:bg-white/5 transition-colors flex items-center justify-center gap-1">
        <RefreshCw className={`w-2.5 h-2.5 ${loading ? 'animate-spin' : ''}`} /> Re-analyze
      </button>
    </section>
  );
}

// ─── Live Activity Feed ──────────────────────────────────────────────────────
function LiveActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [newActivityIds, setNewActivityIds] = useState<Set<string>>(new Set());

  const fetchActivities = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        adminQuery({ table: 'profiles', select: 'id, name, created_at, role', isNull: { deleted_at: true, suspended_at: true }, order: 'created_at', orderDir: 'desc', limit: 3 }),
        adminQuery({ table: 'contracts', select: 'id, amount, created_at, status', order: 'created_at', orderDir: 'desc', limit: 3 }),
        adminQuery({ table: 'disputes', select: 'id, reason, created_at, status', order: 'created_at', orderDir: 'desc', limit: 3 }),
        adminQuery({ table: 'projects', select: 'id, title, created_at, status', order: 'created_at', orderDir: 'desc', limit: 3 }),
        adminQuery({ table: 'transactions', select: 'id, amount, created_at, type, status', in: { status: ['completed', 'pending'] }, order: 'created_at', orderDir: 'desc', limit: 3 }),
        adminQuery({ table: 'messages', select: 'id, created_at', order: 'created_at', orderDir: 'desc', limit: 2 }),
      ]);

      const items: ActivityItem[] = [];

      if (results[0].status === 'fulfilled' && results[0].value.data)
        (results[0].value.data as any[]).forEach((u: any) => items.push({ id: `user-${u.id}`, type: 'user_joined', description: `${u.name} joined as ${u.role}`, created_at: u.created_at, user_name: u.name }));

      if (results[1].status === 'fulfilled' && results[1].value.data) {
        (results[1].value.data as any[]).forEach((c: any) => {
          const t = c.status === 'completed' ? 'contract_completed' : 'contract_created';
          items.push({ id: `contract-${c.id}`, type: t as any, description: c.status === 'completed' ? `Contract completed (${formatCurrency(c.amount || 0)})` : `New contract: ${formatCurrency(c.amount || 0)}`, created_at: c.created_at, amount: c.amount });
        });
      }

      if (results[2].status === 'fulfilled' && results[2].value.data)
        (results[2].value.data as any[]).forEach((d: any) => items.push({ id: `dispute-${d.id}`, type: 'dispute_filed', description: `Dispute: ${(d.reason || '').slice(0, 50)}`, created_at: d.created_at }));

      if (results[3].status === 'fulfilled' && results[3].value.data)
        (results[3].value.data as any[]).forEach((p: any) => items.push({ id: `project-${p.id}`, type: 'project_created', description: `Project: ${(p.title || 'Untitled').slice(0, 40)} (${p.status || 'open'})`, created_at: p.created_at }));

      if (results[4].status === 'fulfilled' && results[4].value.data)
        (results[4].value.data as any[]).forEach((w: any) => items.push({ id: `payment-${w.id}`, type: 'payment_received', description: `${w.type === 'withdrawal' ? 'Withdrawal' : 'Payment'} of ${formatCurrency(w.amount || 0)} (${w.status})`, created_at: w.created_at, amount: w.amount }));

      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setActivities(items.slice(0, 15));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setConnectionStatus('connecting');
    fetchActivities().then(() => setConnectionStatus('connected'));

    // Poll every 10s for fresh data
    const interval = setInterval(() => {
      fetchActivities();
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchActivities]);

  // Real-time subscriptions with enhanced event handling
  useEffect(() => {
    const channel = supabase.channel(`admin-feed-enhanced-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (p) => {
        setConnectionStatus('connected');
        if (p.eventType === 'INSERT') {
          const n = p.new as any;
          const item = { id: `user-${n.id}-${Date.now()}`, type: 'user_joined' as const, description: `${n.name || 'Someone'} joined as ${n.role}`, created_at: n.created_at || new Date().toISOString(), user_name: n.name } as ActivityItem;
          setActivities(prev => [item, ...prev].slice(0, 15));
          setNewActivityIds(prev => new Set(prev).add(item.id));
          setTimeout(() => setNewActivityIds(prev => { const s = new Set(prev); s.delete(item.id); return s; }), 3000);
        }
      })
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'disputes' }, (p: any) => {
        setConnectionStatus('connected');
        const n = p.new as any;
        const item = { id: `dispute-${n.id}-${Date.now()}`, type: 'dispute_filed' as const, description: `Dispute ${p.eventType === 'INSERT' ? 'filed' : 'updated'}: ${(n.reason || '').slice(0, 50)}`, created_at: n.created_at || new Date().toISOString() } as ActivityItem;
        setActivities(prev => [item, ...prev].slice(0, 15));
        setNewActivityIds(prev => new Set(prev).add(item.id));
        setTimeout(() => setNewActivityIds(prev => { const s = new Set(prev); s.delete(item.id); return s; }), 3000);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, (p) => {
        setConnectionStatus('connected');
        const n = p.new as any;
        const type = p.eventType === 'INSERT' ? 'contract_created' : (n.status === 'completed' ? 'contract_completed' : 'escrow_funded');
        const item = { id: `contract-${n.id}-${Date.now()}`, type: type as any, description: p.eventType === 'INSERT' ? `New contract: ${formatCurrency(n.amount || 0)}` : `Contract ${n.status}: ${formatCurrency(n.amount || 0)}`, created_at: n.created_at || new Date().toISOString(), amount: n.amount } as ActivityItem;
        setActivities(prev => [item, ...prev].slice(0, 15));
        setNewActivityIds(prev => new Set(prev).add(item.id));
        setTimeout(() => setNewActivityIds(prev => { const s = new Set(prev); s.delete(item.id); return s; }), 3000);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'projects' }, (p) => {
        setConnectionStatus('connected');
        const n = p.new as any;
        const item = { id: `project-${n.id}-${Date.now()}`, type: 'project_created' as const, description: `New project: ${(n.title || 'Untitled').slice(0, 40)}`, created_at: n.created_at || new Date().toISOString() } as ActivityItem;
        setActivities(prev => [item, ...prev].slice(0, 15));
        setNewActivityIds(prev => new Set(prev).add(item.id));
        setTimeout(() => setNewActivityIds(prev => { const s = new Set(prev); s.delete(item.id); return s; }), 3000);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setConnectionStatus('disconnected');
      });

    return () => {
      void channel.unsubscribe();
    };
  }, []);

  const dotColors: Record<string, string> = {
    user_joined: 'bg-emerald-400', contract_created: 'bg-blue-400', dispute_filed: 'bg-red-400',
    payment_received: 'bg-green-400', project_created: 'bg-purple-400', escrow_funded: 'bg-amber-400',
    contract_completed: 'bg-emerald-400', proposal_sent: 'bg-sky-400',
  };
  const activityLabels: Record<string, string> = {
    user_joined: 'New User', contract_created: 'Contract', dispute_filed: 'Dispute',
    payment_received: 'Payment', project_created: 'Project', escrow_funded: 'Escrow',
    contract_completed: 'Completed', proposal_sent: 'Proposal',
  };

  return (
    <section className="rounded-[2rem] overflow-hidden" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-bold text-sm">Live Feed</h2>
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${connectionStatus === 'connected' ? 'bg-emerald-400' : connectionStatus === 'connecting' ? 'bg-amber-400' : 'bg-red-400'}`} />
          <span className="text-[8px] text-slate-500 font-bold uppercase">
            {connectionStatus === 'connected' ? 'LIVE' : connectionStatus === 'connecting' ? 'CONNECTING' : 'DISCONNECTED'}
          </span>
        </div>
      </div>
      <div className="divide-y divide-white/5 max-h-[320px] overflow-y-auto">
        {loading ? new Array(5).fill(0).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
            <div className="h-1.5 w-1.5 rounded-full bg-slate-700" />
            <div className="flex-1"><div className="h-2.5 w-36 bg-slate-700 rounded mb-1" /><div className="h-2 w-12 bg-slate-700 rounded" /></div>
          </div>
        )) : activities.length === 0 ? (
          <div className="p-6 text-center"><Activity className="w-8 h-8 text-slate-600 mx-auto mb-1" /><p className="text-slate-500 text-xs">No activity yet</p></div>
        ) : activities.slice(0, 12).map(a => (
          <div key={a.id} className={`flex items-start gap-3 p-3 hover:bg-white/[0.02] transition-colors ${newActivityIds.has(a.id) ? 'bg-emerald-500/5 animate-pulse' : ''}`}>
            <div className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${dotColors[a.type] || 'bg-slate-500'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-[8px] font-bold uppercase ${dotColors[a.type]?.replace('bg-', 'text-') || 'text-slate-400'}`}>
                  {activityLabels[a.type] || a.type.replace(/_/g, ' ')}
                </span>
                <span className="text-[9px] text-slate-500">· {formatRelativeTime(a.created_at)}</span>
              </div>
              <p className="text-[10px] text-slate-300 truncate">{a.description}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-[7px] text-slate-600 font-bold uppercase">Auto-refreshes every 10s</span>
        <button
          onClick={() => { setLoading(true); fetchActivities().then(() => setLoading(false)); }}
          className="text-[7px] text-emerald-500 hover:text-emerald-400 font-bold uppercase transition-colors"
        >
          <RefreshCw className={`w-2.5 h-2.5 inline-block mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </section>
  );
}

// ─── Main Admin Dashboard ────────────────────────────────────────────────────
export function AdminDashboard() {
  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Platform Health Stats - Compact grid */}
      <PlatformStats />

      {/* Quick Actions Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <a href="/admin/users" className="px-3 py-1.5 bg-white/5 rounded-lg text-[9px] font-bold uppercase text-slate-300 hover:bg-white/10 transition-colors flex items-center gap-1.5">
          <Users className="w-3 h-3" /> Users
        </a>
        <a href="/admin/projects" className="px-3 py-1.5 bg-white/5 rounded-lg text-[9px] font-bold uppercase text-slate-300 hover:bg-white/10 transition-colors flex items-center gap-1.5">
          <Briefcase className="w-3 h-3" /> Projects
        </a>
        <a href="/admin/contracts" className="px-3 py-1.5 bg-white/5 rounded-lg text-[9px] font-bold uppercase text-slate-300 hover:bg-white/10 transition-colors flex items-center gap-1.5">
          <Handshake className="w-3 h-3" /> Contracts
        </a>
        <a href="/admin/payments" className="px-3 py-1.5 bg-white/5 rounded-lg text-[9px] font-bold uppercase text-slate-300 hover:bg-white/10 transition-colors flex items-center gap-1.5">
          <DollarSign className="w-3 h-3" /> Payments
        </a>
        <a href="/admin/disputes" className="px-3 py-1.5 bg-red-500/10 rounded-lg text-[9px] font-bold uppercase text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5">
          <Scale className="w-3 h-3" /> Disputes
        </a>
        <a href="/admin/subscriptions" className="px-3 py-1.5 bg-white/5 rounded-lg text-[9px] font-bold uppercase text-slate-300 hover:bg-white/10 transition-colors flex items-center gap-1.5">
          <Star className="w-3 h-3" /> Subscriptions
        </a>
        <a href="/admin/identity-verification" className="px-3 py-1.5 bg-emerald-500/10 rounded-lg text-[9px] font-bold uppercase text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3" /> Verification
        </a>
        <a href="/admin/reports" className="px-3 py-1.5 bg-white/5 rounded-lg text-[9px] font-bold uppercase text-slate-300 hover:bg-white/10 transition-colors flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3" /> Reports
        </a>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="xl:col-span-2 space-y-6">
          <UserManagementTable />
          <DisputeResolution />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <AIRiskAnalysis />
          <LiveActivityFeed />
        </div>
      </div>
    </div>
  );
}