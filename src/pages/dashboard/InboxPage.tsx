import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Briefcase, CheckCheck, ChevronDown, Clock, FileText, Filter, Inbox, List, Loader2, Mail, MessageSquare, MoreVertical, Paperclip, Search, Send, Type, User, View, X, XCircle,  } from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { messagesService, type Conversation, type MessageWithSender } from '../../lib/messages';
import { supabase } from '../../lib/supabase';

export function InboxPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageSize = 20;
  const pageRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Determine the correct workspace path based on user role
  const workspacePath = (contractId: string) =>
    user?.role === 'client'
      ? `/client/workspace/${contractId}`
      : `/dashboard/workspace?contract=${contractId}`;

  // Fetch conversations
  const fetchConversations = useCallback(async (loadMore = false) => {
    if (!user) return;
    if (loadMore) setLoadingMore(true);
    try {
      const currentPage = pageRef.current;
      const convs = await messagesService.getConversations(user.id, loadMore ? currentPage + 1 : undefined);
      if (loadMore) {
        setConversations(prev => [...prev, ...convs]);
        pageRef.current = currentPage + 1;
      } else {
        setConversations(convs);
        pageRef.current = 0;
      }
      setHasMore(convs.length === pageSize);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Subscribe to new messages
  useEffect(() => {
    if (!user) return;
    const sub = messagesService.subscribeToMessages(user.id, () => {
      fetchConversations();
      if (selectedContractId) {
        fetchMessages(selectedContractId);
      }
    });
    return () => { void sub.unsubscribe(); };
  }, [user, selectedContractId, fetchConversations]);

  // Fetch messages for selected contract
  const fetchMessages = useCallback(async (contractId: string) => {
    try {
      const msgs = await messagesService.getByContract(contractId);
      setMessages(msgs);
      // Mark as read
      if (user) {
        await messagesService.markContractAsRead(contractId, user.id);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  }, [user]);

  // Select a conversation
  const handleSelectConversation = async (contractId: string) => {
    setSelectedContractId(contractId);
    setMessages([]);
    await fetchMessages(contractId);
    // Update conversation list to reflect read status
    setConversations(prev =>
      prev.map(c =>
        c.contract_id === contractId ? { ...c, unread_count: 0 } : c
      )
    );
  };

  // Send a message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedContractId || !newMessage.trim() || sending) return;

    setSending(true);
    try {
      await messagesService.sendMessage(user.id, selectedContractId, newMessage.trim());
      setNewMessage('');
      await fetchMessages(selectedContractId);
      await fetchConversations();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Filter conversations by search
  const filteredConversations = conversations.filter(c =>
    c.last_message?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return <LoadingSkeleton variant="chat" />;
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inbox</h1>
          <p className="text-sm text-slate-500">Your messages across all contracts</p>
        </div>
      </div>

      <div className="flex-1 flex bg-white rounded-2xl border border-slate-100 overflow-hidden min-h-0 shadow-sm">
        {/* Conversations List */}
        <div className={`${selectedContractId ? 'hidden sm:flex' : 'flex'} w-full sm:w-72 md:w-80 lg:w-96 border-r border-slate-100 flex-col flex-shrink-0`}>
          {/* Search */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border-0 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:bg-white outline-none transition-all"
              />
            </div>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Inbox className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500">
                  {searchQuery ? 'No conversations match your search' : 'No conversations yet'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Messages will appear here when you have active contracts
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv.contract_id}
                    onClick={() => handleSelectConversation(conv.contract_id)}
                    className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors ${
                      selectedContractId === conv.contract_id ? 'bg-emerald-50/50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-5 h-5 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            Contract #{conv.contract_id.slice(0, 8)}
                          </p>
                          <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">
                            {formatTime(conv.last_message_at)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {conv.last_message || 'No messages yet'}
                        </p>
                        {conv.unread_count > 0 && (
                          <span className="inline-flex items-center justify-center mt-1.5 min-w-[18px] h-[18px] px-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Load More */}
          {filteredConversations.length > 0 && hasMore && (
            <div className="p-3 border-t border-slate-100">
              <button
                onClick={() => fetchConversations(true)}
                disabled={loadingMore}
                className="w-full py-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load More Conversations'}
              </button>
            </div>
          )}
        </div>

        {/* Chat Area */}
        {selectedContractId ? (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chat Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedContractId(null)}
                  className="lg:hidden p-1 -ml-1 text-slate-400 hover:text-slate-600"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Contract #{selectedContractId.slice(0, 8)}
                  </p>
                  <Link
                    to={workspacePath(selectedContractId)}
                    className="text-xs text-emerald-600 hover:underline"
                  >
                    View in Workspace
                  </Link>
                </div>
              </div>
              {/* 3-dots menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className={`p-2 rounded-lg transition-colors ${
                    menuOpen
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white rounded-xl border border-slate-200 shadow-xl py-1.5 animate-in fade-in slide-in-from-top-1">
                    {/* View Contract */}
                    <Link
                      to={`/dashboard/contracts`}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span>View Contract Details</span>
                    </Link>

                    {/* View in Workspace */}
                    <Link
                      to={workspacePath(selectedContractId)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Briefcase className="w-4 h-4 text-slate-400" />
                      <span>Open in Workspace</span>
                    </Link>

                    <div className="h-px bg-slate-100 my-1.5 mx-3" />

                    {/* Mark as Unread */}
                    <button
                      onClick={async () => {
                        setMenuOpen(false);
                        if (!selectedContractId || !user) return;
                        // Only flip is_read on the other party's messages
                        await supabase
                          .from('messages')
                          .update({ is_read: false })
                          .eq('contract_id', selectedContractId)
                          .neq('sender_id', user.id);
                        // Refresh conversations to reflect unread status
                        await fetchConversations();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span>Mark as Unread</span>
                    </button>

                    {/* Close Conversation */}
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setSelectedContractId(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      <XCircle className="w-4 h-4 text-slate-400" />
                      <span>Close Conversation</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-sm text-slate-400">No messages yet in this contract</p>
                  <p className="text-xs text-slate-300 mt-1">Send the first message to start the conversation</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                          isMine
                            ? 'bg-emerald-500 text-white rounded-br-md'
                            : 'bg-slate-50 text-slate-800 rounded-bl-md border border-slate-100'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <span className={`text-[10px] ${isMine ? 'text-white/60' : 'text-slate-400'}`}>
                            {msg.created_at
                              ? new Date(msg.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                          {isMine && (
                            <CheckCheck className={`w-3 h-3 ${msg.is_read ? 'text-blue-300' : 'text-white/40'}`} />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <form onSubmit={handleSend} className="px-4 py-3 border-t border-slate-100 bg-white">
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors flex-shrink-0"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <div className="flex-1 relative">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                    placeholder="Type your message..."
                    rows={1}
                    className="w-full px-4 py-2.5 bg-slate-50 border-0 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:bg-white outline-none transition-all resize-none max-h-32"
                    style={{ height: 'auto', minHeight: '42px' }}
                    onInput={(e) => {
                      const target = e.currentTarget;
                      target.style.height = 'auto';
                      target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sending}
                  className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {sending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex-1 hidden lg:flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Your Messages</h3>
              <p className="text-sm text-slate-500 max-w-xs">
                Select a conversation from the left to view and reply to messages
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}