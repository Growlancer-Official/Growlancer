import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, Wallet, Scale, RotateCcw, Download, Loader2, RefreshCw,
  FileText, Banknote, PiggyBank, Receipt, AlertTriangle, ArrowUpRight,
} from 'lucide-react';
import { supabase, realtimeChannels } from '../../lib/supabase';
import { adminQuery } from '../../lib/adminDataProxy';
import { useToast } from '../../components/Toast';

interface FinanceStats {
  success: boolean;
  revenue: { today: number; this_week: number; this_month: number; this_year: number; total: number };
  commission: { today: number; this_week: number; this_month: number; this_year: number; total: number };
  gross_volume: number;
  pending_revenue: number;
  released_revenue: number;
  refunded_revenue: number;
  escrow: { total: number; pending: number; released: number; refunded: number };
  payouts: { paid_out: number; pending: number; count: number };
  refunds: { count: number; amount: number };
  disputes: { open: number; resolved: number };
  monthly: Array<{ month: string; label: string; revenue: number; volume: number }>;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  project_title: string | null;
  subtotal: number;
  platform_fee: number;
  freelancer_amount: number;
  total: number;
  status: string;
  issued_at: string;
  client_id: string;
  freelancer_id: string;
  client?: { name: string } | null;
  freelancer?: { name: string } | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
}

function csvEscape(v: string): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

export function AdminFinancePage() {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: statsData, error: statsErr } = await supabase.rpc('get_finance_stats' as any);
      if (statsErr) throw statsErr;
      setStats((statsData || {}) as FinanceStats);

      const invoiceRes = await adminQuery({
        table: 'invoices',
        select: '*',
        order: 'created_at',
        orderDir: 'desc',
        limit: 200,
      });
      const rows = (invoiceRes.data || []) as InvoiceRow[];
      const userIds = [...new Set(rows.flatMap(r => [r.client_id, r.freelancer_id]))];
      const profilesRes = userIds.length
        ? await adminQuery({ table: 'profiles', select: 'id, name', in: { id: userIds } })
        : { data: [] as Array<{ id: string; name: string }> };
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, { name: p.name }]));
      setInvoices(rows.map(r => ({
        ...r,
        client: profileMap.get(r.client_id) || null,
        freelancer: profileMap.get(r.freelancer_id) || null,
      })));
    } catch (e) {
      console.error('Failed to load finance stats:', e);
      setError(e instanceof Error ? e.message : 'Failed to load finance data');
      toast.error('Failed to load finance data', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // Real-time: commission updates as soon as escrow is released / refunds land
  useEffect(() => {
    const channel = realtimeChannels.transactions(`admin-finance-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_revenue' }, () => void fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => void fetchAll())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [fetchAll]);

  const exportInvoicesCSV = () => {
    const header = ['Invoice Number', 'Client', 'Freelancer', 'Project', 'Subtotal', 'Platform Fee', 'Freelancer Net', 'Total', 'Status', 'Issued At'];
    const lines = invoices.map(i => [
      i.invoice_number, i.client?.name || '', i.freelancer?.name || '', i.project_title || '',
      i.subtotal, i.platform_fee, i.freelancer_amount, i.total, i.status, i.issued_at,
    ].map(v => csvEscape(String(v))).join(','));
    const csv = [header.map(csvEscape).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `growlancer-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Invoices exported to CSV');
  };

  const maxMonthlyVolume = Math.max(1, ...(stats?.monthly || []).map(m => Number(m.volume) || 0));

  const statCards = stats ? [
    { label: "Today's Revenue", value: stats.revenue.today, icon: TrendingUp, color: 'text-emerald-400', sub: 'Platform commission' },
    { label: 'This Week', value: stats.revenue.this_week, icon: TrendingUp, color: 'text-emerald-400', sub: '7-day commission' },
    { label: 'This Month', value: stats.revenue.this_month, icon: TrendingUp, color: 'text-emerald-400', sub: '30-day commission' },
    { label: 'This Year', value: stats.revenue.this_year, icon: Banknote, color: 'text-emerald-400', sub: 'YTD commission' },
    { label: 'Total Revenue', value: stats.revenue.total, icon: PiggyBank, color: 'text-amber-400', sub: 'Lifetime commission' },
    { label: 'Gross Volume', value: stats.gross_volume, icon: Wallet, color: 'text-blue-400', sub: 'Total client payments' },
    { label: 'Pending Escrow', value: stats.pending_revenue, icon: Scale, color: 'text-orange-400', sub: 'Held, not yet released' },
    { label: 'Refunded', value: stats.refunded_revenue, icon: RotateCcw, color: 'text-red-400', sub: 'Commission reversed' },
  ] : [];

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Finance & Revenue</h1>
          <p className="text-slate-400 text-sm mt-1">Automatic commission, invoices, escrow and payout analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void fetchAll()} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors" title="Refresh">
            <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin' : '')} />
          </button>
          <Link
            to="/admin/withdrawals"
            className="px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-[10px] font-bold uppercase hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
          >
            <ArrowUpRight className="w-3.5 h-3.5" /> Withdraw
          </Link>
          <button
            onClick={exportInvoicesCSV}
            disabled={invoices.length === 0}
            className="px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-[10px] font-bold uppercase hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
      ) : (
        <>
          {/* Revenue stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((s, i) => (
              <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{s.label}</p>
                  <s.icon className={'w-4 h-4 ' + s.color} />
                </div>
                <p className="text-xl font-bold text-white">{formatCurrency(s.value)}</p>
                <p className="text-[10px] text-slate-600 mt-1">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Secondary stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Payouts Paid Out', value: stats.payouts.paid_out, sub: `${stats.payouts.count} completed`, color: 'text-blue-400' },
                { label: 'Pending Payouts', value: stats.payouts.pending, sub: 'in flight', color: 'text-orange-400' },
                { label: 'Refunds Issued', value: stats.refunds.amount, sub: `${stats.refunds.count} refunds`, color: 'text-red-400' },
                { label: 'Open Disputes', value: stats.disputes.open, sub: `${stats.disputes.resolved} resolved`, color: 'text-purple-400' },
              ].map((s, i) => (
                <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{s.label}</p>
                  <p className={'text-xl font-bold ' + s.color}>{s.label.includes('Disputes') ? s.value : formatCurrency(Number(s.value))}</p>
                  <p className="text-[10px] text-slate-600 mt-1">{s.sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* Monthly revenue chart */}
          {stats && stats.monthly && stats.monthly.length > 0 && (
            <div className="p-6 rounded-[2rem]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-white">Revenue — Last 12 Months</h3>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest">Commission vs Gross Volume</span>
              </div>
              <div className="flex items-end gap-2 h-44">
                {stats.monthly.map((m, i) => {
                  const volumePct = (Number(m.volume) / maxMonthlyVolume) * 100;
                  const revenuePct = maxMonthlyVolume > 0 ? (Number(m.revenue) / maxMonthlyVolume) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group" title={`${m.label}: volume ${formatCurrency(m.volume)} · commission ${formatCurrency(m.revenue)}`}>
                      <div className="w-full flex items-end justify-center gap-0.5 h-36">
                        <div className="w-2.5 rounded-t bg-emerald-500/70 group-hover:bg-emerald-400 transition-all" style={{ height: `${Math.max(revenuePct, 1)}%` }} />
                        <div className="w-2.5 rounded-t bg-blue-500/50 group-hover:bg-blue-400 transition-all" style={{ height: `${Math.max(volumePct, 1)}%` }} />
                      </div>
                      <span className="text-[9px] text-slate-500 truncate w-full text-center">{m.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500/70" /> Commission</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-blue-500/50" /> Gross Volume</span>
              </div>
            </div>
          )}

          {/* Invoices table */}
          <div className="p-6 rounded-[2rem]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" /> Invoices ({invoices.length})
              </h3>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5" /> Auto-generated on release
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/5">
                    <th className="py-2 pr-4">Invoice</th>
                    <th className="py-2 pr-4">Project</th>
                    <th className="py-2 pr-4">Client</th>
                    <th className="py-2 pr-4">Freelancer</th>
                    <th className="py-2 pr-4 text-right">Subtotal</th>
                    <th className="py-2 pr-4 text-right">Fee (5%)</th>
                    <th className="py-2 pr-4 text-right">Freelancer Net</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="border-b border-white/5 text-xs text-slate-300 hover:bg-white/5 transition-colors">
                      <td className="py-2.5 pr-4 font-semibold text-emerald-400">{inv.invoice_number}</td>
                      <td className="py-2.5 pr-4 truncate max-w-[160px]">{inv.project_title || '—'}</td>
                      <td className="py-2.5 pr-4">{inv.client?.name || '—'}</td>
                      <td className="py-2.5 pr-4">{inv.freelancer?.name || '—'}</td>
                      <td className="py-2.5 pr-4 text-right">{formatCurrency(inv.subtotal)}</td>
                      <td className="py-2.5 pr-4 text-right text-amber-400">{formatCurrency(inv.platform_fee)}</td>
                      <td className="py-2.5 pr-4 text-right">{formatCurrency(inv.freelancer_amount)}</td>
                      <td className="py-2.5">
                        <span className={'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ' + (inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : inv.status === 'refunded' ? 'bg-red-500/10 text-red-400' : 'bg-slate-500/10 text-slate-400')}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-slate-500">No invoices yet — they are generated automatically when escrow is released.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
