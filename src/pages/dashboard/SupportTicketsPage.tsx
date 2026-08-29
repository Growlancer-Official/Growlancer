import { useState, useEffect, useCallback } from 'react';
import {
  Headphones, Plus, ChevronDown, ChevronUp, MessageSquare,
  Clock, CheckCircle2, AlertCircle, Send, LifeBuoy,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ticketService, type SupportTicket, type TicketCategory, type TicketPriority } from '../../lib/supportTicketService';
import { TipNote } from '../../components/TipNote';

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
      setSubmitError(result.error || 'Failed to create ticket. Please try again.');
    }
  }

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  const isFreelancer = user?.role === 'freelancer';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Headphones className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Support Tickets</h1>
            <p className="text-slate-500 text-sm">Get help from our support team</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-3 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Ticket
        </button>
      </div>

      {/* Tip */}
      <TipNote tone="info" compact>
        <strong>How it works:</strong> Submit a ticket and our team responds within 24 hours. For
        instant help with common questions, try the <strong>AI Assistant</strong> in your sidebar.
      </TipNote>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-xl font-bold text-slate-900">Create Support Ticket</h2>
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

              <div className="grid grid-cols-2 gap-4">
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

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting || !subject.trim() || !description.trim()}
                  className="inline-flex items-center gap-3 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Submit Ticket'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-3 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors"
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
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="w-16 h-16 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <LifeBuoy className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="font-display text-xl font-bold text-slate-900 mb-2">No tickets yet</h3>
          <p className="text-slate-500 mb-6 max-w-sm mx-auto">
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
        <div className="space-y-4">
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
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50/50 transition-colors"
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
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4">
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
