/**
 * Shared Gemini (Google AI) client for Growlancer edge functions.
 *
 * SECURITY: the API key is read from edge-function secrets ONLY
 * (GEMINI_API_KEY) — it is never exposed to the frontend or committed to git.
 * All AI features (assistant, ticket responder, matching) go through this
 * OpenAI-compatible endpoint, so the payload shape stays identical.
 */
export const GEMINI_BASE_URL = (
  Deno.env.get('GEMINI_BASE_URL') ||
  'https://generativelanguage.googleapis.com/v1beta/openai'
).replace(/\/+$/, '');

export const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';

/** Default model. `gemini-2.0-flash` is the fast, stable, widely-available
 *  model (gemini-2.5-flash was retired for new keys — Google returns 404 for
 *  it). Env override allowed for A/B testing. */
export const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash';

export interface GeminiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Call the Gemini OpenAI-compatible endpoint. */
export async function callGemini(
  messages: GeminiMessage[],
  options: { stream?: boolean; maxTokens?: number } = {}
): Promise<Response> {
  const body: Record<string, unknown> = {
    model: GEMINI_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: options.maxTokens ?? 8192,
    top_p: 0.95,
  };
  if (options.stream) {
    body.stream = true;
  }
  return await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}
