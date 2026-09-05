// ═══════════════════════════════════════════════════════════════════════════
// kyc-submit — real-time KYC engine entry point (freelancers AND clients)
//
// Flow: browser INSERTs its own PENDING row (RLS-enforced) → invokes this
// function → server resolves the pending row, verifies email, calls the
// REAL provider (Surepass PAN Comprehensive) server-side, decides
// verified/failed/review, updates the row (service role) → Supabase
// Realtime pushes the flip to the user's open page — no refresh.
//
// PROVIDER ABSTRACTION: KYCService → ProviderAdapter → provider HTTP API.
// Switching providers = add an adapter + flip KYC_PROVIDER env; nothing else
// changes.
//
// NO FAKE KYC: in production mode without a configured provider token the
// function NEVER marks anyone verified — it flags the row for review
// (fail-safe) and returns a friendly "temporarily unavailable" message.
//
// DEVELOPMENT MODE (two independent gates):
//   1. env-gated sandbox  — KYC_DEV_MODE=true + KYC_DEV_TOKEN=... + project
//      ref match (can never activate accidentally in production), provider
//      labelled 'dev-sandbox'.
//   2. DB-driven mode     — kyc_provider_config.mode='development', flipped
//      only by an admin RPC from the admin panel (audited). Same automated
//      engine, provider labelled 'dev_mode' so rows are honest and can be
//      re-verified against a real provider later. Production mode never
//      reaches this adapter.
//
// Idempotency: only rows in 'pending' are processed; decisions are written
// exactly once (status-guarded update), so repeated invokes cannot
// double-fire or resurrect a decided row.
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// ── Provider configuration (server-side secrets only) ──────────────────────
const KYC_PROVIDER = (Deno.env.get('KYC_PROVIDER') ?? 'surepass').toLowerCase();
const SUREPASS_BASE = Deno.env.get('SUREPASS_BASE_URL') ?? 'https://kyc-api.surepass.io/api/v1';
// Dev sandbox: ONLY when explicitly enabled AND on the dev project.
const KYC_DEV_MODE = Deno.env.get('KYC_DEV_MODE') === 'true';
const KYC_DEV_TOKEN = Deno.env.get('KYC_DEV_TOKEN') ?? '';
const DEV_PROJECT_REF = Deno.env.get('KYC_DEV_PROJECT_REF') ?? '';
const LIVE_PROJECT_REF = SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0];
const DEV_MODE_ACTIVE = KYC_DEV_MODE && KYC_DEV_TOKEN.length > 0 && LIVE_PROJECT_REF === DEV_PROJECT_REF && DEV_PROJECT_REF !== '';

const ROUTE = 'kyc-submit';
const RATE_LIMIT = 5; // submissions per window (provider calls cost money)
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const PROVIDER_TIMEOUT_MS = 20_000;

// Provider config resolution: admin-managed DB config (kyc_provider_config,
// set from the admin panel) wins for both token AND verification mode; the env
// secret stays as the fallback. This lets the founder rotate/enable the
// provider — or flip development mode — without a redeploy.
async function resolveProviderConfig(service: any): Promise<{
  token: string | null;
  mode: 'production' | 'development';
  source: 'database' | 'env' | 'none';
}> {
  try {
    const { data, error } = await service
      .from('kyc_provider_config')
      .select('api_token, mode')
      .eq('id', 1)
      .maybeSingle();
    if (!error && data) {
      const token = data?.api_token && String(data.api_token).trim().length > 0 ? String(data.api_token).trim() : null;
      const mode = data?.mode === 'development' ? 'development' : 'production';
      return { token, mode, source: 'database' };
    }
  } catch {
    // Table missing / RLS deny — fall through to env.
  }
  const envToken = Deno.env.get('SUREPASS_API_TOKEN') ?? '';
  return { token: envToken.trim() || null, mode: 'production', source: envToken ? 'env' : 'none' };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

// ── Rate limiting (DB-backed, same pattern as verify-document) ──────────────
async function checkRateLimit(client: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
  try { await client.rpc('cleanup_expired_rate_limits'); } catch { /* non-critical */ }

  const { count, error } = await client
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());
  if (error) return true;
  if (count !== null && count >= RATE_LIMIT) return false;

  await client.from('rate_limits').insert({ identifier, route: ROUTE, count: 1, window_start: now.toISOString() });
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider adapters — KYCService → ProviderAdapter → provider
// ═══════════════════════════════════════════════════════════════════════════
interface ProviderResult {
  outcome: 'verified' | 'failed' | 'review' | 'provider_error';
  provider_reference: string | null;
  failure_category: string | null;
  // Masked, non-sensitive metadata ONLY — never raw provider payloads,
  // never the full PAN. Stored on the row for support/audit.
  meta: Record<string, unknown>;
}

interface KycProviderAdapter {
  readonly name: string;
  verifyPan(input: { pan: string; fullName: string; dateOfBirth?: string | null; token: string }): Promise<ProviderResult>;
}

// ── Surepass PAN Comprehensive adapter (production) ─────────────────────────
// Endpoint: POST /pan-comprehensive/pan-comprehensive  { id_number: "PAN" }
// Sync government-DB response — no webhook dependency for the basic flow.
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, ' ').replace(/\s+/g, ' ').trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Token overlap handles middle-name/initial ordering differences.
  const ta = new Set(na.split(' ').filter(Boolean));
  const tb = new Set(nb.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size) >= 0.8;
}

function maskPan(pan: string): string {
  if (pan.length < 4) return '••••';
  return `${pan.slice(0, 2)}${'•'.repeat(Math.max(0, pan.length - 4))}${pan.slice(-2)}`;
}

const surepassAdapter: KycProviderAdapter = {
  name: 'surepass',
  async verifyPan({ pan, fullName, token }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const res = await fetch(`${SUREPASS_BASE}/pan-comprehensive/pan-comprehensive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ id_number: pan }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        return { outcome: 'provider_error', provider_reference: null, failure_category: 'rate_limited', meta: { http_status: 429 } };
      }
      if (res.status === 401 || res.status === 403) {
        // Credentials problem — NEVER fabricate a decision; flag for review.
        return { outcome: 'review', provider_reference: null, failure_category: 'provider_error', meta: { http_status: res.status } };
      }

      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        return { outcome: 'provider_error', provider_reference: null, failure_category: 'provider_error', meta: { http_status: res.status } };
      }

      const d = data?.data ?? {};
      const panStatus = String(d.pan_status ?? '').toLowerCase();
      const isValid = panStatus === 'valid' || d.valid === true;
      const registeredName = String(d.full_name ?? d.registered_name ?? '').trim();
      const ref: string | null = data?.transaction_id ?? data?.request_id ?? d.transaction_id ?? null;

      if (!isValid) {
        return {
          outcome: 'failed',
          provider_reference: ref,
          failure_category: 'invalid_pan',
          meta: { masked_pan: maskPan(pan), pan_status: panStatus || 'invalid' },
        };
      }

      // Name cross-check against the authoritative response.
      if (!namesMatch(fullName, registeredName)) {
        return {
          outcome: 'failed',
          provider_reference: ref,
          failure_category: 'name_mismatch',
          meta: { masked_pan: maskPan(pan), name_match: false },
        };
      }

      return {
        outcome: 'verified',
        provider_reference: ref,
        failure_category: null,
        meta: { masked_pan: maskPan(pan), name_match: true, pan_status: panStatus || 'valid' },
      };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      return {
        outcome: 'provider_error',
        provider_reference: null,
        failure_category: isTimeout ? 'provider_timeout' : 'provider_error',
        meta: { error: isTimeout ? 'timeout' : 'network' },
      };
    } finally {
      clearTimeout(timer);
    }
  },
};

// ── Dev sandbox adapter (env-gated; impossible to activate in production) ────
// Deterministic on the PAN's 4th character (the real holder-type digit —
// 'P' = individual): P → verified, F → failed, anything else → review.
// Labelled 'dev-sandbox' so no dev row can masquerade as a production verdict.
const devAdapter: KycProviderAdapter = {
  name: 'dev-sandbox',
  async verifyPan({ pan }) {
    const fourth = pan.charAt(3).toUpperCase();
    if (fourth === 'P') {
      return { outcome: 'verified', provider_reference: `dev_${crypto.randomUUID()}`, failure_category: null, meta: { mode: 'dev', masked_pan: maskPan(pan) } };
    }
    if (fourth === 'F') {
      return { outcome: 'failed', provider_reference: `dev_${crypto.randomUUID()}`, failure_category: 'invalid_pan', meta: { mode: 'dev', masked_pan: maskPan(pan) } };
    }
    return { outcome: 'review', provider_reference: null, failure_category: null, meta: { mode: 'dev' } };
  },
};

// ── DB-driven development-mode adapter (admin switch, audited) ──────────────
// Activated ONLY when kyc_provider_config.mode = 'development'. Deterministic
// automated verification: format + email-verified + duplicate checks still
// apply around it (handled by the caller), and every row is labelled
// provider='dev_mode' so it can never be confused with a real verdict — and
// can be re-verified against a real provider later. Production mode never
// reaches this adapter.
const devModeAdapter: KycProviderAdapter = {
  name: 'dev_mode',
  async verifyPan({ pan }) {
    return {
      outcome: 'verified',
      provider_reference: `dev_${crypto.randomUUID()}`,
      failure_category: null,
      meta: { mode: 'development', masked_pan: maskPan(pan), note: 'automated dev-mode verification (no external provider)' },
    };
  },
};

function getAdapter(token: string | null, dbDevMode: boolean): KycProviderAdapter | null {
  if (dbDevMode) return devModeAdapter;
  if (DEV_MODE_ACTIVE) return devAdapter;
  if (KYC_PROVIDER === 'surepass' && token) return surepassAdapter;
  return null; // No provider configured → fail safe (review), never a fake verdict
}

// ═══════════════════════════════════════════════════════════════════════════
// Duplicate-identity protection (privacy-preserving — server-side only)
// ═══════════════════════════════════════════════════════════════════════════
async function findDuplicateIdentity(
  service: any,
  userId: string,
  pan: string,
  fullName: string,
  dob: string | null
): Promise<string | null> {
  // (1) Document duplicate among VERIFIED rows of other users. document_hash
  //     is a GENERATED column on live = normalized document_number, so we
  //     compare against the same normalized value (never the raw PAN stored
  //     anywhere extra). The DB trigger kyc_reject_duplicate_identity is the
  //     authoritative guard; this is the friendly pre-flight check.
  const { data: panDup, error: panDupErr } = await service
    .from('identity_verifications')
    .select('user_id')
    .eq('status', 'verified')
    .neq('user_id', userId)
    .eq('document_hash', pan)
    .limit(1);
  if (!panDupErr && panDup && panDup.length > 0) return 'pan_reused';

  // (2) Name+DOB duplicate among VERIFIED rows of other users — the same
  //     strong same-person signal the DB guard uses, resolved server-side so
  //     the caller never learns who matched.
  if (fullName && dob) {
    const { data: nameRows, error: nameErr } = await service
      .from('identity_verifications')
      .select('user_id, date_of_birth')
      .eq('status', 'verified')
      .neq('user_id', userId)
      .ilike('full_name', fullName.trim())
      .limit(50);
    if (!nameErr && nameRows) {
      for (const r of nameRows) {
        if (r.date_of_birth && String(r.date_of_birth) === String(dob)) return 'identity_reused';
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════════════════
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    // ── Auth: caller must be an authenticated user (their own JWT) ─────────
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const verificationId: string | undefined = body?.verification_id;
    if (!verificationId || typeof verificationId !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'verification_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const service = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Load the row (ownership + state check) ─────────────────────────────
    const { data: row, error: rowError } = await service
      .from('identity_verifications')
      .select('*')
      .eq('id', verificationId)
      .single();

    if (rowError || !row) {
      return new Response(JSON.stringify({ success: false, error: 'Verification request not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (row.user_id !== user.id) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (row.status !== 'pending') {
      // Idempotent: already decided — return the current state honestly.
      return new Response(JSON.stringify({
        success: true,
        status: row.status,
        failure_category: row.failure_category ?? null,
        message: row.status === 'verified' ? 'Your identity has been verified.' : 'This verification has already been processed.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Email verification gate (real auth flag only — never client trust) ─
    if (!user.email_confirmed_at) {
      await service.from('identity_verifications').update({
        status: 'rejected',
        failure_category: 'email_unverified',
        rejection_reason: 'Please verify your email address before verifying your identity.',
        updated_at: new Date().toISOString(),
      }).eq('id', verificationId);
      return new Response(JSON.stringify({ success: false, status: 'rejected', error: 'Please verify your email address first, then try again.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Rate limit (per user; provider calls cost money) ───────────────────
    if (!(await checkRateLimit(service, user.id))) {
      await service.from('identity_verifications').update({
        status: 'rejected',
        failure_category: 'rate_limited',
        rejection_reason: 'Too many verification attempts. Please try again later.',
        updated_at: new Date().toISOString(),
      }).eq('id', verificationId);
      return new Response(JSON.stringify({ success: false, status: 'rejected', error: 'Too many attempts. Please try again in an hour.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── PAN-only automated engine; other documents → compliance review ─────
    if (row.document_type !== 'pan') {
      await service.from('identity_verifications').update({
        status: 'review',
        review_reason: 'Non-PAN document — routed to compliance review',
        updated_at: new Date().toISOString(),
      }).eq('id', verificationId);
      return new Response(JSON.stringify({ success: true, status: 'review', message: 'Your document has been queued for compliance review.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Input validation (format = initial gate, NOT the verdict) ──────────
    const rawPan = String(row.document_number ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const fullName = String(row.full_name ?? '').trim();
    const dob = row.date_of_birth ? String(row.date_of_birth) : null;

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(rawPan)) {
      await service.from('identity_verifications').update({
        status: 'rejected',
        failure_category: 'invalid_request',
        rejection_reason: 'The PAN number format looks incorrect. Please check and resubmit.',
        updated_at: new Date().toISOString(),
      }).eq('id', verificationId);
      return new Response(JSON.stringify({ success: false, status: 'rejected', error: 'That PAN number does not look valid. Please check it and try again.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!fullName) {
      await service.from('identity_verifications').update({
        status: 'rejected',
        failure_category: 'invalid_request',
        rejection_reason: 'Full name is required for PAN verification.',
        updated_at: new Date().toISOString(),
      }).eq('id', verificationId);
      return new Response(JSON.stringify({ success: false, status: 'rejected', error: 'Please enter your full name as printed on your PAN card.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Provider call (server-side; the token never leaves this function) ─
    const providerConfig = await resolveProviderConfig(service);
    const adapter = getAdapter(providerConfig.token, providerConfig.mode === 'development');
    let result: ProviderResult;
    if (adapter) {
      result = await adapter.verifyPan({ pan: rawPan, fullName, dateOfBirth: dob, token: providerConfig.token as string });
    } else {
      // Fail safe: no provider configured → REVIEW, never a fake verdict.
      result = { outcome: 'review', provider_reference: null, failure_category: 'provider_error', meta: { reason: 'provider_not_configured' } };
    }

    // ── Duplicate-identity protection BEFORE any verified write ────────────
    if (result.outcome === 'verified') {
      const dup = await findDuplicateIdentity(service, user.id, rawPan, fullName, dob);
      if (dup) {
        result = {
          outcome: 'failed',
          provider_reference: result.provider_reference,
          failure_category: 'duplicate_identity',
          meta: { ...result.meta, duplicate: true },
        };
      }
    }

    // ── Server-side decision write (idempotent, status-guarded) ────────────
    const nowIso = new Date().toISOString();
    const baseUpdate: Record<string, unknown> = {
      verification_provider: adapter ? adapter.name : 'unconfigured',
      provider_reference: result.provider_reference,
      failure_category: result.failure_category,
      verification_metadata: result.meta,
      updated_at: nowIso,
    };

    let decision: 'verified' | 'rejected' | 'review';
    if (result.outcome === 'verified') {
      decision = 'verified';
      baseUpdate.status = 'verified';
      baseUpdate.verified_at = nowIso;
      baseUpdate.failed_at = null;
      baseUpdate.rejection_reason = null;
      baseUpdate.rejection_count = 0;
      baseUpdate.blocked_until = null;
      baseUpdate.review_reason = null;
      // NOTE: document_hash is a GENERATED column on live (normalized
      // document_number) — never written from here; the DB trigger manages it.
    } else if (result.outcome === 'failed') {
      decision = 'rejected';
      baseUpdate.status = 'rejected';
      baseUpdate.failed_at = nowIso;
      baseUpdate.verified_at = null;
      baseUpdate.review_reason = null;
    } else {
      decision = 'review';
      baseUpdate.status = 'review';
      baseUpdate.review_reason = result.failure_category
        ? `Provider outcome: ${result.failure_category}`
        : 'Provider returned an ambiguous result — queued for compliance review';
      baseUpdate.verified_at = null;
      baseUpdate.failed_at = nowIso;
    }

    // Status-guarded update: only still-pending rows take the decision, so a
    // retry race can never double-apply or resurrect a decided row.
    const { data: updated, error: updateError } = await service
      .from('identity_verifications')
      .update(baseUpdate)
      .eq('id', verificationId)
      .eq('status', 'pending')
      .select()
      .single();

    if (updateError || !updated) {
      // Lost a race (already decided elsewhere) — return current state.
      const { data: current } = await service
        .from('identity_verifications')
        .select('status, failure_category')
        .eq('id', verificationId)
        .single();
      return new Response(JSON.stringify({ success: true, status: current?.status ?? 'pending', failure_category: current?.failure_category ?? null }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Immutable audit entry (no PAN, no raw provider payload) ────────────
    try {
      await service.from('payment_audit_logs').insert({
        user_id: user.id,
        actor_role: 'system',
        action: 'kyc_verification_attempt',
        entity_type: 'identity_verification',
        entity_id: verificationId,
        provider: adapter ? adapter.name : 'unconfigured',
        amount: 0,
        currency: 'INR',
        metadata: {
          outcome: decision,
          failure_category: result.failure_category,
          provider_reference: result.provider_reference,
          masked_pan: result.meta?.masked_pan ?? null,
        },
      });
    } catch {
      // Audit failure must never break the KYC decision.
    }

    // ── Friendly, non-technical response (realtime pushes the row flip) ────
    const friendly: Record<string, string> = {
      verified: 'Your identity has been verified.',
      rejected:
        result.failure_category === 'name_mismatch'
          ? 'The name you entered does not match the PAN record. Please check your name and try again.'
          : result.failure_category === 'duplicate_identity'
          ? 'This identity is already verified on another Growlancer account.'
          : 'Your identity could not be verified. Please check your information and try again.',
      review: 'Your verification needs a quick manual check. We will update you shortly.',
    };

    return new Response(JSON.stringify({
      success: true,
      status: decision,
      failure_category: result.failure_category,
      message: friendly[decision],
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('kyc-submit error:', err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({
      success: false,
      error: 'Verification is temporarily unavailable. Please try again shortly.',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
