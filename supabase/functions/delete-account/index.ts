import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

// Storage objects cannot be deleted from SQL (Supabase blocks direct DML on
// storage.objects), so the delete-account flow removes them via the Storage
// API — best-effort, and never blocks the actual account deletion.
const USER_FOLDER_BUCKETS = [
  'avatars',
  'profile-pictures',
  'company-logos',
  'portfolio-images',
  'verification-documents',
  'certificate_documents',
  'internship_documents',
  'internship_resumes',
  'videos',
];

async function removeStoragePrefix(adminClient: any, bucket: string, prefix: string): Promise<void> {
  try {
    // Files inside the `{userId}/` folder
    const { data: files, error } = await adminClient.storage.from(bucket).list(prefix, { limit: 1000 });
    if (!error && Array.isArray(files)) {
      const paths = files
        .filter((f: any) => f && f.name && f.metadata !== null) // files only, skip folder entries
        .map((f: any) => `${prefix}/${f.name}`);
      if (paths.length > 0) {
        await adminClient.storage.from(bucket).remove(paths);
      }
    }
    // Root-level files keyed by the user id (e.g. `{userId}.png`) live OUTSIDE
    // the `{userId}/` folder — list the bucket root and remove those as well.
    const { data: rootFiles, error: rootError } = await adminClient.storage.from(bucket).list('', { limit: 1000 });
    if (!rootError && Array.isArray(rootFiles)) {
      const rootPaths = rootFiles
        .filter((f: any) => f && f.name && f.metadata !== null)
        .map((f: any) => f.name as string)
        .filter((name: string) => name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}_`));
      if (rootPaths.length > 0) {
        await adminClient.storage.from(bucket).remove(rootPaths);
      }
    }
  } catch {
    // best-effort — never block the account deletion
  }
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────
// delete-account is destructive. A stolen session could repeatedly call
// this to cause churn. Max 3 attempts per user per hour.
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 3600000;
const ROUTE = 'delete-account';

async function checkDeleteRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  try { await supabaseClient.rpc('cleanup_expired_rate_limits'); } catch { /* non-critical */ }
  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());
  if (error) return true;
  if (count !== null && count >= RATE_LIMIT_MAX) return false;
  await supabaseClient.from('rate_limits').insert({ identifier, route: ROUTE, count: 1, window_start: now.toISOString() });
  return true;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Build a user-level client to verify identity
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2b. Rate limit: max 3 delete attempts per user per hour
    const rateCheckClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const rateAllowed = await checkDeleteRateLimit(rateCheckClient, user.id);
    if (!rateAllowed) {
      return new Response(JSON.stringify({ error: 'Too many deletion attempts. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Build a service-role client to perform the actual deletion
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 4. Best-effort Storage cleanup — gather contract/dispute ids FIRST
    //    (the RPC deletes those rows), then remove the object files.
    try {
      const { data: contracts } = await adminClient
        .from('contracts')
        .select('id')
        .or(`freelancer_id.eq.${user.id},client_id.eq.${user.id}`);
      const { data: disputes } = await adminClient
        .from('disputes')
        .select('id')
        .or(`freelancer_id.eq.${user.id},client_id.eq.${user.id}`);

      for (const bucket of USER_FOLDER_BUCKETS) {
        await removeStoragePrefix(adminClient, bucket, user.id);
        // Verification docs live under `{userId}/verification-docs/` — clean
        // that nested folder too (storage.list only sees one level deep).
        if (bucket === 'verification-documents') {
          await removeStoragePrefix(adminClient, bucket, `${user.id}/verification-docs`);
        }
      }
      for (const c of (contracts ?? [])) {
        await removeStoragePrefix(adminClient, 'contract-files', c.id);
      }
      for (const d of (disputes ?? [])) {
        await removeStoragePrefix(adminClient, 'dispute-evidence', d.id);
      }
    } catch (err) {
      console.error('[delete-account] Storage cleanup failed (non-fatal):', err);
    }

    // 5. Call the SQL function that hard-deletes everything
    const { data, error } = await adminClient.rpc('delete_user_all_data', {
      p_user_id: user.id,
    });

    if (error) {
      console.error('[delete-account] RPC error:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!data?.success) {
      console.error('[delete-account] Deletion failed:', data?.error);
      return new Response(JSON.stringify({ success: false, error: data?.error ?? 'Unknown error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[delete-account] Exception:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
