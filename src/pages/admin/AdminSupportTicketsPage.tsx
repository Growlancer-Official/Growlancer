import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { adminUpdate, adminInsert } from '../../lib/adminDataProxy';
import {
  Search, Loader2, RefreshCw, MessageSquare, User, Clock,
  Headphones, Send, X,
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
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets((data as unknown as SupportTicket[]) || []);
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // Real-time subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('admin-tickets-realtime-' + Date.now())
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'support_tickets' } as any, () => fetchTickets())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [fetchTickets]);

  const fetchTicketMessages = async (ticketId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('ticket_messages' as any)
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTicketMessages((data as unknown as TicketMessage[]) || []);
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

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setSendingReply(true);
    try {
      // Get admin's actual user ID so replies show as "Admin" not "User"
      const { data: { user } } = await supabase.auth.getUser();
      const adminUserId = user?.id || selectedTicket.user_id;

      const result = await adminInsert('ticket_messages', {
        ticket_id: selectedTicket.id,
        user_id: adminUserId,
        message: replyText.trim(),
        is_internal: false,
      });

      if ((result as { error?: string }).error) throw new Error((result as { error?: string }).error!);

      setReplyText('');
      await fetchTicketMessages(selectedTicket.id);

      // Auto-scroll to bottom after new message
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error('Error sending reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendReply();
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: string) => {
    setUpdatingId(ticketId);
    try {
      const result = await adminUpdate('support_tickets', ticketId, { status: newStatus, updated_at: new Date().toISOString() });

      if ((result as { error?: string }).error) throw new Error((result as { error?: string }).error!);
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
      case 'urgent': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'high': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'normal': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'open': return 'bg-emerald-500/10 text-emerald-400';
      case 'pending': return 'bg-amber-500/10 text-amber-400';
      case 'resolved': return 'bg-blue-500/10 text-blue-400';
      case 'closed': return 'bg-slate-500/10 text-slate-400';
      default: return 'bg-slate-500/10 text-slate-400';
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-0 flex flex-col h-full">
      <div>
        <h1 className="text-2xl font-bold text-white">Support Tickets</h1>
        <p className="text-slate-400 text-sm mt-1">Manage user support requests and escalations</p>
      </div>

      {/* Mobile: Back button + hide list when ticket selected */}
      {selectedTicket && (
        <div className="lg:hidden mb-3">
          <button
            onClick={() => { setSelectedTicket(null); setTicketMessages([]); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Tickets
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Tickets List - hidden on mobile when ticket selected */}
        <div className={`lg:col-span-1 rounded-[2rem] flex flex-col overflow-hidden ${selectedTicket ? 'hidden lg:flex' : 'flex'}`} style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="p-4 border-b border-white/5 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search tickets..."
                className="w-full pl-9 pr-4 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="flex gap-1 mt-3 flex-wrap">
              {['all', 'open', 'pending', 'resolved', 'closed'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-lg transition-all ${
                    filterStatus === s ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-white/5 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Headphones className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                <p className="text-sm">No tickets found</p>
              </div>
            ) : (
              filteredTickets.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => handleSelectTicket(ticket)}
                  className={`w-full text-left px-4 py-3.5 hover:bg-white/[0.02] transition-colors ${
                    selectedTicket?.id === ticket.id ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{ticket.subject}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{ticket.category} &bull; {ticket.user_role}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${getStatusBadge(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Ticket Detail */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          {selectedTicket ? (
            <div className="rounded-[2rem] overflow-hidden flex flex-col flex-1" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
              {/* Header */}
              <div className="p-6 border-b border-white/5 shrink-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-white break-words">{selectedTicket.subject}</h2>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-slate-500" /> {selectedTicket.user_id.slice(0, 8)}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5 text-slate-500" /> {selectedTicket.user_role}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-500" /> {new Date(selectedTicket.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {selectedTicket.status === 'open' && (
                      <button
                        onClick={() => handleStatusChange(selectedTicket.id, 'pending')}
                        disabled={updatingId === selectedTicket.id}
                        className="px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                      >
                        {updatingId === selectedTicket.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark Pending'}
                      </button>
                    )}
                    {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
                      <button
                        onClick={() => handleStatusChange(selectedTicket.id, 'resolved')}
                        disabled={updatingId === selectedTicket.id}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {updatingId === selectedTicket.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Resolve'}
                      </button>
                    )}
                    {selectedTicket.status === 'resolved' && (
                      <button
                        onClick={() => handleStatusChange(selectedTicket.id, 'closed')}
                        disabled={updatingId === selectedTicket.id}
                        className="px-3 py-1.5 bg-slate-600 text-white text-xs font-bold rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                      >
                        {updatingId === selectedTicket.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Close'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-full ${getStatusBadge(selectedTicket.status)}`}>
                    {selectedTicket.status}
                  </span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase ${getPriorityColor(selectedTicket.priority)}`}>
                    {selectedTicket.priority}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase" style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                    {selectedTicket.category}
                  </span>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto">
                {/* Description */}
                <div className="p-6 border-b border-white/5">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Description</h3>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed break-words">{selectedTicket.description}</p>
                </div>

                {/* Messages */}
                <div className="p-6 pb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Conversation</h3>
                  {loadingMessages ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
                  ) : ticketMessages.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">No messages yet on this ticket</p>
                  ) : (
                    <div className="space-y-4">
                      {ticketMessages.map(msg => {
                        return (
                          <div key={msg.id} className="p-4 rounded-xl" style={{ background: msg.is_internal ? 'rgba(245,158,11,0.05)' : 'rgba(255,255,255,0.03)', border: msg.is_internal ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                              <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: msg.is_internal ? '#f59e0b' : '#94a3b8' }}>
                                {msg.is_internal ? (
                                  <><X className="w-3 h-3" /> Internal Note</>
                                ) : msg.user_id === selectedTicket?.user_id ? (
                                  <><User className="w-3 h-3" /> User</>
                                ) : (
                                  <><Headphones className="w-3 h-3" /> Admin</>
                                )}
                              </span>
                              <span className="text-[10px] text-slate-500">{new Date(msg.created_at).toLocaleString()}</span>
                            </div>
                            <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">{msg.message}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Always render scroll anchor outside the conditional */}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Input */}
                <div className="px-6 pb-6 pt-2 shrink-0">
                  <div className="flex items-end gap-3 p-3 rounded-xl" style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your reply... (Ctrl+Enter to send)"
                      rows={3}
                      className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 resize-none focus:outline-none min-h-[44px] max-h-[120px]"
                      style={{ scrollbarWidth: 'thin' }}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={sendingReply || !replyText.trim()}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-all shrink-0"
                    >
                      {sendingReply ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[2rem] flex items-center justify-center flex-1 min-h-[300px]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <MessageSquare className="w-8 h-8 text-slate-600" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Select a Ticket</h3>
                <p className="text-sm text-slate-400">Choose a support ticket from the left to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
