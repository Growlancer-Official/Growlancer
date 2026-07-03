import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  user_id: string;
  user_role: 'freelancer' | 'client';
  messages: ChatMessage[];
  context?: {
    skills?: string[];
    hourly_rate?: number;
    ticket_category?: string;
    ticket_priority?: string;
    ticket_subject?: string;
    ticket_description?: string;
    recent_projects?: any[];
    recent_proposals?: any[];
    active_contracts?: number;
  };
}

// Rate limiting
const ROUTE = 'ai-assistant';
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60000;

// Free plan message limit per month
const FREE_MESSAGE_LIMIT = 10;

async function checkRateLimit(
  supabaseClient: any,
  identifier: string
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);

  try {
    await supabaseClient.rpc('cleanup_expired_rate_limits');
  } catch {
    // Non-critical
  }

  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());

  if (error) return true;
  if (count !== null && count >= RATE_LIMIT) return false;

  await supabaseClient
    .from('rate_limits')
    .insert({ identifier, route: ROUTE, count: 1, window_start: now.toISOString() });

  return true;
}

async function checkMessageLimit(
  supabaseClient: any,
  userId: string
): Promise<{ allowed: boolean; isPro: boolean; used: number; limit: number }> {
  // Check subscription
  const { data: subscription } = await supabaseClient
    .from('subscriptions')
    .select('plan_id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'trial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let isPro = false;
  let messagesLimit = FREE_MESSAGE_LIMIT;

  if (subscription?.plan_id) {
    const { data: plan } = await supabaseClient
      .from('subscription_plans')
      .select('ai_messages_limit, ai_priority, name, price')
      .eq('id', subscription.plan_id)
      .single();

    if (plan) {
      messagesLimit = plan.ai_messages_limit ?? FREE_MESSAGE_LIMIT;
      isPro = plan.ai_priority || (plan.price ?? 0) > 0;
    }
  }

  if (isPro || messagesLimit >= 1000) {
    return { allowed: true, isPro: true, used: 0, limit: messagesLimit };
  }

  // Count usage this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: usageData } = await supabaseClient
    .from('usage_logs')
    .select('usage_count')
    .eq('user_id', userId)
    .eq('feature_type', 'ai_chat')
    .gte('created_at', startOfMonth.toISOString());

  const totalUsage = usageData?.reduce((sum: number, log: any) => sum + (log.usage_count || 0), 0) || 0;

  return {
    allowed: totalUsage < messagesLimit,
    isPro: false,
    used: totalUsage,
    limit: messagesLimit,
  };
}

function convertToGeminiMessages(
  messages: ChatMessage[],
  systemPrompt: string
): { contents: any[]; systemInstruction: any } {
  // Gemini uses 'user' and 'model' roles (not 'assistant')
  const contents: any[] = [];
  let lastRole = '';

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    const geminiRole = msg.role === 'assistant' ? 'model' : 'user';

    // Merge consecutive same-role messages
    if (geminiRole === lastRole && contents.length > 0) {
      contents[contents.length - 1].parts.push({ text: msg.content });
    } else {
      contents.push({
        role: geminiRole,
        parts: [{ text: msg.content }],
      });
      lastRole = geminiRole;
    }
  }

  return {
    contents,
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
  };
}

function sanitizeInput(input: string): string {
  const dangerousPatterns = [
    /ignore\s+(previous|all|above)\s+(instructions|prompts|rules)/gi,
    /system\s*:/gi,
    /assistant\s*:/gi,
    /<script/gi,
    /\$\{.*\}/g,
  ];

  let sanitized = input;
  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '[FILTERED]');
  }

  return sanitized.substring(0, 4000);
}

function buildSystemPrompt(
  role: 'freelancer' | 'client',
  context?: any
): string {
  const basePrompt = `You are **Growlancer AI** — a professional, multilingual AI assistant for the GROWLANCER freelancing platform. You help freelancers and clients with platform-related questions, project matching, profile optimization, and general freelancing advice.

## CRITICAL RULES:
1. **Language**: Respond in the SAME LANGUAGE the user wrote in. If they write in Hindi, respond in Hindi. If they write in English, respond in English. Support all languages.
2. **Format**: Keep responses concise and professional. Use bullet points and short paragraphs. Break long responses into clear sections.
3. **Tone**: Professional, helpful, and encouraging.
4. **Line-by-line**: Present information in digestible chunks. Use short paragraphs separated by blank lines.
5. **Honesty**: If you don't know something, say so. Don't make up information.
6. **Platform**: GROWLANCER connects freelancers with clients using AI-powered matching.`;

  if (role === 'freelancer') {
    const ticketContext = context?.ticket_category
      ? `\n## Support Ticket Context\nThis user has an active support ticket:\n- Category: ${context.ticket_category}\n- Priority: ${context.ticket_priority || 'Normal'}\n- Subject: ${context.ticket_subject || 'N/A'}\n- Description: ${context.ticket_description || 'N/A'}\n\nPlease address their ticket-related concerns first before providing general assistance.`
      : '';

    const freelancerContext = context
      ? `\n## User Profile\n- Skills: ${context.skills?.join(', ') || 'Not specified'}\n- Hourly Rate: $${context.hourly_rate || 'Not specified'}/hr`
      : '';

    return `${basePrompt}
\n${freelancerContext}
${ticketContext}

## Your Role: Freelancer Assistant
You help freelancers with:
### 📋 Projects & Proposals
- Finding projects that match their skills
- Writing compelling proposals and cover letters
- Suggesting appropriate rates based on market data

### 📈 Profile Optimization
- Improving their profile to attract more clients
- Highlighting skills and experience effectively
- Portfolio presentation tips

### 💡 Best Practices
- Client communication strategies
- Time management and productivity
- Building long-term client relationships
- Escrow and payment processes

### 🎯 Support
- Answer questions about platform features
- Help with technical issues
- Guide through dispute resolution

Remember: Be concise but thorough. Offer actionable advice.`;
  } else {
    const ticketContext = context?.ticket_category
      ? `\n## Support Ticket Context\nThis user has an active support ticket:\n- Category: ${context.ticket_category}\n- Priority: ${context.ticket_priority || 'Normal'}\n- Subject: ${context.ticket_subject || 'N/A'}\n- Description: ${context.ticket_description || 'N/A'}\n\nPlease address their ticket-related concerns first before providing general assistance.`
      : '';

    const clientContext = context
      ? `\n## User Profile\n- Recent Projects: ${context.recent_projects?.length || 0}\n- Active Contracts: ${context.active_contracts || 0}`
      : '';

    return `${basePrompt}
\n${clientContext}
${ticketContext}

## Your Role: Client Assistant
You help clients with:
### 📝 Project Management
- Writing clear and professional project descriptions
- Setting appropriate budgets for different work types
- Defining clear project scopes and milestones

### 👥 Hiring & Proposals
- Evaluating freelancer proposals effectively
- Conducting interviews and making hiring decisions
- Understanding AI match scores and recommendations

### 🤝 Contract Management
- Managing milestones and deliverables
- Escrow funding and payment processes
- Effective communication with freelancers

### 💡 Best Practices
- Building long-term relationships with top freelancers
- Giving constructive feedback and reviews
- Resolving disputes professionally

Remember: Be concise but thorough. Offer actionable advice.`;
  }
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let body: ChatRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { user_id, user_role, messages, context } = body;

    if (!user_id || !user_role || !messages) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!['freelancer', 'client'].includes(user_role)) {
      return new Response(JSON.stringify({ error: 'Invalid user_role' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check message limit (free vs pro)
    const { allowed, isPro, used, limit } = await checkMessageLimit(supabase, user_id);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: 'limit_reached',
          message: `You've used ${used} of ${limit} free AI messages this month. Upgrade to Pro for unlimited access.`,
          usage: { used, limit, isPro },
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Rate limit check
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const identifier = user_id || clientIP;
    const rateAllowed = await checkRateLimit(supabase, identifier);
    if (!rateAllowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if client wants streaming
    const acceptHeader = req.headers.get('accept') || '';
    const prefersStreaming = acceptHeader.includes('text/event-stream');

    // Sanitize messages
    const sanitizedMessages = messages.map((msg) => ({
      ...msg,
      content: sanitizeInput(msg.content),
    }));

    // Build system prompt
    const systemPrompt = buildSystemPrompt(user_role, context);

    // Convert to Gemini format
    const { contents, systemInstruction } = convertToGeminiMessages(
      sanitizedMessages.slice(-10),
      systemPrompt
    );

    // Prepare Gemini API payload
    const geminiPayload: any = {
      contents,
      systemInstruction,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 40,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    };

    if (prefersStreaming) {
      // === STREAMING RESPONSE ===
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      });

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        return new Response(JSON.stringify({ error: `Gemini API error: ${errText}` }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Log usage for non-Pro users
      if (!isPro) {
        await supabase.from('usage_logs').insert({
          user_id,
          feature_type: 'ai_chat',
          usage_count: 1,
          metadata: { role: user_role, context: context?.ticket_category || 'general' },
        });
      }

      // Stream the Gemini response back to the client
      const stream = new ReadableStream({
        async start(controller) {
          const reader = geminiResponse.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // Parse SSE events from Gemini
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr || jsonStr === '[DONE]') continue;

                  try {
                    const parsed = JSON.parse(jsonStr);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (text) {
                      controller.enqueue(new TextEncoder().encode(JSON.stringify({ text }) + '\n'));
                    }

                    // Check for safety ratings
                    const finishReason = parsed.candidates?.[0]?.finishReason;
                    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
                      controller.enqueue(
                        new TextEncoder().encode(JSON.stringify({ warning: `Response stopped: ${finishReason}` }) + '\n')
                      );
                    }
                  } catch {
                    // Skip malformed JSON
                  }
                }
              }
            }
          } catch (err) {
            console.error('Stream error:', err);
          } finally {
            reader.releaseLock();
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } else {
      // === NON-STREAMING RESPONSE ===
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      });

      const data = await geminiResponse.json();

      if (!geminiResponse.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message || 'Gemini API error' }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const assistantMessage =
        data.candidates?.[0]?.content?.parts?.[0]?.text || 'I apologize, but I could not generate a response. Please try again.';

      // Log usage for non-Pro users
      if (!isPro) {
        await supabase.from('usage_logs').insert({
          user_id,
          feature_type: 'ai_chat',
          usage_count: 1,
          metadata: { role: user_role, context: context?.ticket_category || 'general' },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: assistantMessage,
          usage: { used: used + 1, limit, isPro },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('AI Assistant error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
