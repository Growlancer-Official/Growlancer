import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { AI_API_KEY, callAI } from '../_shared/ai.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ─── OpenRouter AI — OpenAI-compatible endpoint ─────────────────────────────
// Base URL + key are read from secrets ONLY — never exposed to the frontend.
if (!AI_API_KEY) {
  console.error('AI_API_KEY is not configured in environment variables');
}

const ALLOWED_ORIGINS = [
  'https://growlancer-mrkhan154212s-projects.vercel.app',
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
  'http://localhost:5173',
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

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

// Rate limiting (abuse guard — not a monetization limit)
const ROUTE = 'ai-assistant';
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60000;

// Client AI is FREE FOR LIFETIME — this daily cap is fair-use abuse protection
// only (bots/cost explosion). NEVER an upsell: crossing it shows a friendly
// "resets tomorrow" message. Freelancers are not capped here (their AI writing
// is gated separately by ai-writer); this is a per-user-per-day abuse guard.
const CLIENT_DAILY_ROUTE = 'client-ai-daily';
const CLIENT_DAILY_LIMIT = 100;
const CLIENT_DAILY_WINDOW_MS = 86400000;

async function checkDailyLimit(
  supabaseClient: any,
  identifier: string,
  route: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; resetsInMs: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  try {
    await supabaseClient.rpc('cleanup_expired_rate_limits');
  } catch {
    // Non-critical
  }

  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', route)
    .gte('window_start', windowStart.toISOString());

  if (error) return { allowed: true, resetsInMs: 0 };
  if (count !== null && count >= limit) {
    return { allowed: false, resetsInMs: Math.max(0, windowMs - (Date.now() - windowStart.getTime())) };
  }

  await supabaseClient
    .from('rate_limits')
    .insert({ identifier, route, count: 1, window_start: now.toISOString() });

  return { allowed: true, resetsInMs: 0 };
}

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

/**
 * Growlancer earns ONLY a 5% platform commission on contracts.
 * AI assistant, chat and dedicated support are FREE for everyone —
 * no subscription gating, no monthly message caps.
 */
async function checkMessageLimit(): Promise<{ allowed: boolean; isPro: boolean; used: number; limit: number }> {
  return { allowed: true, isPro: true, used: 0, limit: 0 };
}

/** OpenAI-compatible message conversion for the AI endpoint. */
function convertToOpenAIMessages(
  messages: ChatMessage[],
  systemPrompt: string
): ChatMessage[] {
  const openAIMessages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    openAIMessages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
  }
  return openAIMessages;
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

  return sanitized.substring(0, 8000);
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
6. **Platform**: GROWLANCER connects freelancers with clients using AI-powered matching. The platform charges clients ZERO subscription fees — only a 5% commission on completed contracts. All AI features are free and unlimited.`;

  if (role === 'freelancer') {
    const ticketContext = context?.ticket_category
      ? `\n## Support Ticket Context\nThis user has an active support ticket:\n- Category: ${context.ticket_category}\n- Priority: ${context.ticket_priority || 'Normal'}\n- Subject: ${context.ticket_subject || 'N/A'}\n- Description: ${context.ticket_description || 'N/A'}\n\nPlease address their ticket-related concerns first before providing general assistance.`
      : '';

    const freelancerContext = context
      ? `\n## User Profile\n- Skills: ${context.skills?.join(', ') || 'Not specified'}\n- Hourly Rate: ₹${context.hourly_rate || 'Not specified'}/hr`
      : '';

    return `${basePrompt}\n\n${freelancerContext}\n${ticketContext}\n\n## Your Role: Freelancer Assistant\nYou help freelancers with:\n### 📋 Projects & Proposals\n- Finding projects that match their skills\n- Writing compelling proposals and cover letters\n- Suggesting appropriate rates based on market data\n\n### 📈 Profile Optimization\n- Improving their profile to attract more clients\n- Highlighting skills and experience effectively\n- Portfolio presentation tips\n\n### 💡 Best Practices\n- Client communication strategies\n- Time management and productivity\n- Building long-term client relationships\n- Escrow and payment processes\n\n### 🎯 Support\n- Answer questions about platform features\n- Help with technical issues\n- Guide through dispute resolution\n\nRemember: Be concise but thorough. Offer actionable advice.`;
  } else {
    const ticketContext = context?.ticket_category
      ? `\n## Support Ticket Context\nThis user has an active support ticket:\n- Category: ${context.ticket_category}\n- Priority: ${context.ticket_priority || 'Normal'}\n- Subject: ${context.ticket_subject || 'N/A'}\n- Description: ${context.ticket_description || 'N/A'}\n\nPlease address their ticket-related concerns first before providing general assistance.`
      : '';

    const clientContext = context
      ? `\n## User Profile\n- Recent Projects: ${context.recent_projects?.length || 0}\n- Active Contracts: ${context.active_contracts || 0}`
      : '';

    return `${basePrompt}\n\n${clientContext}\n${ticketContext}\n\n## Your Role: Client Assistant\nYou help clients with:\n### 📝 Project Management\n- Writing clear and professional project descriptions\n- Setting appropriate budgets for different work types\n- Defining clear project scopes and milestones\n\n### 👥 Hiring & Proposals\n- Evaluating freelancer proposals effectively\n- Conducting interviews and making hiring decisions\n- Understanding AI match scores and recommendations\n\n### 🤝 Contract Management\n- Managing milestones and deliverables\n- Escrow funding and payment processes\n- Effective communication with freelancers\n\n### 💡 Best Practices\n- Building long-term relationships with top freelancers\n- Giving constructive feedback and reviews\n- Resolving disputes professionally\n\nRemember: Be concise but thorough. Offer actionable advice.`;
  }
}



Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Fail closed: refuse requests when the AI key is not configured
  if (!AI_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI service is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ─── AUTHENTICATION (JWT required) ───
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user_id = authUser.id;

    let body: ChatRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { user_role, messages, context } = body;

    if (!user_role || !messages) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['freelancer', 'client'].includes(user_role)) {
      return new Response(JSON.stringify({ error: 'Invalid user_role' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // AI is FREE + UNLIMITED for everyone (no subscription gate)
    const { isPro } = await checkMessageLimit();

    // Rate limit check (per authenticated user — abuse guard)
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const identifier = user_id || clientIP;
    const rateAllowed = await checkRateLimit(supabase, identifier);
    if (!rateAllowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Client fair-use daily cap — free forever, abuse-protected. Friendly
    // message only; NEVER an upsell (clients are free for life).
    if (user_role === 'client') {
      const daily = await checkDailyLimit(
        supabase,
        identifier,
        CLIENT_DAILY_ROUTE,
        CLIENT_DAILY_LIMIT,
        CLIENT_DAILY_WINDOW_MS
      );
      if (!daily.allowed) {
        const hours = Math.ceil(daily.resetsInMs / 3600000);
        return new Response(JSON.stringify({
          error: `Fair usage limit reached — it resets ${hours > 0 ? `in about ${hours} hour${hours > 1 ? 's' : ''}` : 'tomorrow'}. AI stays free for you forever.`,
          code: 'fair_usage_limit',
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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

    // Convert to OpenAI-compatible format for the AI endpoint
    const openAIMessages = convertToOpenAIMessages(
      sanitizedMessages.slice(-10),
      systemPrompt
    );

    if (prefersStreaming) {
      // === STREAMING RESPONSE ===
      const aiResponse = await callAI(openAIMessages, { stream: true });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        return new Response(JSON.stringify({ error: `AI gateway error: ${errText.slice(0, 300)}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Stream the AI SSE response back to the client
      const stream = new ReadableStream({
        async start(controller) {
          const reader = aiResponse.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';
          let modelSent = false;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              // Parse SSE events (data: {...} or data: [DONE])
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const jsonStr = line.slice(5).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(jsonStr);
                  const text = parsed.choices?.[0]?.delta?.content || '';
                  if (text) {
                    // Proper SSE framing: 'data: ' prefix + blank-line terminator.
                    // The frontend parses lines starting with 'data: ' — WITHOUT
                    // the prefix the stream looked empty ("reply aaya but nothing
                    // showed").
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`)
                    );
                  }
                  // Relay the actual model name once (frontend shows it in real time)
                  if (!modelSent && parsed.model) {
                    modelSent = true;
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${JSON.stringify({ model: parsed.model })}\n\n`)
                    );
                  }
                } catch {
                  // Skip malformed JSON
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
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } else {
      // === NON-STREAMING RESPONSE ===
      const aiResponse = await callAI(openAIMessages, { stream: false });

      const data = await aiResponse.json().catch(() => ({}));

      if (!aiResponse.ok) {
        return new Response(
          JSON.stringify({ error: data?.error?.message || 'AI gateway error' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const assistantMessage =
        data.choices?.[0]?.message?.content ||
        'I apologize, but I could not generate a response. Please try again.';

      return new Response(
        JSON.stringify({
          success: true,
          message: assistantMessage,
          usage: { used: 0, limit: 0, isPro },
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('AI Assistant error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
