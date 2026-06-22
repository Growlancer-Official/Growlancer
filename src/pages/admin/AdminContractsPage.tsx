import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Eye, Loader2, RefreshCw, Search, DollarSign,
  CheckCircle, XCircle, Lock, Unlock
} from 'lucide-react';
import { supabase, realtimeChannels } from '../../lib/supabase';

interface AdminContract {
  id: string; amount: number; platform_fee: number; status: string;
  escrow_funded: boolean; created_at: string;
  freelancer_id: string; client_id: string;
  freelancer?: { name: string; email: string } | null;
  client?: { name: string; email: string } | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  return new Date(dateStr).toLocaleDateString();
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400',
  active: 'bg-emerald-500/10 text-emerald-400',
  completed: 'bg-blue-500/10 text-blue-400',
  cancelled: 'bg-red-500/10 text-red-400',
  disputed: 'bg-orange-500/10 text-orange-400',
};

export function AdminContractsPage() {
  const [contracts, setContracts] = useState<AdminContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      let query = (supabase.from('contracts') as any)
        .select('id, amount, platform_fee, status, escrow_funded, created_at, freelancer_id, client_id')
        .order('created_at', { ascending: false }).limit(100);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;

      const cons = (data || []) as AdminContract[];
      const userIds = [...new Set(cons.flatMap(c => [c.freelancer_id, c.client_id]))];
      const { data: profiles } = await supabase.from('profiles').select('id, name, email').in('id', userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, { name: p.name, email: p.email }]));

      setContracts(cons.map(c => ({
        ...c,
        freelancer: profileMap.get(c.freelancer_id) || null,
        client: profileMap.get(c.client_id) || null,
      })));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);
  useEffect(() => {
    const channel = realtimeChannels.contracts(`admin-contracts-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contracts' }, () => fetchContracts())
      .subscribe();
    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [fetchContracts]);

  const handleUpdateStatus = async (contractId: string, status: string) => {
    if (!confirm(`Update contract status to "${status}"?`)) return;
    setActionLoading(`${contractId}-${status}`);
    try {
      await supabase.from('contracts').update({ status, updated_at: new Date().toISOString() }).eq('id', contractId);
      await fetchContracts();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  };

  const handleToggleEscrow = async (contractId: string, currentlyFunded: boolean) => {
    if (!confirm(`${currentlyFunded ? 'Mark escrow as pending' : 'Mark escrow as funded'} for this contract?`)) return;
    setActionLoading(`escrow-${contractId}`);
    try {
      await supabase.from('contracts').update({ escrow_funded: !currentlyFunded, updated_at: new Date().toISOString() }).eq('id', contractId);
      await fetchContracts();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  };

  const totalVolume = contracts.reduce((s, c) => s + (c.amount || 0), 0);
  const totalFees = contracts.reduce((s, c) => s + (c.platform_fee || 0), 0);
  const escrowFunded = contracts.filter(c => c.escrow_funded).length;
  const disputed = contracts.filter(c => c.status === 'disputed').length;

  const filtered = contracts.filter(c => c.id.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-white">Contracts</h1>
        <p className="text-slate-400 text-sm mt-1">Monitor, manage, and release escrow for all contracts</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: contracts.length, color: 'text-slate-100' },
          { label: 'Volume', value: formatCurrency(totalVolume), color: 'text-emerald-400' },
          { label: 'Fees Earned', value: formatCurrency(totalFees), color: 'text-blue-400' },
          { label: 'Escrow Funded', value: escrowFunded, color: 'text-emerald-400' },
          { label: 'Disputed', value: disputed, color: disputed > 0 ? 'text-red-400' : 'text-slate-400' },
        ].map((stat, i) => (
          <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '1rem' }}
        className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by contract ID..." className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="disputed">Disputed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button onClick={fetchContracts}
          className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="rounded-[2rem] overflow-hidden" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-white/5">
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Freelancer</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Fee</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Escrow</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-500 text-xs">No contracts found</td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono">{c.id.slice(0, 8)}...</td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-300">{c.freelancer?.name || 'Unknown'}</p>
                      <p className="text-[10px] text-slate-500">{c.freelancer?.email || ''}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-300">{c.client?.name || 'Unknown'}</p>
                      <p className="text-[10px] text-slate-500">{c.client?.email || ''}</p>
                    </td>
                    <td className="px-6 py-4 text-xs text-emerald-400 font-bold">{formatCurrency(c.amount)}</td>
                    <td className="px-6 py-4 text-xs text-blue-400">{formatCurrency(c.platform_fee)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${statusColors[c.status] || 'text-slate-400'}`}>{c.status}</span>
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => handleToggleEscrow(c.id, c.escrow_funded)}
                        disabled={actionLoading === `escrow-${c.id}`}
                        className={`text-[10px] font-bold flex items-center gap-1 ${c.escrow_funded ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-slate-400'}`}>
                        {actionLoading === `escrow-${c.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : c.escrow_funded ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        {c.escrow_funded ? 'Funded' : 'Pending'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-[10px] text-slate-500">{formatRelativeTime(c.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(c.status === 'active' || c.status === 'pending') && (
                          <button onClick={() => handleUpdateStatus(c.id, 'completed')}
                            disabled={actionLoading === `${c.id}-completed`}
                            className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-emerald-400 transition-colors" title="Mark Completed">
                            {actionLoading === `${c.id}-completed` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {(c.status === 'active' || c.status === 'pending') && (
                          <button onClick={() => handleUpdateStatus(c.id, 'cancelled')}
                            disabled={actionLoading === `${c.id}-cancelled`}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors" title="Cancel Contract">
                            {actionLoading === `${c.id}-cancelled` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          </button>
                        )}
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
