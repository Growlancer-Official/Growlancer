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

    // email was moved to profiles_private (migration 20261221000000)
    const [clientRes, freelancerRes, clientPrivRes, freelancerPrivRes, clientProfileRes] = await Promise.all([
      supabaseClient.from('profiles').select('name').eq('id', invoice.client_id).maybeSingle(),
      supabaseClient.from('profiles').select('name').eq('id', invoice.freelancer_id).maybeSingle(),
      supabaseClient.from('profiles_private').select('email').eq('id', invoice.client_id).maybeSingle(),
      supabaseClient.from('profiles_private').select('email').eq('id', invoice.freelancer_id).maybeSingle(),
      // Business info: company name + GST number appear on the invoice for
      // business accounts (GST is validated server-side on save).
      supabaseClient.from('client_profiles').select('company_name, gst_number, account_type').eq('user_id', invoice.client_id).maybeSingle(),
    ])

    const client = { ...(clientRes.data || {}), email: clientPrivRes.data?.email || '' };
    const freelancer = { ...(freelancerRes.data || {}), email: freelancerPrivRes.data?.email || '' };
    const clientProfile = clientProfileRes.data || {}
    const clientCompany = (clientProfile as { company_name?: string | null; gst_number?: string | null; account_type?: string }).company_name || ''
    const clientGst = (clientProfile as { gst_number?: string | null }).gst_number || ''

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
  @page { size: A4; margin: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #eef2f7; color: #0f172a; padding: 32px 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { max-width: 780px; margin: 0 auto; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 36px rgba(15,23,42,.10); }
  /* Brand header band */
  .head { position: relative; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 36px 40px 22px; color: #fff; }
  .head::before { content: ''; position: absolute; inset: 0; background: linear-gradient(120deg, #0f172a 0%, #14532d 60%, #059669 100%); }
  .head > * { position: relative; z-index: 1; }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: -.5px; }
  .brand span { color: #34d399; }
  .brand-tag { font-size: 11px; color: #a7f3d0; opacity: .85; margin-top: 2px; letter-spacing: .02em; }
  .inv-block { text-align: right; }
  .inv-label { font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: #a7f3d0; }
  .inv-no { font-size: 18px; font-weight: 800; margin-top: 2px; }
  .inv-date { font-size: 11px; color: #d1fae5; opacity: .9; margin-top: 4px; }
  .body { padding: 28px 40px 32px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 28px; }
  .meta h4 { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; margin-bottom: 6px; }
  .meta p { font-size: 14px; font-weight: 600; color: #0f172a; }
  .meta small { display: block; font-size: 12px; color: #64748b; font-weight: 400; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #94a3b8; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
  td.num, th.num { text-align: right; }
  .totals { margin-left: auto; width: 320px; }
  .totals .row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 14px; color: #475569; }
  .totals .row.total { border-top: 2px solid #059669; margin-top: 8px; padding-top: 14px; font-weight: 800; font-size: 17px; color: #0f172a; }
  .totals .row.fee { color: #059669; font-weight: 600; }
  .foot { padding: 18px 40px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; }
  .foot .row1 { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .foot .row2 { margin-top: 8px; padding-top: 10px; border-top: 1px dashed #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8; }
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #059669; color: #fff; border: 0; padding: 12px 22px; border-radius: 12px; font-weight: 700; font-size: 14px; cursor: pointer; box-shadow: 0 8px 20px rgba(5,150,105,.35); }
  .print-btn:hover { background: #047857; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border-radius: 0; max-width: 100%; } .print-btn { display: none; } .head { padding: 28px 34px 18px; } .body { padding: 24px 34px 26px; } .foot { padding: 14px 34px; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Download PDF</button>
  <div class="sheet">
    <div class="head">
      <div>
        <div class="brand">Grow<span>lancer</span></div>
        <div class="brand-tag">AI-Powered Freelancing Marketplace · India-First</div>
      </div>
      <div class="inv-block">
        <div class="inv-label">Invoice</div>
        <div class="inv-no">${esc(invoice.invoice_number)}</div>
        <div class="inv-date">Generated ${esc(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }))}</div>
        <div style="margin-top:10px;display:inline-flex">${statusBadge}</div>
      </div>
    </div>
    <div class="body">
      <div class="meta">
        <div>
          <h4>Billed To (Client)</h4>
          <p>${esc(clientCompany || client.name || 'Client')}</p>
          <small>${esc(client.email || '')}</small>
          ${clientGst ? `<small style="margin-top:2px">GSTIN: ${esc(clientGst)}</small>` : ''}
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
      <div class="row1">
        <span><strong>Growlancer</strong> — AI-Powered Freelancing Marketplace</span>
        <span>Invoice ${esc(invoice.invoice_number)} · ${esc(new Date(invoice.issued_at).getFullYear())}</span>
      </div>
      <div class="row2">
        Payments are protected by escrow. Platform fee 5% · UPI · Cards · Net Banking · Razorpay Secured
      </div>
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
