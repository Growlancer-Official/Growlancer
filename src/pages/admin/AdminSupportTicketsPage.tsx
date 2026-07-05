import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { adminUpdate } from '../../lib/adminDataProxy';
import {
  Search, Loader2, RefreshCw, MessageSquare, User, Mail, AlertTriangle,
  CheckCircle2, Clock, Filter, ChevronDown, ChevronUp, Eye, X,
  Headphones, ArrowUpRight,
} from 'lucide-react';

interface SupportTicket {
  id: string;
  user_id: string;
  user_role: 'freelancer' | 'client';
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
}

export function AdminSupportTicketsPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data as SupportTicket[] || []);
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const fetchTicketMessages = async (ticketId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTicketMessages(data as TicketMessage[] || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSelectTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    await fetchTicketMessages(ticket.id);
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    setUpdatingId(ticketId);
    try {
      const result = await adminUpdate({
        table: 'support_tickets',
        values: { status: newStatus, updated_at: new Date().toISOString() },
        filters: { id: ticketId },
      });

      if (result.error) throw new Error(result.error);
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus as SupportTicket['status'], updated_at: new Date().toISOString() } : t));
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(prev => prev ? { ...prev, status: newStatus as SupportTicket['status'] } : null);
      }
    } catch (err) {
      console.error('Error updating ticket:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.subject.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    }
    return true;
  });

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'urgent': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'normal': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'open': return 'bg-emerald-100 text-emerald-700';
      case 'pending': return 'bg-amber-100 text-amber-700';
      case 'resolved': return 'bg-blue-100 text-blue-700';
      case 'closed': return 'bg-slate-100 text-slate-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Support Tickets</h1>
          <p className="text-slate-500 mt-1">Manage user support requests and escalations</p>
        </div>
        <button
          onClick={fetchTickets}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tickets List */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tickets..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border-0 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
              />
            </div>
            <div className="flex gap-1 mt-3">
              {['all', 'open', 'pending', 'resolved', 'closed'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg capitalize ${
                    filterStatus === s ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Headphones className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="text-sm">No tickets found</p>
              </div>
            ) : (
              filteredTickets.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => handleSelectTicket(ticket)}
                  className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors ${
                    selectedTicket?.id === ticket.id ? 'bg-emerald-50/50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{ticket.subject}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{ticket.category} • {ticket.user_role}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${getStatusBadge(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Ticket Detail */}
        <div className="lg:col-span-2">
          {selectedTicket ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              {/* Header */}
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-slate-900">{selectedTicket.subject}</h2>
                    <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1"><User className="w-4 h-4" /> {selectedTicket.user_id.slice(0, 8)}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" /> {selectedTicket.user_role}</span>
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {new Date(selectedTicket.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedTicket.status === 'open' && (
                      <button
                        onClick={() => handleStatusChange(selectedTicket.id, 'pending')}
                        disabled={updatingId === selectedTicket.id}
                        className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
                      >
                        {updatingId === selectedTicket.id ? '...' : 'Mark Pending'}
                      </button>
                    )}
                    {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
                      <button
                        onClick={() => handleStatusChange(selectedTicket.id, 'resolved')}
                        disabled={updatingId === selectedTicket.id}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {updatingId === selectedTicket.id ? '...' : 'Resolve'}
                      </button>
                    )}
                    {selectedTicket.status === 'resolved' && (
                      <button
                        onClick={() => handleStatusChange(selectedTicket.id, 'closed')}
                        disabled={updatingId === selectedTicket.id}
                        className="px-3 py-1.5 bg-slate-600 text-white text-xs font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50"
                      >
                        {updatingId === selectedTicket.id ? '...' : 'Close'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadge(selectedTicket.status)}`}>
                    {selectedTicket.status}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getPriorityColor(selectedTicket.priority)}`}>
                    {selectedTicket.priority}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                    {selectedTicket.category}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="p-6 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-700 mb-2">Description</h3>
                <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{selectedTicket.description}</p>
              </div>

              {/* Messages */}
              <div className="p-6">
                <h3 className="text-sm font-bold text-slate-700 mb-4">Conversation</h3>
                {loadingMessages ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></div>
                ) : ticketMessages.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No messages yet on this ticket</p>
                ) : (
                  <div className="space-y-4">
                    {ticketMessages.map(msg => (
                      <div key={msg.id} className={`p-4 rounded-xl ${msg.is_internal ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50 border border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-slate-500">
                            {msg.is_internal ? '🔒 Internal Note' : `User #${msg.user_id.slice(0, 8)}`}
                          </span>
                          <span className="text-[10px] text-slate-400">{new Date(msg.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center h-[400px]">
              <div className="text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Select a Ticket</h3>
                <p className="text-sm text-slate-500">Choose a support ticket from the left to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
