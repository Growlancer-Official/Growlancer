import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Ban, Calendar, CheckCircle2, ChevronRight, Clock, FileText, Loader2, MessageCircle, Scale, Send, Shield, ThumbsUp, User,  } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { disputeService } from '../../lib/disputeService';
import type { DisputeCase } from '../../lib/disputeService';

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.FC<{ className?: string }> }> = {
  pending:       { label: 'Pending Review',  color: 'text-amber-600 bg-amber-50 border-amber-200', Icon: Clock },
  under_review:  { label: 'Under Review',    color: 'text-blue-600 bg-blue-50 border-blue-200',    Icon: Scale },
  resolved:      { label: 'Resolved',         color: 'text-emerald-600 bg-emerald-50 border-emerald-200', Icon: CheckCircle2 },
  dismissed:     { label: 'Dismissed',        color: 'text-slate-600 bg-slate-100 border-slate-200', Icon: Ban },
  escalated:     { label: 'Escalated',        color: 'text-red-600 bg-red-50 border-red-200',       Icon: AlertTriangle },
};

function getStatusBadge(status: string | null) {
  const cfg = STATUS_CONFIG[status || ''] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <cfg.Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
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

function formatDateFull(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
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

type TabId = 'all' | 'pending' | 'under_review' | 'resolved' | 'dismissed' | 'escalated';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All Disputes' },
  { id: 'pending', label: 'Pending' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'escalated', label: 'Escalated' },
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
  const [contractDetail, setContractDetail] = useState<Record<string, any> | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

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
    return () => { listChannel?.unsubscribe(); };
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
    } finally {
      setLoadingDetail(false);
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
      channel.unsubscribe();
    };
  }, [selectedDispute?.id]);

  /* back to list */
  const handleBack = () => {
    setSelectedDispute(null);
    setContractDetail(null);
    setMessages([]);
  };

  /* filtered disputes */
  const filteredDisputes = activeTab === 'all'
    ? disputes
    : disputes.filter(d => d.status === activeTab);

  /* summary counts */
  const pendingCount = disputes.filter(d => d.status === 'pending' || d.status === 'under_review').length;
  const resolvedCount = disputes.filter(d => d.status === 'resolved').length;

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
    const cfg = STATUS_CONFIG[selectedDispute.status] || STATUS_CONFIG.pending;
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
                {getStatusBadge(selectedDispute.status)}
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
                Contract: ${(contractDetail as any).amount || 0}
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

        {/* Resolution Notes (if resolved/dismissed) */}
        {(selectedDispute.status === 'resolved' || selectedDispute.status === 'dismissed') && (selectedDispute as any).resolution && (
          <div className={`bg-white rounded-2xl border p-6 shadow-sm ${
            selectedDispute.status === 'resolved' ? 'border-emerald-100' : 'border-slate-100'
          }`}>
            <div className="flex items-center gap-2 mb-3">
              {selectedDispute.status === 'resolved' ? (
                <ThumbsUp className="w-5 h-5 text-emerald-500" />
              ) : (
                <Ban className="w-5 h-5 text-slate-400" />
              )}
              <h3 className="font-semibold text-slate-900">
                {selectedDispute.status === 'resolved' ? 'Resolution' : 'Dismissal Note'}
              </h3>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">{(selectedDispute as any).resolution}</p>
            {(selectedDispute as any).resolved_by && (
              <p className="text-xs text-slate-400 mt-2">
                Resolved by {(selectedDispute as any).resolved_by}
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
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-5 py-2.5 rounded-xl hover:bg-emerald-100 transition-colors"
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
                      {disputes.filter(d => d.status === tab.id).length}
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
                const cfg = STATUS_CONFIG[dispute.status] || STATUS_CONFIG.pending;
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
                          {getStatusBadge(dispute.status)}
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