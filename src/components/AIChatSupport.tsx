import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ticketService } from '../lib/supportTicketService';
import { useToast } from './Toast';
import {
  Bot,
  Check,
  Copy,
  Globe,
  Headphones,
  Loader2,
  Mail,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

interface AIChatSupportProps {
  context?: 'freelancer' | 'client';
  title?: string;
  /** Explicit mode override — when set, this takes priority over the
   * auto-detection that derives chatMode from ticketContext.
   * 'assistant' → message storage key uses 'assistant'
   * 'support'   → message storage key uses 'support'
   * When omitted, chatMode = ticketContext ? 'support' : 'assistant'. */
  chatMode?: 'assistant' | 'support';
  ticketContext?: {
    category?: string;
    priority?: string;
    subject?: string;
    description?: string;
  };
}

export function AIChatSupport({ context = 'freelancer', title = 'AI Assistant', chatMode: explicitMode, ticketContext }: AIChatSupportProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  // Real-time model name — defaults to the configured model, updates live from
  // the AI stream (the edge function relays the actual model on first chunk).
  const [modelName, setModelName] = useState(() => (import.meta.env.VITE_AI_MODEL as string | undefined) || 'Growlancer AI');
  const toast = useToast();
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [verifyCta, setVerifyCta] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Chat persistence ──
  // Chat history is saved per-user in localStorage so it survives page
  // refreshes and browser restarts. On first visit we show a time-based greeting.
  //
  // KEY ISOLATION: AI Assistant and AI Support are DIFFERENT chats and must
  // never share history. The key includes both the role (freelancer/client)
  // and the mode (assistant vs support) so the two never cross-contaminate.
  const chatMode = explicitMode || (ticketContext ? 'support' : 'assistant');
  // Stable per-render key factory — deps are only the context/mode, so the
  // key never changes identity mid-chat and hooks deps stay clean.
  const CHAT_STORAGE_KEY = useCallback((uid: string) => `growlancer_ai_chat_v2_${context}_${chatMode}_${uid}`, [context, chatMode]);

  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem(CHAT_STORAGE_KEY(user.id));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Array<{
          id: string;
          role: 'user' | 'assistant';
          content: string;
          timestamp: string;
        }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp), isStreaming: false })));
          return; // history restored — skip the greeting
        }
      } catch {
        // corrupted history — fall through to greeting
      }
    }
    // ONE friendly welcome message on first visit — no time-of-day greetings
    const name = user.name || user.email?.split('@')[0] || 'there';
    const assistantLabel = chatMode === 'support' ? 'AI support assistant' : 'AI assistant';
    setMessages([
      {
        id: `greeting-${Date.now()}`,
        role: 'assistant',
        content: `Hi ${name}! 👋 I'm your Growlancer ${assistantLabel}. How can I help you today?`,
        timestamp: new Date(),
      },
    ]);
  }, [user, context, chatMode, CHAT_STORAGE_KEY]);

  // Persist chat history so it survives refreshes. When the chat is emptied
  // (e.g. every message deleted via selection), the saved key is removed so the
  // cleared history doesn't resurrect on the next page load.
  useEffect(() => {
    if (!user) return;
    try {
      if (messages.length === 0) {
        localStorage.removeItem(CHAT_STORAGE_KEY(user.id));
      } else {
        localStorage.setItem(CHAT_STORAGE_KEY(user.id), JSON.stringify(messages));
      }
    } catch {
      // storage unavailable — non-critical
    }
  }, [messages, user, context, chatMode, CHAT_STORAGE_KEY]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Chat management: clear chat / delete selected messages ──
  const handleToggleSelectionMode = () => {
    setSelectionMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const handleToggleMessageSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setMessages((prev) => prev.filter((m) => !selectedIds.has(m.id)));
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const handleClearAllChat = () => {
    setMessages([]);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setStreamingContent('');
    if (user) {
      try {
        localStorage.removeItem(CHAT_STORAGE_KEY(user.id));
      } catch {
        // non-critical
      }
    }
  };

  const getStreamingAIResponse = async (userMessage: string): Promise<void> => {
    if (!user?.id) return;

    const history = messages.slice(-8).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    history.push({ role: 'user', content: userMessage });

    try {
      const authResult = await supabase.auth.getSession();
      const session = authResult.data?.session ?? null;
      if (!session) throw new Error('Not authenticated');

      abortControllerRef.current = new AbortController();

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            user_id: user.id,
            user_role: context,
            messages: history,
            context: ticketContext ? {
              ticket_category: ticketContext.category,
              ticket_priority: ticketContext.priority,
              ticket_subject: ticketContext.subject,
              ticket_description: ticketContext.description,
              skills: [],
            } : undefined,
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to get AI response');
      }

      // Create a streaming message placeholder
      const assistantId = (Date.now() + 1).toString();
      const streamingMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };
      setMessages((prev) => [...prev, streamingMsg]);
      setStreamingContent('');

      // Read the stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          // Accept BOTH SSE ('data: {...}') and raw-JSON ('{...}') chunk formats
          const trimmed = line.trim();
          if (!trimmed || trimmed === '[DONE]') continue;
          const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
              if (parsed.model) {
                setModelName(parsed.model);
              }
              if (parsed.text) {
                fullContent += parsed.text;
                setStreamingContent(fullContent);

                // Update the message with current content for line-by-line effect
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                );
              }
              if (parsed.warning) {
                fullContent += `\n\n⚠️ ${parsed.warning}`;
                setStreamingContent(fullContent);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                );
              }
            } catch {
              // Skip malformed JSON
            }
        }
      }

      // Finalize the message
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: fullContent, isStreaming: false }
            : msg
        )
      );
      setStreamingContent('');

      // ⚠️ Usage is recorded SERVER-SIDE by the ai-assistant edge function (for
      // non-Pro users). Do NOT insert another usage_logs row here — that would
      // double-count free users and make them hit their monthly limit 2× fast.

    } catch (error: any) {
      if (error.name === 'AbortError') return; // User cancelled
      console.error('Error getting AI response:', error);
      toast.error('AI Error', 'Failed to get response. Please try again.');
      let errMsg = error.message || 'Something went wrong';
      if (/localhost|connection refused|econnrefused|fetch failed|temporarily unavailable/i.test(errMsg)) {
        errMsg = 'The AI service is temporarily unavailable. Please try again in a few moments.';
      }
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Sorry, I couldn't respond right now: ${errMsg}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setSelectionMode(false);
    setSelectedIds(new Set());

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    await getStreamingAIResponse(userMessage.content);

    setLoading(false);
  };

  // ── Resend the email verification link ──
  const handleResendVerification = async () => {
    if (!user?.email || resendingVerification) return;
    setResendingVerification(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
      if (error) throw error;
      toast.success('Verification Email Sent', 'Check your inbox (and spam folder) for the verification link.');
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `📧 **Verification email sent to ${user.email}.** Open the link in your inbox to verify, then come back and tap **Escalate to a Human** again — our team responds within 24 hours.`,
        timestamp: new Date(),
      }]);
    } catch (err) {
      console.error('Failed to resend verification:', err);
      toast.error('Failed', 'Could not resend the verification email. Please try again.');
    } finally {
      setResendingVerification(false);
    }
  };

  // ── Escalate to human ──
  const handleEscalate = async () => {
    if (!user || escalating) return;
    setEscalating(true);
    try {
      // ── Email-verified gate ──
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `⚠️ **Your session expired.** Please log in again and retry the escalation — your chat history is safe and nothing was lost.`,
          timestamp: new Date(),
        }]);
        return;
      }
      if (!authUser.email_confirmed_at) {
        setVerifyCta(true);
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `⚠️ **Email verification required.** To keep your account secure, please verify your email address before escalating to support. Tap **Verify Email & Resend Link** below — we'll send the verification link to ${authUser?.email || 'your inbox'} right away. Once verified, escalate again and our team will respond within 24 hours.`,
          timestamp: new Date(),
        }]);
        return;
      }

      // Create a support ticket with the chat transcript
      const transcript = messages.map(m => `[${m.role}] ${m.content}`).join('\n\n');
      const result = await ticketService.create({
        userId: user.id,
        userRole: context,
        subject: ticketContext?.subject || 'AI Chat Escalation',
        description: `Escalated from AI Chat Support.\n\nContext: ${context}\nCategory: ${ticketContext?.category || 'general'}\nPriority: ${ticketContext?.priority || 'normal'}\n\n--- Chat Transcript ---\n${transcript}`,
        category: ticketContext?.category as any,
        priority: ticketContext?.priority as any,
      });

      if (!result.success) throw new Error(result.error || 'Failed to create ticket');
      const ticketId = result.ticket?.id;

      // Send confirmation email via email-notifications edge function
      await supabase.functions.invoke('email-notifications', {
        body: {
          type: 'support_ticket_created',
          recipient_email: user.email,
          recipient_name: user.name || user.email?.split('@')[0] || 'User',
          subject: ticketContext?.subject || 'Support Request Received',
          ticket_id: ticketId,
        },
      });

      // Show confirmation in chat
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `✅ **Your request has been escalated!** Our support team will review it within 24 hours at your registered email.`,
        timestamp: new Date(),
      }]);
      setEscalated(true);
    } catch (err) {
      console.error('Failed to escalate:', err);
      toast.error('Escalation Failed', 'Could not create support ticket. Please try again or contact support directly.');
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I couldn't create a support ticket right now. Please try again later or contact support directly.`,
        timestamp: new Date(),
      }]);
    } finally {
      setEscalating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Format content with proper line breaks for streaming effect
  const formatContent = (content: string) => {
    // Split by double newlines for paragraphs
    const paragraphs = content.split('\n\n');
    return paragraphs.map((para, i) => {
      // Check if it's a bullet list
      if (para.includes('\n• ') || para.includes('\n- ')) {
        const lines = para.split('\n');
        return (
          <div key={i} className="mb-3 last:mb-0">
            {lines.map((line, j) => {
              if (line.startsWith('• ') || line.startsWith('- ')) {
                return (
                  <div key={j} className="flex items-start gap-2 ml-1 mb-1">
                    <span className="text-emerald-500 mt-1">•</span>
                    <span>{line.substring(2)}</span>
                  </div>
                );
              }
              if (line.startsWith('## ')) {
                return (
                  <h4 key={j} className="font-bold text-slate-800 mb-1 mt-2">
                    {line.substring(3)}
                  </h4>
                );
              }
              return (
                <p key={j} className="mb-1">
                  {line}
                </p>
              );
            })}
          </div>
        );
      }
      // Single line
      return (
        <p key={i} className="mb-2 last:mb-0">
          {para}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-blue-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <Bot className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">
                <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                  <Sparkles className="w-3 h-3" />
                  {modelName}
                </span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Any language
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={handleToggleSelectionMode}
                title={selectionMode ? 'Cancel selection' : 'Manage / clear chat'}
                className={`p-2 rounded-lg transition-colors ${
                  selectionMode
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ticket Context Banner */}
      {ticketContext && (
        <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-100">
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <span className="font-semibold">Assisting with ticket:</span>
            <span className="truncate">{ticketContext.subject}</span>
            <span className="px-1.5 py-0.5 bg-amber-100 rounded text-[10px] font-medium">
              {ticketContext.category}
            </span>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="p-4 bg-emerald-100 rounded-full w-16 h-16 mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-emerald-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Ask me anything</h4>
            <p className="text-sm text-slate-500">
              I can help in any language — English, Hindi, Spanish, and more.
              <br />
              {ticketContext
                ? `I'm here to help with your ${ticketContext.category} support request.`
                : `Ask me about ${context === 'freelancer' ? 'freelancing, projects, or career growth' : 'hiring, project management, or finding talent'}.`}
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 items-start ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {selectionMode && (
              <button
                onClick={() => handleToggleMessageSelection(message.id)}
                className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  selectedIds.has(message.id)
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'border-slate-300 hover:border-emerald-400'
                }`}
                title={selectedIds.has(message.id) ? 'Remove from selection' : 'Select message'}
              >
                {selectedIds.has(message.id) && <Check className="w-3 h-3" />}
              </button>
            )}
            {message.role === 'assistant' && (
              <div className="p-2 bg-emerald-100 rounded-xl self-start">
                <Bot className="w-4 h-4 text-emerald-600" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-900'
              }`}
            >
              {message.isStreaming && !message.content ? (
                <div className="flex gap-1 py-1">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-200" />
                </div>
              ) : (
                <div className="text-sm whitespace-pre-wrap">
                  {message.role === 'assistant' ? formatContent(message.content) : message.content}
                </div>
              )}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                <span className="text-[10px] opacity-70">
                  {message.isStreaming ? 'Typing...' : message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {!message.isStreaming && message.content && (
                  <button
                    onClick={() => handleCopy(message.content, message.id)}
                    className="opacity-70 hover:opacity-100 transition-opacity"
                  >
                    {copiedId === message.id ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
            </div>
            {message.role === 'user' && (
              <div className="p-2 bg-slate-200 rounded-xl self-start">
                <User className="w-4 h-4 text-slate-600" />
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Selection action bar */}
      {selectionMode && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-500">
            {selectedIds.size > 0
              ? `${selectedIds.size} message${selectedIds.size > 1 ? 's' : ''} selected`
              : 'Select messages to delete'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleSelectionMode}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Delete Selected
            </button>
            <button
              onClick={handleClearAllChat}
              className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 rounded-lg transition-colors"
            >
              Delete All
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-100 bg-slate-50">
        {/* Escalate to Human */}
        {!escalated && messages.length >= 2 && (
          <div className="mb-3">
            <button
              onClick={handleEscalate}
              disabled={escalating}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all disabled:opacity-50"
            >
              {escalating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Headphones className="w-4 h-4" />
              )}
              {escalating ? 'Escalating...' : 'Escalate to a Human'}
            </button>
          </div>
        )}
        {verifyCta && !escalated && (
          <div className="mb-3">
            <button
              onClick={handleResendVerification}
              disabled={resendingVerification}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-amber-300 bg-amber-50 rounded-xl text-xs font-medium text-amber-800 hover:bg-amber-100 transition-all disabled:opacity-50"
            >
              {resendingVerification ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              {resendingVerification ? 'Sending...' : 'Verify Email & Resend Link'}
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask me anything in any language..."
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
