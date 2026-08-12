// ═══════════════════════════════════════════════════════════════
// verify-document — AI-powered document verification
//
// Uses a vision-capable model (gpt-4o-mini) via OpenRouter to:
// 1. Check if the uploaded document image is clear / readable
// 2. OCR-extract the full name, date of birth, and document number
// 3. Compare extracted values against the user-entered details
// 4. Return a structured verification result
//
// Called from the frontend BEFORE submitting to identity_verifications.
// Result is shown in real time so the user knows immediately whether
// their document was accepted, needs a clearer photo, or was rejected
// due to a detail mismatch.
// ═══════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface VerifyRequest {
  image_url: string;
  back_image_url?: string;
  full_name: string;
  date_of_birth: string;
  document_number: string;
  document_type: string;
}

interface VerifyResponse {
  success: boolean;
  image_clear: boolean;
  clarity_issue: string | null;
  extracted_name: string | null;
  extracted_dob: string | null;
  extracted_number: string | null;
  name_match: boolean | null;
  dob_match: boolean | null;
  number_match: boolean | null;
  verification_result: 'verified' | 'rejected' | 'unclear_image';
  error?: string;
}

const AI_API_KEY = Deno.env.get('AI_API_KEY') || '';
// Use a vision-capable model for document OCR
const VISION_MODEL = 'openai/gpt-4o-mini';
const AI_BASE_URL = Deno.env.get('AI_BASE_URL') || 'https://openrouter.ai/api/v1';

// Rate limiting — every call costs a credit on the AI gateway, so unthrottled
// loops are a direct cost-abuse vector. DB-backed via rate_limits table.
const ROUTE = 'verify-document';
const RATE_LIMIT = 10;
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

// ── SSRF guard ──────────────────────────────────────────────────────────────
// The image must come from the user's OWN private verification-documents bucket
// on THIS Supabase project — never an arbitrary external URL (which would let a
// caller make the edge function fetch internal/cloud-metadata endpoints).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';

function isOwnStorageUrl(url: string, userId: string): boolean {
  try {
    const parsed = new URL(url);
    const projectUrl = new URL(SUPABASE_URL);

    // Host must match this Supabase project exactly.
    if (parsed.hostname !== projectUrl.hostname) return false;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

    // Path must go through the storage API and the verification-documents bucket.
    const path = parsed.pathname;
    if (!path.includes('/storage/v1/object/')) return false;

    // Find the bucket segment, then require the IMMEDIATELY FOLLOWING segment
    // to be the caller's user id. This matches the bucket RLS policy
    // (storage.foldername(name))[1] = auth.uid()) and handles BOTH path forms:
    //   /storage/v1/object/sign/{bucket}/{userId}/...    (signed URL)
    //   /storage/v1/object/public/{bucket}/{userId}/...  (public URL)
    // segments: [storage, v1, object, sign|public, bucket, userId, verification-docs, file]
    // ─── FIX (2026-08-12) ───
    // The old code compared segments[3] === 'verification-documents' and
    // segments[4] === userId, but for signed URLs there is an extra 'sign'
    // segment at index 3 — the bucket actually sits at index 4 and the user id
    // at index 5. Every signed URL therefore FAILED the check and verification
    // returned 500 "Image URL must be from your own private verification-documents
    // storage" even for perfectly valid, freshly uploaded images.
    const segments = path.split('/').filter(Boolean);
    const bucketIndex = segments.indexOf('verification-documents');
    if (bucketIndex < 0) return false;
    if (segments.length < bucketIndex + 2) return false;
    return segments[bucketIndex + 1] === userId;
  } catch {
    return false;
  }
}

async function fetchImageAsBase64(url: string, userId: string): Promise<string> {
  if (!isOwnStorageUrl(url, userId)) {
    throw new Error('Image URL must be from your own private verification-documents storage');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const mimeType = blob.type || 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

serve(async (req: Request) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    // ── Auth: the caller must be an authenticated Growlancer user ──────────
    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({
        success: false,
        image_clear: false,
        clarity_issue: null,
        extracted_name: null,
        extracted_dob: null,
        extracted_number: null,
        name_match: null,
        dob_match: null,
        number_match: null,
        verification_result: 'rejected',
        error: 'Unauthorized',
      } as VerifyResponse), { status: 401, headers });
    }

    // ── Rate limit (per user — AI vision calls cost money) ────────────────
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const identifier = user.id || clientIP;
    const allowed = await checkRateLimit(supabase, identifier);
    if (!allowed) {
      return new Response(JSON.stringify({
        success: false,
        image_clear: false,
        clarity_issue: null,
        extracted_name: null,
        extracted_dob: null,
        extracted_number: null,
        name_match: null,
        dob_match: null,
        number_match: null,
        verification_result: 'rejected',
        error: 'Too many verification attempts. Please try again in a minute.',
      } as VerifyResponse), { status: 429, headers });
    }

    const body: VerifyRequest = await req.json();
    const { image_url, back_image_url, full_name, date_of_birth, document_number, document_type } = body;

    if (!image_url || !full_name || !date_of_birth || !document_number || !document_type) {
      return new Response(JSON.stringify({
        success: false,
        image_clear: false,
        clarity_issue: 'Missing required fields',
        extracted_name: null,
        extracted_dob: null,
        extracted_number: null,
        name_match: null,
        dob_match: null,
        number_match: null,
        verification_result: 'rejected',
        error: 'All fields are required: image_url, full_name, date_of_birth, document_number, document_type',
      } as VerifyResponse), { status: 400, headers });
    }

    // Fetch the uploaded document image and convert to base64 (SSRF-guarded)
    const imageBase64 = await fetchImageAsBase64(image_url, user.id);

    // Build the prompt — includes explicit JSON output format + document-specific rules
    const docLabel = document_type.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    const prompt = `You are an AI document verification system for an Indian freelancing platform.
You will analyze the uploaded image of an identity document and extract information.

DOCUMENT TYPE: ${docLabel}
USER-ENTERED DETAILS:
- Full Name: ${full_name}
- Date of Birth: ${date_of_birth}
- Document Number: ${document_number}

YOUR TASKS:
1. CLARITY CHECK — Is the image clear enough to read text? Check for:
   - Blurriness or motion blur
   - Bad lighting (too dark, washed out, glare/reflection)
   - Text partially cut off / cropped
   - Low resolution where text is illegible
   If the image is NOT clear, set image_clear=false and describe the issue.
2. OCR EXTRACTION — Read the document and extract:
   - The person's FULL NAME as shown on the document
   - DATE OF BIRTH (in YYYY-MM-DD format)
   - DOCUMENT NUMBER (alphanumeric, without spaces)
3. DETAIL MATCHING — Compare each extracted field with the user-entered value:
   - Names: compare case-insensitively, ignore extra spaces/hyphens
   - DOB: compare in YYYY-MM-DD format
   - Document number: compare case-insensitively, ignore spaces/hyphens
4. VERIFICATION:
   - If image is NOT clear → verification_result = "unclear_image"
   - If image IS clear but details DON'T match → verification_result = "rejected"
   - If image IS clear AND all details match → verification_result = "verified"

Respond ONLY with a valid JSON object, nothing else:
{
  "image_clear": true/false,
  "clarity_issue": "description of issue or null",
  "extracted_name": "Name from document or null",
  "extracted_dob": "YYYY-MM-DD or null",
  "extracted_number": "Document number or null",
  "name_match": true/false,
  "dob_match": true/false,
  "number_match": true/false,
  "verification_result": "verified|rejected|unclear_image"
}`;

    // Build the messages — image as base64 for vision model
    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: prompt },
          {
            type: 'image_url' as const,
            image_url: { url: imageBase64, detail: 'high' },
          },
        ],
      },
    ];

    // If there's a back image, add it as a second image (SSRF-guarded)
    if (back_image_url) {
      const backBase64 = await fetchImageAsBase64(back_image_url, user.id);
      messages[0].content.push({
        type: 'image_url' as const,
        image_url: { url: backBase64, detail: 'high' },
      });
      messages[0].content.push({
        type: 'text' as const,
        text: 'The second image above is the BACK side of the same document. Use it for additional verification if needed (e.g. expiry date, address).',
      });
    }

    // Call OpenRouter with the vision model
    const aiResponse = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages,
        max_tokens: 500,
        temperature: 0.1, // low temperature for deterministic output
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`AI API error (${aiResponse.status}): ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    // Parse the JSON from the response (handle markdown code blocks)
    let jsonStr = content.trim();
    // Strip markdown code fences if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const result = JSON.parse(jsonStr);

    // Validate the parsed response has expected fields
    const response: VerifyResponse = {
      success: true,
      image_clear: result.image_clear === true,
      clarity_issue: result.clarity_issue || null,
      extracted_name: result.extracted_name || null,
      extracted_dob: result.extracted_dob || null,
      extracted_number: result.extracted_number || null,
      name_match: result.name_match === true,
      dob_match: result.dob_match === true,
      number_match: result.number_match === true,
      verification_result: result.verification_result || 'rejected',
    };

    return new Response(JSON.stringify(response), { status: 200, headers });
  } catch (err) {
    console.error('verify-document error:', err);
    return new Response(JSON.stringify({
      success: false,
      image_clear: false,
      clarity_issue: null,
      extracted_name: null,
      extracted_dob: null,
      extracted_number: null,
      name_match: null,
      dob_match: null,
      number_match: null,
      verification_result: 'rejected',
      error: err instanceof Error ? err.message : 'Internal server error',
    } as VerifyResponse), { status: 500, headers });
  }
});