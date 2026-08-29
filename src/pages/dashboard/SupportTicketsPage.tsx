import { InfoTip } from '../../components/InfoTip';
import { PageSkeleton } from '../../components/PageSkeleton';
import { useState, useEffect, useCallback } from 'react';
import {
  Headphones, Plus, ChevronDown, ChevronUp, MessageSquare,
  Clock, CheckCircle2, AlertCircle, Send, LifeBuoy,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ticketService, type SupportTicket, type TicketCategory, type TicketPriority } from '../../lib/supportTicketService';

const CATEGORIES: { value: TicketCategory; label: string; desc: string }[] = [
  { value: 'general', label: 'General', desc: 'Platform questions, how-to, general help' },
  { value: 'billing', label: 'Billing', desc: 'Payments, wallet, withdrawals, refunds' },
  { value: 'account', label: 'Account', desc: 'Profile, KYC, login issues, settings' },
  { value: 'technical', label: 'Technical', desc: 'Bugs, errors, something not working' },
  { value: 'dispute', label: 'Dispute Help', desc: 'Help with contract disputes' },
  { value: 'feature_request', label: 'Feature Request', desc: 'Suggest new features or improvements' },
  { value: 'other', label: 'Other', desc: 'Anything else' },
];

const PRIORITIES: { value: TicketPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-600' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'High', color: 'bg-amber-100 text-amber-700' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  open: { label: 'Open', color: 'bg-emerald-100 text-emerald-700', icon: MessageSquare },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  resolved: { label: 'Resolved', color: 'bg-slate-100 text-slate-600', icon: CheckCircle2 },
  closed: { label: 'Closed', color: 'bg-slate-100 text-slate-500', icon: CheckCircle2 },
};

export default function SupportTicketsPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create form state
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('general');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const result = await ticketService.getUserTickets(user.id);
    if (result.success) setTickets(result.tickets);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    loadTickets();
  }, [user?.id, loadTickets]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id || !subject.trim() || !description.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);

    const result = await ticketService.create({
      userId: user.id,
      userRole: (user.role as 'freelancer' | 'client') || 'freelancer',
      subject: subject.trim(),
      description: description.trim(),
      category,
      priority,
    });

    setSubmitting(false);
    if (result.success) {
      setSubmitSuccess(true);
      setSubject('');
      setDescription('');
      setCategory('general');
      setPriority('normal');
      loadTickets();
      setTimeout(() => { setShowForm(false); setSubmitSuccess(false); }, 2000);
    } else {
      // Surface user-friendly errors
      const err = result.error || 'Failed to create ticket. Please try again.';
      if (err.includes('Failed to send') || err.includes('Edge Function')) {
        setSubmitError('Your ticket was created but we had trouble sending a notification. Our team will still see it.');
      } else {
        setSubmitError(err);
      }
    }
  }

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  const isFreelancer = user?.role === 'freelancer';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Headphones className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2"><div className="p-2 bg-emerald-100 rounded-xl"><Headphones className="w-5 h-5 text-emerald-600" /></div>Support Tickets <InfoTip title="How support works" text="Submit a ticket and our team responds within 24 hours. For instant help with common questions, try the AI Assistant in your sidebar. Each ticket has a status — Open means our team is reviewing it, Resolved means it's been addressed." /></h1>
            <p className="text-slate-500 text-xs">Get help from our support team</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-xl hover:bg-emerald-700 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Ticket
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-bold text-slate-900">Create Support Ticket</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <ChevronUp className="w-5 h-5" />
            </button>
          </div>

          {submitSuccess ? (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-emerald-700 font-medium">Ticket created successfully!</span>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              {submitError && (
                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-700">{submitError}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TicketCategory)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TicketPriority)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain your issue in detail — include any error messages, steps to reproduce, or screenshots if possible"
                  required
                  rows={5}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting || !subject.trim() || !description.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold text-sm rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Submit Ticket'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-medium text-sm rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tickets List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <PageSkeleton showStats={false} cards={false} />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <LifeBuoy className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="font-display text-lg font-bold text-slate-900 mb-1">No tickets yet</h3>
          <p className="text-slate-500 text-xs mb-4 max-w-sm mx-auto">
            {isFreelancer
              ? "You haven't submitted any support tickets. If you need help, click 'New Ticket' above."
              : "You haven't submitted any support tickets. We're here to help — just click 'New Ticket'."}
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-3 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all"
          >
            <Plus className="w-4 h-4" /> Create Your First Ticket
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const status = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const isExpanded = expandedId === ticket.id;

            return (
              <div
                key={ticket.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm"
              >
                <button
                  onClick={() => toggleExpand(ticket.id)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-5 h-5 text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">{ticket.subject}</h3>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                          {status.label}
                        </span>
                        <span>•</span>
                        <span>{CATEGORIES.find(c => c.value === ticket.category)?.label || ticket.category}</span>
                        <span>•</span>
                        <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                    <div className="bg-slate-50 rounded-xl p-4 mb-3">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.description}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Created: {new Date(ticket.created_at).toLocaleString()}</span>
                      {ticket.updated_at && (
                        <span>Updated: {new Date(ticket.updated_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
