import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY environment variable is not set');
}

const ALLOWED_ORIGINS = [
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
  'http://localhost:5173',
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name, x-admin-token',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

interface TicketData {
  ticket_id: string;
  user_id: string;
  user_role?: 'freelancer' | 'client';
  category: string;
  priority: string;
  subject: string;
  description: string;
}

const CATEGORY_PROMPTS: Record<string, string> = {
  general: 'Provide helpful general assistance and guidance about using the Growlancer platform.',
  billing: 'Address billing concerns, payment issues, or subscription questions. Explain how payments, escrow, and subscriptions work on Growlancer.',
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

async function generateAIReponse(ticket: TicketData): Promise<string | null> {
  // Fail fast if Gemini API key is not configured
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set. Cannot generate AI response.');
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

  const userMessage = `Subject: ${ticket.subject}\n\nDescription: ${ticket.description}\n\nPriority: ${ticket.priority}\n\n${priorityResponse}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: userMessage }],
            },
          ],
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', data);
      return null;
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.error('Error generating AI response:', error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify request is authorized (service role key)
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${supabaseServiceKey}`) {
      // Also allow authenticated user requests with their JWT
      const token = authHeader?.replace('Bearer ', '');
      if (token) {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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

    const { ticket_id, user_id, category, subject, description, priority } = body;

    if (!ticket_id || !user_id || !subject || !description) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: ticket_id, user_id, subject, description' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate AI response
    const aiResponse = await generateAIReponse({
      ticket_id,
      user_id,
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
