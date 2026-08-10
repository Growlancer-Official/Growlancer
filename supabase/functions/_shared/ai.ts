/**
 * Shared AI client for Growlancer edge functions — powered by OpenRouter
 * (https://openrouter.ai), an OpenAI-compatible model gateway.
 *
 * SECURITY: the API key is read from edge-function secrets ONLY (AI_API_KEY) —
 * it is never exposed to the frontend or committed to git. All AI features
 * (assistant, ticket responder, matching) call the OpenAI-compatible endpoint
 * (`/api/v1/chat/completions`), so the payload shape stays OpenAI-standard
 * and works with any provider that exposes the same contract.
 */
export const AI_BASE_URL = (
  Deno.env.get('AI_BASE_URL') ||
  'https://openrouter.ai/api/v1'
).replace(/\/+$/, '');

export const AI_API_KEY = Deno.env.get('AI_API_KEY') || '';

/** Default chat model. OpenRouter slugs use the `vendor/model` format
 *  (e.g. `deepseek/deepseek-chat-v3-0324`). Override via the AI_MODEL secret. */
export const AI_MODEL = Deno.env.get('AI_MODEL') || 'deepseek/deepseek-chat-v3-0324';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Call the OpenAI-compatible chat completions endpoint. */
export async function callAI(
  messages: AIMessage[],
  options: { stream?: boolean; maxTokens?: number } = {}
): Promise<Response> {
  const body: Record<string, unknown> = {
    model: AI_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: options.maxTokens ?? 8192,
    top_p: 0.95,
  };
  if (options.stream) {
    body.stream = true;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${AI_API_KEY}`,
  };
  // OpenRouter best-practice attribution headers (harmless for other gateways)
  if (AI_BASE_URL.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://growlancer.vercel.app';
    headers['X-Title'] = 'Growlancer AI';
  }

  return await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
