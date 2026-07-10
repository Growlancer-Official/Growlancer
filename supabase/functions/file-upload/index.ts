// File Upload Edge Function
// Handles file uploads to Supabase Storage for workspace deliverables
// Supports real-time file tracking and secure uploads

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

// Rate limiting constants (DB-backed via rate_limits table)
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60000;
const ROUTE = 'file-upload';

// DB-backed rate limit check (persists across cold starts)
async function checkRateLimit(supabaseClient: any, identifier: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);

  // Clean up expired records first (best-effort)
  try {
    await supabaseClient.rpc('cleanup_expired_rate_limits');
  } catch {
    // Non-critical; continue
  }

  // Count requests in the current window
  const { count, error } = await supabaseClient
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', identifier)
    .eq('route', ROUTE)
    .gte('window_start', windowStart.toISOString());

  if (error) {
    // Fallback: allow if table doesn't exist yet
    return true;
  }

  if (count !== null && count >= RATE_LIMIT) {
    return false;
  }

  // Record this request
  await supabaseClient
    .from('rate_limits')
    .insert({
      identifier,
      route: ROUTE,
      count: 1,
      window_start: now.toISOString(),
    });

  return true;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      console.error('File-upload: Auth failed', userError?.message || 'No user');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check rate limit (DB-backed, using user ID as identifier)
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';
    const identifier = user.id || clientIP;
    const allowed = await checkRateLimit(supabaseClient, identifier);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many upload requests' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { method } = req

    if (method === 'POST') {
      const formData = await req.formData()
      const file = formData.get('file') as File
      const contractId = formData.get('contract_id') as string
      const description = formData.get('description') as string

      if (!file) {
        return new Response(
          JSON.stringify({ error: 'No file provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!contractId) {
        return new Response(
          JSON.stringify({ error: 'Contract ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return new Response(
          JSON.stringify({ error: 'File size exceeds 50MB limit' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        return new Response(
          JSON.stringify({ error: 'File type not allowed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify user has access to the contract
      const { data: contract, error: contractError } = await supabaseClient
        .from('contracts')
        .select('freelancer_id, client_id')
        .eq('id', contractId)
        .single()

      if (contractError || !contract) {
        return new Response(
          JSON.stringify({ error: 'Contract not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (contract.freelancer_id !== user.id && contract.client_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'You do not have access to this contract' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${contractId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseClient
        .storage
        .from('deliverables')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        throw uploadError
      }

      // Get public URL
      const { data: { publicUrl } } = supabaseClient
        .storage
        .from('deliverables')
        .getPublicUrl(fileName)

      // Create file record in database
      const { data: fileRecord, error: fileError } = await supabaseClient
        .from('contract_files')
        .insert({
          contract_id: contractId,
          uploaded_by: user.id,
          file_name: file.name,
          file_path: fileName,
          file_size: file.size,
          file_type: file.type,
          public_url: publicUrl,
          description: description || null,
        })
        .select()
        .single()

      if (fileError) {
        // Rollback storage upload if database insert fails
        await supabaseClient.storage.from('deliverables').remove([fileName])
        throw fileError
      }

      return new Response(
        JSON.stringify({
          success: true,
          file: fileRecord,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (method === 'GET') {
      const url = new URL(req.url)
      const contractId = url.searchParams.get('contract_id')

      if (!contractId) {
        return new Response(
          JSON.stringify({ error: 'Contract ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify access
      const { data: contract, error: contractError } = await supabaseClient
        .from('contracts')
        .select('freelancer_id, client_id')
        .eq('id', contractId)
        .single()

      if (contractError || !contract) {
        return new Response(
          JSON.stringify({ error: 'Contract not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (contract.freelancer_id !== user.id && contract.client_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'You do not have access to this contract' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get files for contract
      const { data: files, error } = await supabaseClient
        .from('contract_files')
        .select('*')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false })

      if (error) {
        throw error
      }

      return new Response(
        JSON.stringify({ files }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (method === 'DELETE') {
      const { fileId } = await req.json()

      if (!fileId) {
        return new Response(
          JSON.stringify({ error: 'File ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get file record
      const { data: fileRecord, error: fileError } = await supabaseClient
        .from('contract_files')
        .select('*')
        .eq('id', fileId)
        .single()

      if (fileError || !fileRecord) {
        return new Response(
          JSON.stringify({ error: 'File not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify ownership
      if (fileRecord.uploaded_by !== user.id) {
        return new Response(
          JSON.stringify({ error: 'You can only delete files you uploaded' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Delete from storage
      const { error: storageError } = await supabaseClient
        .storage
        .from('deliverables')
        .remove([fileRecord.file_path])

      if (storageError) {
        throw storageError
      }

      // Delete from database
      const { error: deleteError } = await supabaseClient
        .from('contract_files')
        .delete()
        .eq('id', fileId)

      if (deleteError) {
        throw deleteError
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('File upload error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
