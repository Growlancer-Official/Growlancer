import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AI_API_KEY, AI_MODEL, AI_BASE_URL } from '../_shared/ai.ts';

// ─── OpenRouter AI — OpenAI-compatible endpoint ─────────────────────────────
// Base URL + key from secrets ONLY — never exposed to the frontend.
if (!AI_API_KEY) {
  console.error('AI_API_KEY environment variable is not set');
}

// ── Prompt-injection defense (same defang as ai-assistant) ──────────────────
// Ticket subject/description are attacker-controlled (any logged-in user can
// open a ticket), so they must never reach the model verbatim. Strip common
// jailbreak markers and truncate length before the content is used.
/**
 * Hardened input sanitizer — blocks prompt-injection attempts.
 * Returns [UNSAFE_INPUT] if the message is an obvious attack.
 */
function sanitizeInput(input: string): string {
  const blocked = [
    /^\s*(ignore|disregard|forget)\s+(all|previous|above|prior|your)\s+(instructions|prompts?|rules?|guidelines?|context|system)/i,
    /^\s*(you are|you're)\s+now\s+(a|an|the)/i,
    /^\s*(new|override|replace)\s+(system|instruction|prompt)/i,
    /^\s*(act|behave|pretend|roleplay)\s+(as|like|to be)\s+(a|an|the)/i,
    /<\s*(system|assistant|admin)\s*>/i,
    /\[system\s*\]/i,
    /\bDAN\b.*\bmode\b/i,
    /\bjailbreak\b/i,
    /\bprompt\s+injection\b/i,
  ];
  for (const re of blocked) {
    if (re.test(input)) return '[UNSAFE_INPUT — prompt injection blocked]';
  }

  let cleaned = input
    .replace(/^(system|assistant|user|admin|growlancer|AI)\s*:\s*/gi, '')
    .replace(/```[\s\S]*?```/g, '[code block removed]')
    .replace(/<script[\s\S]*?<\/script>/gi, '[script removed]')
    .replace(/\$\{[^}]*\}/g, '[template removed]');

  return cleaned.substring(0, 8000);
}

// Rate limiting — every call costs a credit on the gateway, so unthrottled
// loops are a direct cost-abuse vector. DB-backed via rate_limits table.
const ROUTE = 'ai-ticket-responder';
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60000;

async function checkRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);

  try { await supabaseClient.rpc('cleanup_expired_rate_limits'); } catch { /* non-critical */ }

  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());

  if (error) return true; // allow if table doesn't exist yet
  if (count !== null && count >= RATE_LIMIT) return false;

  await supabaseClient
    .from('rate_limits')
    .insert({ identifier, route: ROUTE, count: 1, window_start: now.toISOString() });

  return true;
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

interface TicketData {
  ticket_id: string;
  user_role?: 'freelancer' | 'client';
  category: string;
  priority: string;
  subject: string;
  description: string;
}

const CATEGORY_PROMPTS: Record<string, string> = {
  general: 'Provide helpful general assistance and guidance about using the Growlancer platform.',
  billing: 'Address billing concerns, payment issues, or subscription questions. Explain how payments, escrow, and the 5% platform commission work on Growlancer.',
  account: 'Help with account-related issues such as login problems, profile setup, verification, and account settings.',
  technical: 'Provide technical support for platform features, troubleshooting steps, and guidance on using Growlancer tools and functionalities.',
  dispute: 'Explain the dispute resolution process on Growlancer, how to open a dispute, what information is needed, and how disputes are resolved.',
  feature_request: 'Acknowledge the feature request positively, explain how the team reviews suggestions, and ask for any additional details if needed.',
  other: 'Provide general assistance and route the user to the appropriate resources or team members.',
};

const PRIORITY_RESPONSES: Record<string, string> = {
  low: 'We will address this at our earliest convenience. Here is some information to help you in the meantime.',
  normal: 'Here is some information to help with your query.',
  high: 'We understand this is important to you. Here is immediate assistance and information.',
  urgent: 'We recognize the urgency of your request. Here is priority assistance and steps we are taking to resolve this quickly.',
};

async function generateAIResponse(ticket: TicketData): Promise<string | null> {
  // Fail fast if the gateway key is not configured
  if (!AI_API_KEY) {
    console.error('AI_API_KEY is not set. Cannot generate AI response.');
    return null;
  }

  const categoryGuidance = CATEGORY_PROMPTS[ticket.category] || CATEGORY_PROMPTS.general;
  const priorityResponse = PRIORITY_RESPONSES[ticket.priority] || PRIORITY_RESPONSES.normal;

  const systemPrompt = `You are a professional AI support agent for GROWLANCER, a freelancing platform.

Your task is to respond to a support ticket helpfully and professionally.

## Response Format Requirements:
1. **Professional greeting** — Thank the user for reaching out
2. **Acknowledge the issue** — Show you understand their problem
3. **Provide helpful information** — Offer specific guidance based on the ticket category
4. **Clear next steps** — Tell the user what they can do next or what to expect
5. **Professional closing** — Offer further assistance

## Style Guidelines:
- Use a warm but professional tone
- Keep paragraphs short (2-3 sentences max)
- Use bullet points for steps or lists
- Respond in the SAME LANGUAGE as the user's description
- Be empathetic and understanding
- Don't make up specific information about the user's account

## Category-specific guidance:
${categoryGuidance}`;

  const userMessage = `Subject: ${sanitizeInput(ticket.subject)}\n\nDescription: ${sanitizeInput(ticket.description)}\n\nPriority: ${ticket.priority}\n\n${priorityResponse}`;

  try {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 8192,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('AI API error:', data?.error || data);
      return null;
    }

    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('Error generating AI response:', error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Standard JWT auth — use anon key + user's Authorization header
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('AI Ticket: Auth failed', userError?.message || 'No user');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit check (per authenticated user — gateway cost abuse guard)
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const identifier = user.id || clientIP;
    const allowed = await checkRateLimit(supabase, identifier);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: TicketData;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { ticket_id, category, subject, description, priority } = body;

    if (!ticket_id || !subject || !description) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: ticket_id, subject, description' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // ── Ownership check ──────────────────────────────────────────────────────
    // The caller's identity is ALWAYS the authenticated user.id (never trusted
    // from the body). The AI may only respond to the caller's OWN tickets — or
    // any ticket if the caller is an admin.
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('user_id')
      .eq('id', ticket_id)
      .maybeSingle();

    if (ticketError || !ticket) {
      return new Response(JSON.stringify({ error: 'Ticket not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const isAdmin = callerProfile?.role === 'admin';
    if (ticket.user_id !== user.id && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: this ticket does not belong to you' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate AI response (caller identity always comes from the session)
    const aiResponse = await generateAIResponse({
      ticket_id,
      user_id: user.id,
      user_role: body.user_role || 'freelancer',
      category: category || 'general',
      priority: priority || 'normal',
      subject,
      description,
    });

    if (!aiResponse) {
      // Fallback response if AI fails
      const fallbackResponse = `Thank you for reaching out to Growlancer Support. 

We have received your ticket regarding "${subject}" and our team will review it shortly. 

Here's what to expect:
• Our support team typically responds within 24 hours
• You'll receive a notification when we update your ticket
• You can add more information to this ticket at any time

If you need immediate assistance, please visit our Help Center or try asking our AI Assistant for quick answers to common questions.

Best regards,
Growlancer Support Team`;

      // Create the fallback message
      const { error: msgError } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id,
          user_id: '00000000-0000-0000-0000-000000000000', // System user
          message: fallbackResponse,
          is_internal: false,
        });

      if (msgError) {
        return new Response(JSON.stringify({ error: 'Failed to create message' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update ticket status
      await supabase
        .from('support_tickets')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', ticket_id);

      return new Response(
        JSON.stringify({
          success: true,
          auto_responded: true,
          fallback: true,
          message: fallbackResponse,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the AI response message in the ticket
    const { error: msgError } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id,
        user_id: '00000000-0000-0000-0000-000000000000', // System/AI user
        message: aiResponse,
        is_internal: false,
      });

    if (msgError) {
      return new Response(JSON.stringify({ error: 'Failed to create message' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update ticket status to 'pending' (awaiting user response)
    await supabase
      .from('support_tickets')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', ticket_id);

    return new Response(
      JSON.stringify({
        success: true,
        auto_responded: true,
        message: aiResponse,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('AI Ticket Responder error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
