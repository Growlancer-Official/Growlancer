import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Scale, AlertTriangle, Loader2, RefreshCw, CheckCircle2, XCircle,
  Eye, User, DollarSign, Calendar, Shield, MessageSquare, Clock, Filter, Trash2
} from 'lucide-react';
import { adminQuery, adminUpdate, adminInsert, adminDelete } from '../../lib/adminDataProxy';
import { supabase, realtimeChannels } from '../../lib/supabase';

interface AdminDispute {
  id: string; contract_id: string; raised_by: string; raised_against: string;
  reason: string; description: string; status: string; resolution: string | null;
  created_at: string;
  contract?: { amount: number; status: string } | null;
  raiser?: { name: string } | null;
  target?: { name: string } | null;
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
  under_review: 'bg-blue-500/10 text-blue-400',
  resolved: 'bg-emerald-500/10 text-emerald-400',
  dismissed: 'bg-slate-500/10 text-slate-400',
};

function DisputeCard({ dispute, actionLoading, onAction, onDelete }: {
  dispute: AdminDispute;
  actionLoading: string | null;
  onAction: (id: string, action: 'resolved' | 'dismissed', amount?: number) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div key={dispute.id} className="p-6 rounded-[2rem]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Case #{dispute.id.slice(0, 8)}</span>
              <span className={'px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ' + (statusColors[dispute.status] || '')}>
                {dispute.status.replace('_', ' ')}
              </span>
            </div>
            <span className="text-xs font-bold text-orange-400">{dispute.contract ? formatCurrency(dispute.contract.amount) : '\u2014'} at stake</span>
          </div>
          <h3 className="text-base font-bold text-white">{dispute.reason}</h3>
          <p className="text-xs text-slate-400 line-clamp-2">{dispute.description}</p>
          <div className="flex items-center gap-4 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><User className="w-3 h-3" /> {dispute.raiser?.name || 'Unknown'}</span>
            <span>vs</span>
            <span className="flex items-center gap-1"><User className="w-3 h-3" /> {dispute.target?.name || 'Unknown'}</span>
            <span>&bull;</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatRelativeTime(dispute.created_at)}</span>
          </div>
          {dispute.resolution && (
            <div className="p-4 bg-slate-900 rounded-xl border border-white/5">
              <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Resolution</p>
              <p className="text-xs text-slate-300">{dispute.resolution}</p>
            </div>
          )}
        </div>

        {dispute.status !== 'resolved' && dispute.status !== 'dismissed' ? (
          <div className="flex flex-row lg:flex-col gap-2 w-full lg:w-48 shrink-0">
            <button onClick={() => onAction(dispute.id, 'resolved', dispute.contract?.amount)} disabled={actionLoading === dispute.id}
              className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl text-[10px] uppercase hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1">
              {actionLoading === dispute.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3" /> Release Funds</>}
            </button>
            <button onClick={() => onAction(dispute.id, 'dismissed', dispute.contract?.amount)} disabled={actionLoading === dispute.id}
              className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl text-[10px] uppercase hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1">
              {actionLoading === dispute.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><XCircle className="w-3 h-3" /> Refund Client</>}
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2 mt-2">
          <button onClick={() => onDelete(dispute.id)} disabled={actionLoading === dispute.id}
            className="px-3 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition-all flex items-center justify-center gap-1" title="Delete Dispute">
            {actionLoading === dispute.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const opts: any = {
        table: 'disputes',
        select: '*',
        order: 'created_at',
        orderDir: 'desc',
      };
      if (statusFilter !== 'all') opts.filters = { status: statusFilter };

      const { data, error } = await adminQuery(opts);
      if (error) throw error;

      const cases = (data || []) as AdminDispute[];

      const userIds = [...new Set(cases.flatMap(d => [d.raised_by, d.raised_against]))];
      const contractIds = [...new Set(cases.map(d => d.contract_id).filter(Boolean))];

      const [profilesRes, contractsRes] = await Promise.all([
        adminQuery({ table: 'profiles', select: 'id, name', in: { id: userIds } }),
        adminQuery({ table: 'contracts', select: 'id, amount, status', in: { id: contractIds } }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, { name: p.name }]));
      const contractMap = new Map((contractsRes.data || []).map(c => [c.id, { amount: c.amount, status: c.status }]));

      setDisputes(cases.map(d => ({
        ...d,
        raiser: profileMap.get(d.raised_by) || null,
        target: profileMap.get(d.raised_against) || null,
        contract: contractMap.get(d.contract_id) || null,
      })));
    } catch (err) { console.error('Failed to fetch disputes:', err); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);
  useEffect(() => {
    const channel = supabase.channel('admin-disputes-realtime-' + Date.now())
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'disputes' }, () => fetchDisputes())
      .subscribe();
    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [fetchDisputes]);

  const handleDeleteDispute = async (disputeId: string) => {
    if (!confirm('\uD83D\uDDD1\uFE0F Delete this dispute case? This cannot be undone!')) return;
    setActionLoading(disputeId);
    try {
      await adminDelete('disputes', disputeId);
      await fetchDisputes();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  };

  const handleAction = async (disputeId: string, action: 'resolved' | 'dismissed', amount?: number) => {
    const actionLabel = action === 'resolved' ? 'Release funds to freelancer' : 'Refund to client';
    const amountStr = amount ? ' (' + formatCurrency(amount) + ')' : '';
    if (!confirm('\u26A0\uFE0F ' + actionLabel + amountStr + '? This action cannot be undone.')) return;

    setActionLoading(disputeId);
    try {
      const resolution = action === 'resolved'
        ? 'Funds released to freelancer per admin review on ' + new Date().toLocaleDateString()
        : 'Funds refunded to client per admin review on ' + new Date().toLocaleDateString();
      await adminUpdate('disputes', disputeId, { status: action, resolution, updated_at: new Date().toISOString() });
      await fetchDisputes();
    } catch (err) { console.error('Failed to update dispute:', err); }
    finally { setActionLoading(null); }
  };

  const pendingCount = disputes.filter(d => d.status === 'pending' || d.status === 'under_review').length;
  const atRisk = disputes.reduce((s, d) => s + (d.contract?.amount || 0), 0);

  let disputeContent: ReactNode;
  if (loading) {
    disputeContent = <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>;
  } else if (disputes.length === 0) {
    disputeContent = (
      <div className="text-center py-12" style={{ background: '#1E293B', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
        <Scale className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">No disputes found</p>
      </div>
    );
  } else {
    disputeContent = disputes.map(dispute => (
      <DisputeCard key={dispute.id} dispute={dispute} actionLoading={actionLoading} onAction={handleAction} onDelete={handleDeleteDispute} />
    ));
  }

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dispute Resolution</h1>
          <p className="text-slate-400 text-sm mt-1">Review and resolve platform disputes</p>
        </div>
        {pendingCount > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full">{pendingCount} Open</span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Cases', value: disputes.length, color: 'text-slate-100' },
          { label: 'Pending', value: disputes.filter(d => d.status === 'pending').length, color: 'text-amber-400' },
          { label: 'Under Review', value: disputes.filter(d => d.status === 'under_review').length, color: 'text-blue-400' },
          { label: 'At Risk', value: formatCurrency(atRisk), color: 'text-red-400' },
        ].map((stat, i) => (
          <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</p>
            <p className={'text-xl font-bold ' + stat.color}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {['all', 'pending', 'under_review', 'resolved', 'dismissed'].map(status => (
          <button key={status} onClick={() => setStatusFilter(status)}
            className={'px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ' + (statusFilter === status ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5')}>
            {status.replace('_', ' ')}
            <span className="ml-1 opacity-60">({disputes.filter(d => status === 'all' || d.status === status).length})</span>
          </button>
        ))}
        <button onClick={fetchDisputes} className="ml-auto p-1.5 hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
          <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} />
        </button>
      </div>

      <div className="space-y-4">{disputeContent}</div>
    </div>
  );
}