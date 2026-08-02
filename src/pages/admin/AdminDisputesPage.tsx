import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Scale, Loader2, RefreshCw, CheckCircle2, XCircle, User, Clock, Trash2,
  MessageSquare, Paperclip, Snowflake, Unlock, Split, ChevronDown, Lock, Send, FileText,
} from 'lucide-react';
import { adminQuery, adminDelete } from '../../lib/adminDataProxy';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { refundService, type DisputeMessage, type DisputeEvidence, type DisputeInternalNote, type RefundHistoryEvent } from '../../lib/refundService';

interface AdminDispute {
  id: string;
  contract_id: string;
  client_id: string;
  freelancer_id: string;
  reason: string;
  description: string | null;
  amount: number;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  decision: string | null;
  decision_amount: number | null;
  admin_assigned_to: string | null;
  appeal_status: string | null;
  appeal_reason: string | null;
  escalated: boolean;
  contract?: { amount: number; status: string; frozen_at?: string | null; freeze_reason?: string | null } | null;
  client?: { name: string } | null;
  freelancer?: { name: string } | null;
}

const NEW_STATUSES = ['open', 'investigating', 'resolved_refunded', 'resolved_released', 'cancelled', 'escalated'];

function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  return new Date(dateStr).toLocaleDateString();
}

const statusColors: Record<string, string> = {
  open: 'bg-amber-500/10 text-amber-400',
  investigating: 'bg-blue-500/10 text-blue-400',
  escalated: 'bg-purple-500/10 text-purple-400',
  resolved_refunded: 'bg-emerald-500/10 text-emerald-400',
  resolved_released: 'bg-emerald-500/10 text-emerald-400',
  cancelled: 'bg-slate-500/10 text-slate-400',
};

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ');
}

export function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailDispute, setDetailDispute] = useState<AdminDispute | null>(null);
  const [detailData, setDetailData] = useState<{
    messages: DisputeMessage[];
    evidence: DisputeEvidence[];
    notes: DisputeInternalNote[];
    history: RefundHistoryEvent[];
  }>({ messages: [], evidence: [], notes: [], history: [] });
  const [detailLoading, setDetailLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [splitAmount, setSplitAmount] = useState('');
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const [freezeReason, setFreezeReason] = useState('');
  const [showFreezeInput, setShowFreezeInput] = useState(false);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const opts: any = { table: 'disputes', select: '*', order: 'created_at', orderDir: 'desc' };
      if (statusFilter !== 'all') opts.filters = { status: statusFilter };
      const data = (await adminQuery(opts)).data as AdminDispute[];

      const userIds = [...new Set(data.flatMap(d => [d.client_id, d.freelancer_id]).filter(Boolean))];
      const contractIds = [...new Set(data.map(d => d.contract_id).filter(Boolean))];

      const [profilesRes, contractsRes] = await Promise.all([
        userIds.length ? adminQuery({ table: 'profiles', select: 'id, name', in: { id: userIds } }) : Promise.resolve({ data: [] }),
        contractIds.length ? adminQuery({ table: 'contracts', select: 'id, amount, status, frozen_at, freeze_reason', in: { id: contractIds } }) : Promise.resolve({ data: [] }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, { name: p.name }]));
      const contractMap = new Map((contractsRes.data || []).map((c: any) => [c.id, { amount: c.amount, status: c.status, frozen_at: c.frozen_at, freeze_reason: c.freeze_reason }]));

      setDisputes(data.map(d => ({
        ...d,
        client: profileMap.get(d.client_id) || null,
        freelancer: profileMap.get(d.freelancer_id) || null,
        contract: contractMap.get(d.contract_id) || null,
      })));
    } catch (err) {
      console.error('Failed to fetch disputes:', err);
      toast.error('Failed to fetch disputes', err instanceof Error ? err.message : 'Unknown error');
    } finally { setLoading(false); }
  }, [statusFilter, toast]);

  useEffect(() => { void fetchDisputes(); }, [fetchDisputes]);
  useEffect(() => {
    const channel = supabase
      .channel('admin-disputes-realtime-' + Date.now())
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'disputes' } as any, () => void fetchDisputes())
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [fetchDisputes]);

  // ── Detail drawer ────────────────────────────────────────────
  const loadDetail = useCallback(async (dispute: AdminDispute) => {
    setDetailLoading(true);
    const [messages, evidence, notes, history] = await Promise.all([
      refundService.getDisputeMessages(dispute.id),
      refundService.getDisputeEvidence(dispute.id),
      refundService.getInternalNotes(dispute.id),
      refundService.getRefundRequests(dispute.contract_id).then(reqs => {
        if (reqs.length === 0) return [];
        return refundService.getRefundHistory(reqs[0].id);
      }),
    ]);
    setDetailData({ messages, evidence, notes, history });
    setDetailLoading(false);
  }, []);

  const openDetail = (dispute: AdminDispute) => {
    setDetailDispute(dispute);
    setSplitAmount(dispute.amount ? String(dispute.amount) : '');
    setFreezeReason('');
    setShowFreezeInput(false);
    void loadDetail(dispute);
  };

  const closeDetail = () => { setDetailDispute(null); setDetailData({ messages: [], evidence: [], notes: [], history: [] }); };

  // ── Decision actions ─────────────────────────────────────────
  const handleDecision = async (decision: 'client_refund' | 'freelancer_release' | 'split' | 'dismiss') => {
    if (!detailDispute) return;
    const clientAmount = decision === 'split' ? Number(splitAmount) || 0 : undefined;
    setDecisionBusy(decision);
    const result = await refundService.adminDecide(detailDispute.id, decision, clientAmount, undefined);
    setDecisionBusy(null);
    if (result.success) {
      toast.success('Dispute decision applied');
      closeDetail();
      void fetchDisputes();
    } else {
      toast.error('Decision failed', result.error || 'Unknown error');
    }
  };

  const handleFreeze = async () => {
    if (!detailDispute?.contract_id) return;
    const frozen = !!detailDispute.contract?.frozen_at;
    if (!frozen) {
      if (!freezeReason.trim()) { toast.warning('Enter a freeze reason'); return; }
      const res = await refundService.freezeContract(detailDispute.contract_id, freezeReason.trim());
      if (res.success) toast.success('Contract frozen — wallets locked');
      else toast.error('Freeze failed', res.error);
    } else {
      const res = await refundService.unfreezeContract(detailDispute.contract_id);
      if (res.success) toast.success('Contract unfrozen');
      else toast.error('Unfreeze failed', res.error);
    }
    void fetchDisputes();
    openDetail({ ...detailDispute, contract: { ...(detailDispute.contract || {}), frozen_at: frozen ? null : new Date().toISOString() } as any });
  };

  const handleSendMessage = async () => {
    if (!detailDispute || !messageText.trim()) return;
    const res = await refundService.sendDisputeMessage(detailDispute.id, messageText.trim());
    if (res.success) { setMessageText(''); void loadDetail(detailDispute); }
    else toast.error('Failed to send', res.error);
  };

  const handleAddNote = async () => {
    if (!detailDispute || !noteText.trim()) return;
    const res = await refundService.adminAddInternalNote(detailDispute.id, noteText.trim());
    if (res.success) { setNoteText(''); void loadDetail(detailDispute); }
    else toast.error('Failed to add note', res.error);
  };

  const handleEvidenceUpload = async (file: File | null) => {
    if (!file || !detailDispute) return;
    setEvidenceUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const path = `${session.user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('dispute-evidence').upload(path, file);
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from('dispute-evidence').createSignedUrl(path, 60 * 60 * 24);
      const res = await refundService.attachEvidence({
        disputeId: detailDispute.id,
        fileName: file.name,
        fileUrl: signed?.signedUrl || `${supabase.storage.from('dispute-evidence').getPublicUrl(path).data.publicUrl}`,
        mimeType: file.type,
        fileSize: file.size,
      });
      if (res.success) { toast.success('Evidence uploaded'); void loadDetail(detailDispute); }
      else toast.error('Upload failed', res.error);
    } catch (e) {
      toast.error('Upload error', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setEvidenceUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDispute = async (disputeId: string) => {
    setActionLoading(disputeId);
    try {
      await adminDelete('disputes', disputeId);
      await fetchDisputes();
      toast.success('Dispute deleted');
    } catch (err) {
      toast.error('Failed to delete dispute', err instanceof Error ? err.message : 'Unknown error');
    } finally { setActionLoading(null); }
  };

  const pendingCount = disputes.filter(d => ['open', 'investigating', 'escalated'].includes(d.status)).length;
  const atRisk = disputes.reduce((s, d) => s + (d.amount || 0), 0);

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
      <div key={dispute.id} className="p-6 rounded-[2rem]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Case #{dispute.id.slice(0, 8)}</span>
                <span className={'px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ' + (statusColors[dispute.status] || '')}>
                  {statusLabel(dispute.status)}
                </span>
                {dispute.contract?.frozen_at && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase bg-blue-500/10 text-blue-400 flex items-center gap-1">
                    <Snowflake className="w-2.5 h-2.5" /> Frozen
                  </span>
                )}
              </div>
              <span className="text-xs font-bold text-orange-400">{formatCurrency(dispute.amount)} at stake</span>
            </div>
            <h3 className="text-base font-bold text-white">{dispute.reason}</h3>
            <p className="text-xs text-slate-400 line-clamp-2">{dispute.description}</p>
            {dispute.decision && (
              <div className="p-3 bg-slate-900 rounded-xl border border-white/5 text-[10px]">
                <span className="text-slate-500 uppercase font-bold">Decision: </span>
                <span className="text-emerald-400 font-bold">{statusLabel(dispute.decision)}</span>
                {dispute.decision_amount != null && <span className="text-slate-400"> · {formatCurrency(dispute.decision_amount)}</span>}
              </div>
            )}
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {dispute.client?.name || 'Client'}</span>
              <span>vs</span>
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {dispute.freelancer?.name || 'Freelancer'}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatRelativeTime(dispute.created_at)}</span>
            </div>
          </div>

          <div className="flex flex-row lg:flex-col gap-2 w-full lg:w-52 shrink-0">
            <button onClick={() => openDetail(dispute)} disabled={actionLoading === dispute.id}
              className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl text-[10px] uppercase hover:bg-indigo-700 transition-all disabled:opacity-50">
              Manage Case
            </button>
            {!['resolved_refunded', 'resolved_released', 'cancelled'].includes(dispute.status) && (
              <button onClick={() => handleDecision('client_refund')} disabled={actionLoading === dispute.id}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl text-[10px] uppercase hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                <XCircle className="w-3 h-3" /> Refund Client
              </button>
            )}
            {!['resolved_refunded', 'resolved_released', 'cancelled'].includes(dispute.status) && (
              <button onClick={() => handleDecision('freelancer_release')} disabled={actionLoading === dispute.id}
                className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl text-[10px] uppercase hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Release to Freelancer
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => void handleDeleteDispute(dispute.id)} disabled={actionLoading === dispute.id}
              className="px-3 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl transition-all" title="Delete Dispute">
              {actionLoading === dispute.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    ));
  }

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dispute Resolution</h1>
          <p className="text-slate-400 text-sm mt-1">Review evidence, chat with parties, and decide outcomes</p>
        </div>
        {pendingCount > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full">{pendingCount} Open</span>}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Cases', value: disputes.length, color: 'text-slate-100' },
          { label: 'Open', value: disputes.filter(d => d.status === 'open').length, color: 'text-amber-400' },
          { label: 'Investigating', value: disputes.filter(d => d.status === 'investigating').length, color: 'text-blue-400' },
          { label: 'At Risk', value: formatCurrency(atRisk), color: 'text-red-400' },
        ].map((stat, i) => (
          <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</p>
            <p className={'text-xl font-bold ' + stat.color}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {['all', ...NEW_STATUSES].map(status => (
          <button key={status} onClick={() => setStatusFilter(status)}
            className={'px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ' + (statusFilter === status ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5')}>
            {statusLabel(status)}
            <span className="ml-1 opacity-60">({disputes.filter(d => status === 'all' || d.status === status).length})</span>
          </button>
        ))}
        <button onClick={() => void fetchDisputes()} className="ml-auto p-1.5 hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
          <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} />
        </button>
      </div>

      <div className="space-y-4">{disputeContent}</div>

      {/* ── Detail Drawer ─────────────────────────────────────── */}
      {detailDispute && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="min-h-full flex items-start justify-end">
            <div className="w-full max-w-2xl bg-slate-900 min-h-screen border-l border-white/10 p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Case #{detailDispute.id.slice(0, 8)}</h2>
                  <p className="text-xs text-slate-400">{detailDispute.reason}</p>
                </div>
                <button onClick={closeDetail} className="p-2 hover:bg-white/10 rounded-xl text-slate-400 transition-colors"><ChevronDown className="w-5 h-5 rotate-180" /></button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-800/60 rounded-xl">
                  <p className="text-slate-500 mb-1">Amount at stake</p>
                  <p className="text-lg font-bold text-orange-400">{formatCurrency(detailDispute.amount)}</p>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl">
                  <p className="text-slate-500 mb-1">Status</p>
                  <p className="text-lg font-bold text-white capitalize">{statusLabel(detailDispute.status)}</p>
                </div>
              </div>

              {detailDispute.description && (
                <div className="p-4 bg-slate-800/60 rounded-xl">
                  <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Description</p>
                  <p className="text-xs text-slate-300">{detailDispute.description}</p>
                </div>
              )}

              {/* Decision actions */}
              <div className="space-y-3">
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Admin Decision</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => void handleDecision('client_refund')} disabled={decisionBusy !== null}
                    className="py-3 bg-red-600 text-white font-bold rounded-xl text-[10px] uppercase hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1">
                    {decisionBusy === 'client_refund' ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />} Refund Client
                  </button>
                  <button onClick={() => void handleDecision('freelancer_release')} disabled={decisionBusy !== null}
                    className="py-3 bg-emerald-600 text-white font-bold rounded-xl text-[10px] uppercase hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1">
                    {decisionBusy === 'freelancer_release' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Release to Freelancer
                  </button>
                  <button onClick={() => void handleDecision('dismiss')} disabled={decisionBusy !== null}
                    className="py-3 bg-slate-700 text-white font-bold rounded-xl text-[10px] uppercase hover:bg-slate-600 disabled:opacity-50">
                    {decisionBusy === 'dismiss' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : null} Dismiss (Resume)
                  </button>
                  <div className="flex items-center gap-2">
                    <input
                      value={splitAmount}
                      onChange={e => setSplitAmount(e.target.value)}
                      placeholder="Client share"
                      type="number"
                      className="flex-1 min-w-0 px-3 py-3 bg-slate-800 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button onClick={() => void handleDecision('split')} disabled={decisionBusy !== null}
                      className="px-3 py-3 bg-indigo-600 text-white font-bold rounded-xl text-[10px] uppercase hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                      {decisionBusy === 'split' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Split className="w-3 h-3" />} Split
                    </button>
                  </div>
                </div>
              </div>

              {/* Fraud freeze */}
              <div className="p-4 bg-slate-800/60 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Fraud / Abuse Controls</p>
                  {detailDispute.contract?.frozen_at && (
                    <span className="text-[9px] font-bold text-blue-400 flex items-center gap-1"><Snowflake className="w-3 h-3" /> FROZEN</span>
                  )}
                </div>
                {showFreezeInput && !detailDispute.contract?.frozen_at ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={freezeReason}
                      onChange={e => setFreezeReason(e.target.value)}
                      placeholder="Reason (e.g. suspected chargeback fraud)"
                      className="flex-1 px-3 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={() => void handleFreeze()} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-bold uppercase hover:bg-blue-700">
                      Freeze
                    </button>
                  </div>
                ) : (
                  <button onClick={() => detailDispute.contract?.frozen_at ? void handleFreeze() : setShowFreezeInput(true)}
                    className={'w-full py-2.5 rounded-xl text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-all ' + (detailDispute.contract?.frozen_at ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20')}>
                    {detailDispute.contract?.frozen_at ? <><Unlock className="w-3 h-3" /> Unfreeze Contract</> : <><Snowflake className="w-3 h-3" /> Freeze Contract + Wallets</>}
                  </button>
                )}
              </div>

              {/* Timeline */}
              {detailData.history.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2">Refund Timeline</p>
                  <div className="space-y-2">
                    {detailData.history.map((ev, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-2.5 bg-slate-800/40 rounded-lg">
                        <Clock className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-slate-300 capitalize">{statusLabel(ev.event)}</p>
                          {ev.note && <p className="text-[10px] text-slate-500">{ev.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Evidence ({detailData.evidence.length})</p>
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf,.zip" className="hidden"
                    onChange={e => void handleEvidenceUpload(e.target.files?.[0] || null)} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={evidenceUploading}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-slate-300 transition-all disabled:opacity-50 flex items-center gap-1">
                    {evidenceUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />} Upload
                  </button>
                </div>
                <div className="space-y-2">
                  {detailData.evidence.map(ev => (
                    <a key={ev.id} href={ev.file_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 bg-slate-800/60 rounded-lg hover:bg-slate-800 transition-colors">
                      <FileText className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                      <span className="text-xs text-slate-300 truncate">{ev.file_name}</span>
                      <span className="ml-auto text-[10px] text-slate-500">{ev.file_size ? `${(ev.file_size / 1024).toFixed(0)} KB` : ''}</span>
                    </a>
                  ))}
                  {detailData.evidence.length === 0 && <p className="text-xs text-slate-600">No evidence uploaded yet.</p>}
                </div>
              </div>

              {/* Messages */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Conversation</p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {detailData.messages.map(m => (
                    <div key={m.id} className="p-2.5 bg-slate-800/60 rounded-lg">
                      <p className="text-[10px] text-slate-500 mb-0.5">{m.sender?.name || m.sender?.full_name || 'Party'}</p>
                      <p className="text-xs text-slate-300">{m.message}</p>
                    </div>
                  ))}
                  {detailData.messages.length === 0 && <p className="text-xs text-slate-600">No messages yet.</p>}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void handleSendMessage(); }}
                    placeholder="Reply to the parties..."
                    className="flex-1 px-3 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button onClick={() => void handleSendMessage()} className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"><Send className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Internal notes */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2 flex items-center gap-1"><Lock className="w-3 h-3" /> Internal Notes (Admin only)</p>
                <div className="space-y-2">
                  {detailData.notes.map(n => (
                    <div key={n.id} className="p-2.5 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                      <p className="text-xs text-amber-200/90">{n.note}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void handleAddNote(); }}
                    placeholder="Add internal note..."
                    className="flex-1 px-3 py-2.5 bg-slate-800 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button onClick={() => void handleAddNote()} className="px-3 py-2.5 bg-amber-500/10 text-amber-400 rounded-xl text-[10px] font-bold uppercase hover:bg-amber-500/20 transition-colors">
                    Note
                  </button>
                </div>
              </div>

              {detailLoading && <div className="text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
