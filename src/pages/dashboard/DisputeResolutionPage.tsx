import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Ban, Calendar, CheckCircle2, ChevronRight, Clock, FileText, Loader2, MessageCircle, Scale, Send, Shield, User, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { TipNote } from '../../components/TipNote';
import { disputeService } from '../../lib/disputeService';
import type { DisputeCase } from '../../lib/disputeService';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/currency';

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.FC<{ className?: string }> }> = {
  pending:        { label: 'Pending Review',                 color: 'text-amber-600 bg-amber-50 border-amber-200',   Icon: Clock },
  under_review:   { label: 'Under Review',                   color: 'text-blue-600 bg-blue-50 border-blue-200',      Icon: Scale },
  open:           { label: 'Open',                           color: 'text-amber-600 bg-amber-50 border-amber-200',   Icon: Clock },
  investigating:  { label: 'Under Investigation',            color: 'text-blue-600 bg-blue-50 border-blue-200',      Icon: Scale },
  escalated:      { label: 'Escalated',                      color: 'text-red-600 bg-red-50 border-red-200',          Icon: AlertTriangle },
  resolved_refunded: { label: 'Resolved — Refunded to Client', color: 'text-rose-600 bg-rose-50 border-rose-200',    Icon: XCircle },
  resolved_released: { label: 'Resolved — Paid to Freelancer', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', Icon: CheckCircle2 },
  cancelled:      { label: 'Dismissed — Work Resumes',       color: 'text-slate-600 bg-slate-100 border-slate-200',   Icon: Ban },
};

function getStatusBadge(status: string | null, decision?: string | null) {
  let cfg = STATUS_CONFIG[status || ''] || STATUS_CONFIG.pending;
  // A refunded resolution can be a full client refund OR a split — show the real outcome.
  if (status === 'resolved_refunded' && decision === 'split') {
    cfg = { label: 'Resolved — Split', color: 'text-violet-600 bg-violet-50 border-violet-200', Icon: Scale };
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <cfg.Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

/* Real dispute statuses used by the app (pending/under_review/open/investigating/
   escalated are pre-resolution; resolved_refunded / resolved_released are terminal
   with money moved; cancelled means dismissed). */
const ACTIVE_STATUSES = ['pending', 'under_review', 'open', 'investigating', 'escalated'];
const RESOLVED_STATUSES = ['resolved_refunded', 'resolved_released'];
const TERMINAL_STATUSES = ['resolved_refunded', 'resolved_released', 'cancelled'];

/* Plain-language explanation of the admin's final decision + where the money went. */
function getDecisionExplanation(dispute: DisputeCase): string {
  const decision = (dispute as any).decision as string | null;
  const amount = Number((dispute as any).decision_amount || 0);
  const amt = amount > 0 ? formatCurrency(amount) : 'the escrow amount';

  switch (decision) {
    case 'client_refund':
      return `${amt} was refunded to the client in full. The contract is cancelled and the freelancer receives no payment for this project.`;
    case 'freelancer_release':
      return `${amt} was released to the freelancer from escrow. The contract is marked completed and the freelancer's wallet has been credited for the work delivered.`;
    case 'split':
      return `The escrow was split fairly between both parties — the client received a partial refund for the unmet portion and the freelancer was paid for the work actually delivered.`;
    case 'dismiss':
      return `The dispute was dismissed — no wrongdoing was found. Work on this contract continues normally and the escrow funds stay locked to the contract.`;
    default:
      return `This dispute has been closed. No further action is needed from your side.`;
  }
}

const REASON_LABELS: Record<string, string> = {
  missed_milestone:     'Missed Milestone',
  poor_quality:         'Poor Quality',
  late_delivery:        'Late Delivery',
  scope_violation:      'Scope Violation',
  payment_dispute:      'Payment Dispute',
  communication_breakdown: 'Communication Breakdown',
  contract_breach:      'Contract Breach',
  other:                'Other',
};

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateFull(dateStr?: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/* ------------------------------------------------------------------ */
/*  Message interface for dispute thread                                */
/* ------------------------------------------------------------------ */

interface DisputeMessage {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Tab                                                               */
/* ------------------------------------------------------------------ */

type TabId = 'all' | 'active' | 'resolved' | 'dismissed';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All Disputes' },
  { id: 'active', label: 'Active' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
];

/* ================================================================== */
/*  Main Page Component                                                */
/* ================================================================== */

export function DisputeResolutionPage() {
  const { user } = useAuth();

  /* data */
  const [disputes, setDisputes] = useState<DisputeCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('all');

  /* detail view */
  const [selectedDispute, setSelectedDispute] = useState<DisputeCase | null>(null);
  const [_loadingDetail, setLoadingDetail] = useState(true);
  const [contractDetail, setContractDetail] = useState<Record<string, any> | null>(null);

  /* messages */
  const [messages, setMessages] = useState<DisputeMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* fetch disputes list */
  const fetchDisputes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await disputeService.getUserDisputes(user.id);
      setDisputes(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDisputes();

    if (!user) return;
    // Real-time: refresh dispute list when any of user's disputes are updated
    const listChannel = disputeService.subscribeUserDisputes
      ? disputeService.subscribeUserDisputes(user.id, fetchDisputes)
      : null;
    return () => { if (listChannel) supabase.removeChannel(listChannel); };
  }, [fetchDisputes, user]);

  /* select dispute & load detail */
  const handleSelectDispute = useCallback(async (dispute: DisputeCase) => {
    setSelectedDispute(dispute);
    setLoadingDetail(true);

    /* parse messages from dispute */
    const rawMessages = (dispute as any).messages || [];
    setMessages(rawMessages as DisputeMessage[]);

    try {
      const result = await disputeService.getDisputeWithContract(dispute.id);
      if (result.contract) {
        setContractDetail(result.contract as Record<string, any>);
      }
    } catch {
      // ignore
    }
  }, []);

  /* scroll messages to bottom */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* send message */
  const handleSendMessage = useCallback(async () => {
    if (!selectedDispute || !user || !newMessage.trim()) return;
    setSendingMessage(true);
    try {
      const result = await disputeService.addMessage(
        selectedDispute.id,
        user.id,
        newMessage.trim()
      );
      if (result.success) {
        const optimistic: DisputeMessage = {
          id: crypto.randomUUID(),
          user_id: user.id,
          message: newMessage.trim(),
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, optimistic]);
        setNewMessage('');
      }
    } finally {
      setSendingMessage(false);
    }
  }, [selectedDispute, user, newMessage]);

  /* realtime subscription for selected dispute */
  useEffect(() => {
    if (!selectedDispute) return;
    const channel = disputeService.subscribe(selectedDispute.id, (updated) => {
      setSelectedDispute(updated);
      setDisputes(prev => prev.map(d => d.id === updated.id ? updated : d));
      /* refresh messages if changed */
      const rawMessages = (updated as any).messages || [];
      setMessages(rawMessages as DisputeMessage[]);
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDispute]);

  /* back to list */
  const handleBack = () => {
    setSelectedDispute(null);
    setContractDetail(null);
    setMessages([]);
  };

  /* filtered disputes */
  const filteredDisputes = activeTab === 'all'
    ? disputes
    : activeTab === 'active'
      ? disputes.filter(d => ACTIVE_STATUSES.includes(d.status))
      : activeTab === 'resolved'
        ? disputes.filter(d => RESOLVED_STATUSES.includes(d.status))
        : disputes.filter(d => d.status === 'cancelled');

  /* summary counts */
  const pendingCount = disputes.filter(d => ACTIVE_STATUSES.includes(d.status)).length;
  const resolvedCount = disputes.filter(d => RESOLVED_STATUSES.includes(d.status)).length;

  /* ================================================================ */
  /*  Loading State                                                     */
  /* ================================================================ */

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  /* ================================================================ */
  /*  Detail View (when a dispute is selected)                          */
  /* ================================================================ */

  if (selectedDispute) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back button */}
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to all disputes
        </button>

        {/* Header Card */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold text-slate-900">Dispute #{selectedDispute.id.slice(0, 8)}</h2>
                {getStatusBadge(selectedDispute.status, (selectedDispute as any).decision)}
              </div>
              <p className="text-slate-500 text-sm">
                Raised {formatDateFull(selectedDispute.created_at)}
              </p>
            </div>
            {contractDetail && (
              <Link
                to={`/dashboard/workspace?contract=${contractDetail.id}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-colors"
              >
                <FileText className="w-4 h-4" />
                View Contract
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* Quick info chips */}
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg text-slate-600">
              <Scale className="w-4 h-4 text-slate-400" />
              Reason: {REASON_LABELS[selectedDispute.reason] || selectedDispute.reason}
            </span>
            {contractDetail && (
              <span className="inline-flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg text-slate-600">
                <User className="w-4 h-4 text-slate-400" />
                Contract: {formatCurrency(Number((contractDetail as any).amount || 0))}
              </span>
            )}
            {contractDetail && (
              <span className="inline-flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400" />
                Status: {(contractDetail as any).status || 'N/A'}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-2">Description</h3>
          <p className="text-slate-600 text-sm leading-relaxed">
            {selectedDispute.description || 'No description provided.'}
          </p>
          {(selectedDispute as any).desired_outcome && (
            <>
              <h4 className="font-semibold text-slate-900 mt-4 mb-1">Desired Outcome</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                {(selectedDispute as any).desired_outcome as string}
              </p>
            </>
          )}
        </div>

        {/* Resolution Outcome (terminal statuses) */}
        {TERMINAL_STATUSES.includes(selectedDispute.status) && (
          <div className={`bg-white rounded-2xl border p-6 shadow-sm ${
            selectedDispute.status === 'resolved_released' ? 'border-emerald-100' : selectedDispute.status === 'cancelled' ? 'border-slate-100' : 'border-rose-100'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {selectedDispute.status === 'resolved_released' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : selectedDispute.status === 'cancelled' ? (
                <Ban className="w-5 h-5 text-slate-400" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-500" />
              )}
              <h3 className="font-semibold text-slate-900">
                {selectedDispute.status === 'cancelled' ? 'Dispute Dismissed' : 'Resolution Outcome'}
              </h3>
              {getStatusBadge(selectedDispute.status, (selectedDispute as any).decision)}
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              {getDecisionExplanation(selectedDispute)}
            </p>
            {(selectedDispute as any).decision_amount != null && (
              <p className="text-xs text-slate-400 mt-3">
                Amount involved: {formatCurrency(Number((selectedDispute as any).decision_amount || 0))}
              </p>
            )}
            {(selectedDispute as any).resolved_at && (
              <p className="text-xs text-slate-400 mt-1">
                Decided on {formatDateFull((selectedDispute as any).resolved_at)} by Growlancer Admin Team
              </p>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle className="w-5 h-5 text-slate-400" />
            <h3 className="font-semibold text-slate-900">Discussion Thread</h3>
          </div>

          {messages.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No messages yet. Start the conversation.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto mb-4 pr-1">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.user_id === user?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.user_id === user?.id
                        ? 'bg-emerald-500 text-white rounded-br-md'
                        : 'bg-slate-100 text-slate-800 rounded-bl-md'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                    <p className={`text-[10px] mt-1 ${msg.user_id === user?.id ? 'text-emerald-200' : 'text-slate-400'}`}>
                      {formatDate(msg.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Message input */}
          <div className="flex items-end gap-2 border-t border-slate-100 pt-4">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type a message..."
              rows={2}
              className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 placeholder:text-slate-400"
            />
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || sendingMessage}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {sendingMessage ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  List View (default)                                               */
  /* ================================================================ */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dispute Resolution</h1>
          <p className="text-slate-500 text-sm mt-1">
            Track and manage your contract disputes
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg font-medium">
            <Clock className="w-4 h-4" />
            {pendingCount} Active
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg font-medium">
            <CheckCircle2 className="w-4 h-4" />
            {resolvedCount} Resolved
          </span>
        </div>
      </div>

      {/* Dispute guide — plain-language */}
      <TipNote tone="warning" title="How dispute resolution works — where your money goes" compact>
        A dispute <strong>freezes the escrow money</strong> until our review team decides the case — funds are never moved without a decision. You can message and upload evidence in the meantime. Once decided, one of these outcomes happens automatically:
      </TipNote>

      {/* Outcome cards — what each decision means for both sides */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-2" />
          <p className="text-xs font-bold text-emerald-900 mb-1">Freelancer Favour — Work Delivered</p>
          <p className="text-[11px] text-emerald-700 leading-relaxed">The full escrow is released to the freelancer's wallet. Contract completes.</p>
        </div>
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
          <XCircle className="w-5 h-5 text-rose-600 mb-2" />
          <p className="text-xs font-bold text-rose-900 mb-1">Client Favour — No Work Done</p>
          <p className="text-[11px] text-rose-700 leading-relaxed">The full escrow is refunded back to the client. Contract cancelled — freelancer gets nothing.</p>
        </div>
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
          <Scale className="w-5 h-5 text-violet-600 mb-2" />
          <p className="text-xs font-bold text-violet-900 mb-1">Split — Partial Work</p>
          <p className="text-[11px] text-violet-700 leading-relaxed">Client gets a partial refund and the freelancer is paid for the work actually delivered.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <Ban className="w-5 h-5 text-slate-600 mb-2" />
          <p className="text-xs font-bold text-slate-900 mb-1">Dismissed — No Wrongdoing</p>
          <p className="text-[11px] text-slate-600 leading-relaxed">Work resumes normally — escrow stays locked to the contract for the agreed payment.</p>
        </div>
      </div>

      {/* Empty state */}
      {disputes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Disputes</h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto mb-6">
            You have no disputes on your contracts. If an issue arises, you can raise a
            dispute directly from the contract workspace.
          </p>
          <Link
            to="/dashboard/contracts"
            className="inline-flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-4 py-2.5 rounded-xl hover:bg-emerald-100 transition-colors"
          >
            <FileText className="w-4 h-4" />
            View Your Contracts
          </Link>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="border-b border-slate-200 overflow-x-auto">
            <nav className="flex gap-0 -mb-px">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-emerald-500 text-emerald-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {tab.label}
                  {tab.id !== 'all' && (
                    <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {tab.id === 'active'
                        ? disputes.filter(d => ACTIVE_STATUSES.includes(d.status)).length
                        : tab.id === 'resolved'
                          ? disputes.filter(d => RESOLVED_STATUSES.includes(d.status)).length
                          : disputes.filter(d => d.status === 'cancelled').length}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Dispute cards */}
          {filteredDisputes.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No disputes match this filter.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDisputes.map((dispute) => {
                return (
                  <button
                    key={dispute.id}
                    onClick={() => handleSelectDispute(dispute)}
                    className="w-full text-left bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:border-slate-200 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1.5">
                          <h3 className="font-semibold text-slate-900 truncate">
                            Dispute #{dispute.id.slice(0, 8)}
                          </h3>
                          {getStatusBadge(dispute.status, (dispute as any).decision)}
                        </div>
                        <p className="text-sm text-slate-500 line-clamp-1">
                          <span className="font-medium text-slate-600">
                            {REASON_LABELS[dispute.reason] || dispute.reason}
                          </span>
                          {' — '}
                          {dispute.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(dispute.created_at)}
                          </span>
                          {(dispute as any).messages && Array.isArray((dispute as any).messages) && (
                            <span className="flex items-center gap-1">
                              <MessageCircle className="w-3.5 h-3.5" />
                              {(dispute as any).messages.length} messages
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}