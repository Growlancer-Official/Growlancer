// Invoice Edge Function
// Renders a print-ready HTML invoice for a given invoice id.
// Opens in the browser → print/save as PDF. Returns 403 for non-participants.
//
//   GET /functions/v1/invoice?id=<invoice_id>            → HTML (print-friendly)
//   GET /functions/v1/invoice?id=<invoice_id>&format=json → JSON payload

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://growlancer-mrkhan154212s-projects.vercel.app',
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
  'http://localhost:5173',
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmt(n: number | string | null | undefined, currency: string): string {
  const v = Number(n || 0)
  const cur = ['INR', 'USD', 'EUR', 'GBP'].includes(currency) ? currency : 'INR'
  return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(v)
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const invoiceId = url.searchParams.get('id')
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: 'Missing invoice id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // RLS on invoices allows participants + admins — the query enforces access
    const { data: invoice, error: invoiceError } = await supabaseClient
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const [clientRes, freelancerRes] = await Promise.all([
      supabaseClient.from('profiles').select('name, email').eq('id', invoice.client_id).maybeSingle(),
      supabaseClient.from('profiles').select('name, email').eq('id', invoice.freelancer_id).maybeSingle(),
    ])

    const client = clientRes.data || {}
    const freelancer = freelancerRes.data || {}

    if (url.searchParams.get('format') === 'json') {
      return new Response(JSON.stringify({ invoice, client, freelancer }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const currency: string = invoice.currency || 'INR'
    const statusBadge = invoice.status === 'paid'
      ? '<span style="background:#d1fae5;color:#065f46;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase">Paid</span>'
      : `<span style="background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase">${esc(invoice.status)}</span>`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Invoice ${esc(invoice.invoice_number)} — Growlancer</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f1f5f9; color: #0f172a; padding: 40px 16px; }
  .sheet { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(15,23,42,.08); }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 40px 40px 24px; border-bottom: 1px solid #e2e8f0; }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -.5px; }
  .brand span { color: #059669; }
  .inv-no { font-size: 13px; color: #64748b; margin-top: 4px; }
  .body { padding: 32px 40px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 32px; }
  .meta h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; margin-bottom: 6px; }
  .meta p { font-size: 14px; font-weight: 600; color: #0f172a; }
  .meta small { display: block; font-size: 12px; color: #64748b; font-weight: 400; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
  td.num, th.num { text-align: right; }
  .totals { margin-left: auto; width: 320px; }
  .totals .row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 14px; color: #475569; }
  .totals .row.total { border-top: 2px solid #059669; margin-top: 8px; padding-top: 14px; font-weight: 800; font-size: 17px; color: #0f172a; }
  .totals .row.fee { color: #059669; font-weight: 600; }
  .foot { padding: 20px 40px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #059669; color: #fff; border: 0; padding: 12px 22px; border-radius: 12px; font-weight: 700; font-size: 14px; cursor: pointer; box-shadow: 0 8px 20px rgba(5,150,105,.35); }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border-radius: 0; } .print-btn { display: none; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Download PDF</button>
  <div class="sheet">
    <div class="head">
      <div>
        <div class="brand">Grow<span>lancer</span></div>
        <div class="inv-no">Invoice ${esc(invoice.invoice_number)}</div>
      </div>
      ${statusBadge}
    </div>
    <div class="body">
      <div class="meta">
        <div>
          <h4>Billed To (Client)</h4>
          <p>${esc(client.name || 'Client')}</p>
          <small>${esc(client.email || '')}</small>
        </div>
        <div>
          <h4>Payment To (Freelancer)</h4>
          <p>${esc(freelancer.name || 'Freelancer')}</p>
          <small>${esc(freelancer.email || '')}</small>
        </div>
        <div>
          <h4>Issued</h4>
          <p>${esc(new Date(invoice.issued_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))}</p>
          <small>Payment via ${esc(invoice.payment_method || 'razorpay')}</small>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Description</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>${esc(invoice.project_title || 'Contract work')}</strong><br /><span style="font-size:12px;color:#64748b">Escrow release · contract ${esc(invoice.contract_id || '')}</span></td><td class="num">${fmt(invoice.subtotal, currency)}</td></tr>
        </tbody>
      </table>

      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${fmt(invoice.subtotal, currency)}</span></div>
        <div class="row fee"><span>Growlancer Platform Fee (5%)</span><span>- ${fmt(invoice.platform_fee, currency)}</span></div>
        <div class="row"><span>Freelancer Net</span><span>${fmt(invoice.freelancer_amount, currency)}</span></div>
        <div class="row total"><span>Total Billed</span><span>${fmt(invoice.total, currency)}</span></div>
      </div>
    </div>
    <div class="foot">
      <span>Growlancer — AI-Powered Freelancing Marketplace</span>
      <span>Invoice ${esc(invoice.invoice_number)} · ${esc(new Date(invoice.issued_at).getFullYear())}</span>
    </div>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error) {
    console.error('Invoice function error:', error)
    return new Response(JSON.stringify({ error: 'Failed to load invoice' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
