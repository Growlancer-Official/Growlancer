import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ticketService } from '../lib/supportTicketService';
import {
  Bot,
  Check,
  Copy,
  Crown,
  Globe,
  Lock,
  Send,
  Sparkles,
  User,
  Zap,
  Headphones,
  Loader2,
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
  ticketContext?: {
    category?: string;
    priority?: string;
    subject?: string;
    description?: string;
  };
}

export function AIChatSupport({ context = 'freelancer', title = 'AI Assistant', ticketContext }: AIChatSupportProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [usageLimit, setUsageLimit] = useState({ used: 0, limit: 10, isPro: false });
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchUsage = async () => {
      try {
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select(`
            plan_id,
            status,
            subscription_plans (
              ai_messages_limit,
              ai_priority
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single();

        const { data: usage } = await supabase
          .from('usage_logs')
          .select('usage_count')
          .eq('user_id', user.id)
          .eq('feature_type', 'ai_chat')
          .gte('created_at', new Date(new Date().setDate(new Date().getDate() - 30)).toISOString());

        const totalUsage = usage?.reduce((sum, log) => sum + (log.usage_count || 0), 0) || 0;
        const limit = subscription?.subscription_plans?.ai_messages_limit || 10;
        const isPro = subscription?.subscription_plans?.ai_priority || false;

        setUsageLimit({ used: totalUsage, limit, isPro });
      } catch (error) {
        console.error('Error fetching usage:', error);
      }
    };

    fetchUsage();
  }, [user]);

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

  const getStreamingAIResponse = async (userMessage: string): Promise<void> => {
    if (!user?.id) return;

    const history = messages.slice(-8).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    history.push({ role: 'user', content: userMessage });

    try {
      const { data: { session } } = await supabase.auth.getSession();
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
        if (data.error === 'limit_reached') {
          setShowUpgrade(true);
          throw new Error(data.message || 'Usage limit reached');
        }
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);
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

      // Log usage
      await supabase.from('usage_logs').insert({
        user_id: user?.id,
        feature_type: 'ai_chat',
        usage_count: 1,
        metadata: { context, message_length: userMessage.length },
      });

      setUsageLimit((prev) => ({ ...prev, used: prev.used + 1 }));

    } catch (error: any) {
      if (error.name === 'AbortError') return; // User cancelled
      console.error('Error getting AI response:', error);
      const errMsg = error.message || 'Something went wrong';
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

    if (usageLimit.used >= usageLimit.limit && !usageLimit.isPro) {
      setShowUpgrade(true);
      return;
    }

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

  // ── Escalate to human ──
  const handleEscalate = async () => {
    if (!user || escalating) return;
    setEscalating(true);
    try {
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
                {usageLimit.isPro ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Crown className="w-3 h-3" />
                    Pro Plan — Unlimited
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    {usageLimit.used}/{usageLimit.limit} messages this month
                  </span>
                )}
                <span className="mx-2 text-slate-300">·</span>
                <span className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Any language
                </span>
              </p>
            </div>
          </div>
          {usageLimit.used >= usageLimit.limit && !usageLimit.isPro && (
            <button
              onClick={() => setShowUpgrade(true)}
              className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Upgrade
            </button>
          )}
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
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
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

      {/* Input */}
      <div className="p-4 border-t border-slate-100 bg-slate-50">
        {showUpgrade && (
          <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-xl">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-orange-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-slate-900 text-sm">Usage limit reached</h4>
                <p className="text-xs text-slate-600 mt-1">
                  You've used {usageLimit.used} of {usageLimit.limit} free messages. Upgrade to Pro for unlimited AI conversations.
                </p>
                <button
                  onClick={() => window.location.href = context === 'client' ? '/client/ai-subscription' : '/dashboard/ai-subscription'}
                  className="mt-2 px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-lg hover:bg-orange-700 transition-colors"
                >
                  View Plans
                </button>
              </div>
            </div>
          </div>
        )}
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
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask me anything in any language..."
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
            disabled={loading || (usageLimit.used >= usageLimit.limit && !usageLimit.isPro)}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim() || (usageLimit.used >= usageLimit.limit && !usageLimit.isPro)}
            className="px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
