import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Eye,
  Loader2,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Search,
  Star,
  Users,
  ExternalLink,
  UserCheck,
  UserX,
  Shield,
  Send,
  Ban,
  MessageSquare,
  X,
  ChevronDown,
} from 'lucide-react';
import { supabase, realtimeChannels } from '../../lib/supabase';
import type { UserRole } from '../../types/auth';

interface AdminUser {                  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar: string | null;
  created_at: string;
  is_pro: boolean | null;
  onboarding_completed: boolean | null;
  referral_code: string | null;
  suspended_at: string | null;
  suspend_reason: string | null;
  deleted_at: string | null;
}

function getUserInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'freelancer' | 'client' | 'admin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'pro'>('all');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('profiles')
        .select('id, email, name, role, avatar, created_at, is_pro, onboarding_completed, referral_code, suspended_at, suspend_reason, deleted_at')
        .is('deleted_at', null)
        .is('suspended_at', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (roleFilter !== 'all') query = query.eq('role', roleFilter);
      if (statusFilter === 'active') query = query.eq('onboarding_completed', true);
      if (statusFilter === 'pending') query = query.eq('onboarding_completed', false);
      if (statusFilter === 'pro') query = query.eq('is_pro', true);

      const { data, error } = await query;
      if (error) throw error;
      setUsers((data || []) as AdminUser[]);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, statusFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Real-time subscription
  useEffect(() => {
    const channel = realtimeChannels.profiles(`admin-users-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchUsers())
      .subscribe();
    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [fetchUsers]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ─── ACTIONS ─────────────────────────────────────────────────────

  const handleVerifyUser = async (userId: string, userName: string) => {
    if (!confirm(`✅ Verify "${userName}"? They will be marked as an active user.`)) return;
    setActionLoading(`verify-${userId}`);
    try {
      await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', userId);
      await fetchUsers();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); setOpenDropdown(null); }
  };

  const handleTogglePro = async (userId: string, currentPro: boolean | null, userName: string) => {
    if (!confirm(`${currentPro ? '🔄 Remove Pro status from' : '⭐ Grant Pro status to'} "${userName}"?`)) return;
    setActionLoading(`pro-${userId}`);
    try {
      await supabase.from('profiles').update({ is_pro: !currentPro }).eq('id', userId);
      await fetchUsers();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); setOpenDropdown(null); }
  };

  const handleMakeAdmin = async (userId: string, userName: string) => {
    if (!confirm(`⚠️ Make "${userName}" an ADMIN? This gives full platform access.`)) return;
    setActionLoading(`admin-${userId}`);
    try {
      await supabase.from('profiles').update({ role: 'admin' }).eq('id', userId);
      await fetchUsers();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); setOpenDropdown(null); }
  };

  const handleSuspendUser = async (userId: string, userName: string) => {
    const reason = prompt(`🚫 Suspend "${userName}"? Enter reason (optional):`);
    if (reason === null) return; // User cancelled prompt
    setActionLoading(`suspend-${userId}`);
    try {
      await supabase.from('profiles').update({
        suspended_at: new Date().toISOString(),
        suspend_reason: reason?.trim() || null,
        suspended_by: (await supabase.auth.getUser()).data.user?.id || null,
      }).eq('id', userId);
      await fetchUsers();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); setOpenDropdown(null); }
  };

  const handleReactivateUser = async (userId: string, userName: string) => {
    if (!confirm(`🔄 Reactivate "${userName}"? They will regain full platform access.`)) return;
    setActionLoading(`reactivate-${userId}`);
    try {
      await supabase.from('profiles').update({
        suspended_at: null,
        suspend_reason: null,
        suspended_by: null,
      }).eq('id', userId);
      await fetchUsers();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); setOpenDropdown(null); }
  };

  const handleViewProfile = (userId: string) => {
    window.open(`/freelancer/${userId}`, '_blank');
    setOpenDropdown(null);
  };

  const handleSendEmail = (email: string) => {
    window.open(`mailto:${email}`, '_blank');
    setOpenDropdown(null);
  };

  // ─── FILTERED USERS ──────────────────────────────────────────────

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: users.length,
    freelancers: users.filter(u => u.role === 'freelancer').length,
    clients: users.filter(u => u.role === 'client').length,
    admins: users.filter(u => u.role === 'admin').length,
    pro: users.filter(u => u.is_pro).length,
    active: users.filter(u => u.onboarding_completed).length,
  };

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-slate-400 text-sm mt-1">Monitor, verify, and manage all platform users</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-100' },
          { label: 'Freelancers', value: stats.freelancers, color: 'text-emerald-400' },
          { label: 'Clients', value: stats.clients, color: 'text-blue-400' },
          { label: 'Admins', value: stats.admins, color: 'text-purple-400' },
          { label: 'Pro', value: stats.pro, color: 'text-amber-400' },
          { label: 'Active', value: stats.active, color: 'text-green-400' },
        ].map((stat, i) => (
          <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
        style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '1rem' }}>
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..." className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as any)}
            className="bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer">
            <option value="all">All Roles</option>
            <option value="freelancer">Freelancers</option>
            <option value="client">Clients</option>
            <option value="admin">Admins</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
            className="bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="pro">Pro</option>
          </select>
        </div>
        <button onClick={fetchUsers}
          className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Users Table */}
      <div className="rounded-[2rem] overflow-hidden" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-white/5">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Joined</th>
                <th className="px-6 py-4">Referral</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-xs">No users found</td></tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden cursor-pointer"
                          onClick={() => handleViewProfile(user.id)}>
                          {user.avatar ? (
                            <img src={user.avatar} className="h-full w-full object-cover" alt={user.name} />
                          ) : getUserInitials(user.name)}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">{user.name}</p>
                          <p className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold uppercase ${user.role === 'freelancer' ? 'text-emerald-400' : user.role === 'client' ? 'text-blue-400' : 'text-purple-400'}`}>
                        {user.role}
                      </span>
                      {user.is_pro && <span className="ml-1 text-[8px] bg-amber-500/20 text-amber-500 px-1 py-0.5 rounded-full uppercase font-bold">PRO</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${user.onboarding_completed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {user.onboarding_completed ? 'Active' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs">{formatRelativeTime(user.created_at)}</td>
                    <td className="px-6 py-4 text-slate-500 text-[10px]">{user.referral_code || '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1" ref={openDropdown === user.id ? dropdownRef : undefined}>
                        {/* Quick Actions */}
                        <button onClick={() => handleViewProfile(user.id)}
                          className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors" title="View Profile (opens in new tab)">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleVerifyUser(user.id, user.name)}
                          disabled={actionLoading === `verify-${user.id}` || user.onboarding_completed}
                          className={`p-1.5 rounded-lg transition-colors ${user.onboarding_completed ? 'text-emerald-400 opacity-50 cursor-not-allowed' : 'text-emerald-400 hover:bg-emerald-500/10'}`}
                          title={user.onboarding_completed ? 'Already Verified' : 'Verify User'}>
                          {actionLoading === `verify-${user.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleTogglePro(user.id, user.is_pro, user.name)}
                          disabled={actionLoading === `pro-${user.id}`}
                          className={`p-1.5 rounded-lg transition-colors ${user.is_pro ? 'text-amber-400 hover:bg-amber-500/10' : 'text-slate-400 hover:text-amber-400 hover:bg-amber-500/10'}`}
                          title={user.is_pro ? 'Remove Pro Status' : 'Grant Pro Status'}>
                          {actionLoading === `pro-${user.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
                        </button>
                        {/* More Actions Dropdown */}
                        <div className="relative">
                          <button onClick={() => setOpenDropdown(openDropdown === user.id ? null : user.id)}
                            className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 transition-colors" title="More Actions">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                          {openDropdown === user.id && (
                            <div className="absolute right-0 top-full mt-1 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl z-50 min-w-[200px] py-1 animate-in fade-in slide-in-from-top-2">
                              {/* View Profile */}
                              <button onClick={() => handleViewProfile(user.id)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
                                <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                                View Public Profile
                              </button>
                              {/* Send Email */}
                              <button onClick={() => handleSendEmail(user.email)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
                                <Send className="w-3.5 h-3.5 text-emerald-400" />
                                Send Email
                              </button>
                              {/* Make Admin */}
                              {user.role !== 'admin' && (
                                <button onClick={() => handleMakeAdmin(user.id, user.name)}
                                  disabled={actionLoading === `admin-${user.id}`}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors">
                                  {actionLoading === `admin-${user.id}` ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                                  ) : (
                                    <Shield className="w-3.5 h-3.5 text-purple-400" />
                                  )}
                                  Make Admin
                                </button>
                              )}
                              {/* Divider */}
                              <div className="my-1 border-t border-slate-700/50" />
                              {user.suspended_at ? (
                                <button onClick={() => handleReactivateUser(user.id, user.name)}
                                  disabled={actionLoading === `reactivate-${user.id}`}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors">
                                  {actionLoading === `reactivate-${user.id}` ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-3.5 h-3.5" />
                                  )}
                                  Reactivate User
                                </button>
                              ) : (
                                <button onClick={() => handleSuspendUser(user.id, user.name)}
                                  disabled={actionLoading === `suspend-${user.id}`}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                                  {actionLoading === `suspend-${user.id}` ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Ban className="w-3.5 h-3.5" />
                                  )}
                                  Suspend User
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
