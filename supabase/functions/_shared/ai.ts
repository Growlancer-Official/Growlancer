/**
 * Shared AI client for Growlancer edge functions — powered by Bytez
 * (https://api.bytez.com), an OpenAI-compatible model gateway.
 *
 * SECURITY: the API key is read from edge-function secrets ONLY (AI_API_KEY) —
 * it is never exposed to the frontend or committed to git. All AI features
 * (assistant, ticket responder, matching) call the OpenAI-compatible endpoint
 * (`/openai/v1/chat/completions`), so the payload shape stays OpenAI-standard
 * and works with any future provider that exposes the same contract.
 */
export const AI_BASE_URL = (
  Deno.env.get('AI_BASE_URL') ||
  'https://api.bytez.com/models/v2/openai/v1'
).replace(/\/+$/, '');

export const AI_API_KEY = Deno.env.get('AI_API_KEY') || '';

/** Default chat model. Bytez open models use the `org/name` identifier format
 *  (e.g. `deepseek-ai/DeepSeek-V3`). Override via the AI_MODEL secret — set it
 *  to the exact modelId provisioned for this account in the Bytez dashboard.
 *  IMPORTANT: the model MUST be added to the Bytez account (bytez.com -> Models)
 *  or the API returns "Model does not exist or has yet to be added to the
 *  Bytez catalog". */
export const AI_MODEL = Deno.env.get('AI_MODEL') || 'deepseek-ai/DeepSeek-V3';

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
  return await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}
