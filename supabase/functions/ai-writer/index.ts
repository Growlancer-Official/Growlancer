import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { AI_API_KEY, callAI } from '../_shared/ai.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ─── Growlancer AI Writer ────────────────────────────────────────────────────
// Generates professional text (project title, project description, cover
// letter, service title/description) from a short "what do you want" input.
// - Requires an authenticated user (JWT)
// - Per-user DAILY allowance (freelancer writing): Free = 5/day, Pro = 100/day
// - CLIENT fields (project_title / project_description) are FREE for life per
//   the business model — they only get a generous fair-use abuse guard with a
//   NEUTRAL message (never "upgrade"), because clients must never see a paywall.
// - Rate limit data lives in the `rate_limits` table (window_start = UTC day)
// - AI key is read from secrets only — never exposed to the frontend

const FREE_DAILY_LIMIT = 5; // freelancer fields (service_*, cover_letter)
const PRO_DAILY_LIMIT = 100; // freelancer fields, Pro
const CLIENT_FAIR_USE_DAILY_LIMIT = 60; // client fields — abuse guard only
const ROUTE = 'ai-writer';
const MAX_INPUT_LEN = 2000;

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const FIELDS = [
  'project_title',
  'project_description',
  'cover_letter',
  'service_title',
  'service_description',
] as const;
type Field = (typeof FIELDS)[number];

// Fields a CLIENT uses when posting a project → free for life (fair-use guard
// only, never monetized, never an upgrade prompt).
const CLIENT_FIELDS = new Set<Field>(['project_title', 'project_description']);

interface WriterContext {
  budget?: number | string;
  category?: string;
  industry?: string;
  skills?: string[];
  deadline?: string;
  experience_level?: string;
  project_title?: string;
  project_description?: string;
  base_price?: number | string;
  extra_revision_price?: number | string;
  user_name?: string;
  freelancer_skills?: string[];
}

/** Field → (system prompt, what the model must return). */
function buildPrompt(field: Field, input: string, context: WriterContext = {}): { system: string; user: string } {
  const skills = Array.isArray(context.skills) && context.skills.length > 0
    ? context.skills.join(', ')
    : Array.isArray(context.freelancer_skills) && context.freelancer_skills.length > 0
      ? context.freelancer_skills.join(', ')
      : '';

  const commonRules = [
    'Respond in the SAME language the user wrote in (English, Hindi, Hinglish, etc.).',
    'Be professional, specific and concrete — never vague filler.',
    'Use plain text only — no markdown headers, no asterisks, no bullet symbols (use "- " only if a list is natural).',
    'Never invent facts (budgets, dates, features) that the user did not mention.',
    'Output ONLY the final text — no explanations, no preamble, no quotes around the whole thing.',
  ].join('\n');

  let system = '';
  let user = '';

  switch (field) {
    case 'project_title': {
      system = [
        'You are Growlancer AI, an expert at writing project titles for a freelancing marketplace.',
        'Write ONE catchy, professional, keyword-rich project title (max 80 characters).',
        'Make it instantly clear what the client wants to build.',
        'Do not use quotes, trailing punctuation or emojis.',
        commonRules,
      ].join('\n');
      user = `Here is what the client wants (write the title for this):\n"${input}"`;
      break;
    }
    case 'project_description': {
      system = [
        'You are Growlancer AI, an expert at writing project descriptions for a freelancing marketplace.',
        'Write a clear, professional project description (3-6 short paragraphs) that freelancers can immediately understand and bid on.',
        'Cover: the goal/what to build, key requirements and deliverables, any specific skills needed, and a short closing line inviting proposals.',
        'Keep it concise — a freelancer should grasp the whole scope in under 30 seconds.',
        commonRules,
      ].join('\n');
      user = `Here is what the client wants (write the description for this):\n"${input}"`;
      break;
    }
    case 'cover_letter': {
      system = [
        'You are Growlancer AI, an expert freelance proposal writer.',
        'Write ONE persuasive, professional cover message (2-4 short paragraphs) that a freelancer sends to a client when applying for a project.',
        'Make it personal and confident: quickly show understanding of the project, mention how the freelancer is a great fit, and end with a clear, friendly call to action.',
        'Never over-promise or invent skills the freelancer does not have.',
        commonRules,
      ].join('\n');
      user = `Write the cover message for this project:\nProject: ${context.project_title || 'N/A'}\nClient wants: ${context.project_description || input}\n\nFreelancer skills: ${skills || 'not provided'}\nBudget: ${context.budget ? `₹${context.budget}` : 'not specified'}`;
      break;
    }
    case 'service_title': {
      system = [
        'You are Growlancer AI, an expert at writing service titles for freelancers on a marketplace.',
        'Write ONE catchy, professional, keyword-rich service title (max 80 characters) starting with "I will" (e.g. "I will design a modern logo for your brand").',
        'Make it clear what the freelancer delivers and for whom.',
        'Do not use quotes, trailing punctuation or emojis.',
        commonRules,
      ].join('\n');
      user = `Here is what the freelancer offers (write the service title for this):\n"${input}"`;
      break;
    }
    case 'service_description': {
      system = [
        'You are Growlancer AI, an expert at writing service descriptions for freelancers on a marketplace.',
        'Write a clear, professional service description (3-5 short paragraphs) that makes clients want to buy.',
        'Cover: what the freelancer delivers, what the client will receive (the outcome), how the freelancer works, and a short closing line inviting the client to place an order.',
        'Keep it concise and benefit-focused.',
        commonRules,
      ].join('\n');
      user = `Here is what the freelancer offers (write the service description for this):\n"${input}"`;
      break;
    }
  }

  return { system, user };
}

/** Start-of-today (UTC) timestamp — the daily usage window. */
function todayStart(): string {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return start.toISOString();
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Fail closed: refuse when the AI key is not configured
  if (!AI_API_KEY) {
    return json(500, { error: 'AI service is not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ─── AUTHENTICATION (JWT required) ───
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser();
    if (authError || !authUser) {
      return json(401, { error: 'Unauthorized' });
    }
    const user_id = authUser.id;

    // ─── BODY ───
    let body: { field?: string; input?: string; context?: WriterContext };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const field = body?.field as Field | undefined;
    const input = (body?.input ?? '').trim();
    const context = body?.context ?? {};

    if (!field || !FIELDS.includes(field)) {
      return json(400, { error: 'Missing or invalid field. Allowed: ' + FIELDS.join(', ') });
    }
    if (!input) {
      return json(400, { error: 'Please describe what you want to generate.' });
    }
    if (input.length > MAX_INPUT_LEN) {
      return json(400, { error: `Input too long (max ${MAX_INPUT_LEN} characters).` });
    }

    // ─── PRO STATUS + ROLE (server-side; is_pro kept honest by trigger) ───
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, role')
      .eq('id', user_id)
      .maybeSingle();
    const isPro = !!profile?.is_pro;
    const role = profile?.role ?? 'freelancer';

    // Client AI features are FREE FOR LIFE (platform promise). Project fields
    // only get a generous fair-use abuse guard with neutral messaging — never
    // a monetized 5/day cap, never an "upgrade" prompt. Freelancer fields
    // (service title/description, cover letter) keep the 5/day ↔ Pro model.
    const clientFree = role === 'client' || CLIENT_FIELDS.has(field);
    const limit = clientFree
      ? CLIENT_FAIR_USE_DAILY_LIMIT
      : isPro
        ? PRO_DAILY_LIMIT
        : FREE_DAILY_LIMIT;

    // ─── DAILY USAGE (rate_limits, window = UTC day) ───
    const windowStart = todayStart();
    try {
      await supabase.rpc('cleanup_expired_rate_limits');
    } catch {
      // Non-critical
    }
    const { count, error: countError } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('identifier', user_id)
      .eq('route', ROUTE)
      .gte('window_start', windowStart);

    const used = count ?? 0;
    if (!countError && used >= limit) {
      return json(429, {
        error: clientFree ? 'fair_use_limit_reached' : 'daily_limit_reached',
        message: clientFree
          ? 'You have used a lot of AI today. Please try again in a little while.'
          : isPro
            ? 'Daily AI writing limit reached. Please try again tomorrow.'
            : `You have used all ${FREE_DAILY_LIMIT} free AI generations today. Upgrade to Pro for unlimited AI writing.`,
        isPro,
        used,
        limit,
        freeForClients: clientFree,
      });
    }

    const insertRes = await supabase
      .from('rate_limits')
      .upsert(
        { identifier: user_id, route: ROUTE, count: 1, window_start: windowStart },
        { onConflict: 'identifier,route,window_start' }
      );
    if (insertRes.error) {
      console.error('[ai-writer] usage insert failed:', insertRes.error.message);
    }

    // ─── GENERATE ───
    const { system, user } = buildPrompt(field, input, context);
    const response = await callAI(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 1500 }
    );

    if (!response.ok) {
      console.error('[ai-writer] AI call failed:', response.status, await response.text().catch(() => ''));
      return json(502, { error: 'AI generation failed. Please try again.' });
    }

    const data = await response.json();
    const text = (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) {
      return json(502, { error: 'AI returned an empty response. Please try again.' });
    }

    return json(200, { success: true, text, isPro, used: used + 1, limit, remaining: Math.max(0, limit - (used + 1)), freeForClients: clientFree });
  } catch (err) {
    console.error('[ai-writer] unexpected error:', err?.message || err);
    return json(500, { error: 'Something went wrong. Please try again.' });
  }
});
