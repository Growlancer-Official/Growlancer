import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, Search, CheckCircle, XCircle, RotateCcw, Trash2 } from 'lucide-react';
import { adminQuery, adminUpdate, adminInsert, adminDelete } from '../../lib/adminDataProxy';
import { supabase, realtimeChannels } from '../../lib/supabase';
import { paypalService } from '../../lib/paypal';
import { razorpayService } from '../../lib/razorpay';

interface Transaction {
  id: string; user_id: string; contract_id: string | null; type: string;
  amount: number; status: string; description: string | null; created_at: string;
  user?: { name: string; email: string } | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  return new Date(dateStr).toLocaleDateString();
}

const typeColors: Record<string, string> = {
  payment: 'bg-emerald-500/10 text-emerald-400',
  withdrawal: 'bg-red-500/10 text-red-400',
  refund: 'bg-amber-500/10 text-amber-400',
  fee: 'bg-blue-500/10 text-blue-400',
  bonus: 'bg-purple-500/10 text-purple-400',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400',
  completed: 'bg-emerald-500/10 text-emerald-400',
  failed: 'bg-red-500/10 text-red-400',
  cancelled: 'bg-slate-500/10 text-slate-400',
};

export function AdminPaymentsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const opts: any = {
        table: 'transactions',
        select: 'id, user_id, contract_id, type, amount, status, description, created_at',
        order: 'created_at',
        orderDir: 'desc',
        limit: 100,
      };
      if (typeFilter !== 'all') opts.filters = { type: typeFilter };

      const data = (await adminQuery(opts)).data;

      const txs = (data || []) as Transaction[];
      const userIds = [...new Set(txs.map(t => t.user_id))];
      const { data: profiles } = await adminQuery({ table: 'profiles', select: 'id, name, email', in: { id: userIds } });
      const profileMap = new Map((profiles || []).map(p => [p.id, { name: p.name, email: p.email }]));
      setTransactions(txs.map(t => ({ ...t, user: profileMap.get(t.user_id) || null })));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [typeFilter]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => {
    const channel = realtimeChannels.transactions(`admin-payments-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchTransactions())
      .subscribe();
    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, [fetchTransactions]);

  const handleDeleteTransaction = async (txId: string) => {
    if (!confirm(`🗑️ Delete this transaction? This cannot be undone!`)) return;
    setActionLoading(`delete-${txId}`);
    try {
      await adminDelete('transactions', txId);
      await fetchTransactions();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  };

  const handleUpdateStatus = async (txId: string, status: string) => {
    if (!confirm(`Mark transaction as "${status}"?`)) return;
    setActionLoading(`${txId}-${status}`);
    try {
      await adminUpdate('transactions', txId, { status });
      await fetchTransactions();
    } catch (err) { console.error(err); }
    finally { setActionLoading(null); }
  };

  const totalVolume = transactions.reduce((s, t) => s + (t.amount || 0), 0);
  const pendingAmount = transactions.filter(t => t.status === 'pending').reduce((s, t) => s + (t.amount || 0), 0);

  const filtered = transactions.filter(t =>
    t.type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.user?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-white">Payments</h1>
        <p className="text-slate-400 text-sm mt-1">Track, process, and manage all platform transactions</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Txns', value: transactions.length, color: 'text-slate-100' },
          { label: 'Total Volume', value: formatCurrency(totalVolume), color: 'text-emerald-400' },
          { label: 'Pending', value: formatCurrency(pendingAmount), color: 'text-amber-400' },
          { label: 'Withdrawals', value: transactions.filter(t => t.type === 'withdrawal').length, color: 'text-red-400' },
        ].map((stat, i) => (
          <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '1rem', padding: '1rem' }}
        className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..." className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer">
            <option value="all">All Types</option>
            <option value="payment">Payments</option>
            <option value="withdrawal">Withdrawals</option>
            <option value="refund">Refunds</option>
            <option value="fee">Fees</option>
            <option value="bonus">Bonuses</option>
          </select>
        </div>
        <button onClick={fetchTransactions}
          className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="rounded-[2rem] overflow-hidden" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-white/5">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500 text-xs">No transactions found</td></tr>
              ) : (
                filtered.map(tx => (
                  <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-300">{tx.user?.name || 'Unknown'}</p>
                      <p className="text-[10px] text-slate-500">{tx.user?.email || ''}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${typeColors[tx.type] || 'text-slate-400'}`}>{tx.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold ${tx.type === 'withdrawal' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {tx.type === 'withdrawal' ? '-' : '+'}{formatCurrency(tx.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">{tx.description || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${statusColors[tx.status] || 'text-slate-400'}`}>{tx.status}</span>
                    </td>
                    <td className="px-6 py-4 text-[10px] text-slate-500">{formatRelativeTime(tx.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {tx.status === 'pending' && (
                          <button onClick={() => handleUpdateStatus(tx.id, 'completed')}
                            disabled={actionLoading === `${tx.id}-completed`}
                            className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-emerald-400 transition-colors" title="Mark as Completed">
                            {actionLoading === `${tx.id}-completed` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {tx.status === 'pending' && (
                          <button onClick={() => handleUpdateStatus(tx.id, 'failed')}
                            disabled={actionLoading === `${tx.id}-failed`}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors" title="Mark as Failed">
                            {actionLoading === `${tx.id}-failed` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button onClick={() => handleDeleteTransaction(tx.id)}
                          disabled={actionLoading === `delete-${tx.id}`}
                          className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors" title="Delete Transaction">
                          {actionLoading === `delete-${tx.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                        {tx.status === 'completed' && tx.type === 'payment' && (
                          <button onClick={async () => {
                            if (!confirm(`Issue refund for ${formatCurrency(tx.amount)}? This will attempt to refund via the payment provider.`)) return;
                            setActionLoading(`${tx.id}-refund`);
                            try {
                              // Attempt to refund via payment provider (Razorpay or PayPal)
                              let providerRefunded = false;

                              // Check Razorpay orders linked to this contract
                              if (tx.contract_id) {
                                const rzpResult = await adminQuery({
                                  table: 'razorpay_orders',
                                  select: 'razorpay_payment_id',
                                  filters: { contract_id: tx.contract_id },
                                  limit: 10,
                                });
                                const rzpOrders = rzpResult.data || [];

                                if (rzpOrders.length > 0) {
                                  for (const order of rzpOrders) {
                                    const paymentId = (order as any).razorpay_payment_id;
                                    if (paymentId) {
                                      try {
                                        await razorpayService.refundPayment(paymentId);
                                        providerRefunded = true;
                                      } catch (e) {
                                        console.warn('Razorpay refund failed for', paymentId, e);
                                      }
                                    }
                                  }
                                }

                                // Check PayPal orders linked to this contract
                                if (!providerRefunded) {
                                  try {
                                    const ppOrders = await paypalService.getOrdersByContract(tx.contract_id);
                                    for (const order of ppOrders) {
                                      if (order.paypal_order_id) {
                                        try {
                                          await paypalService.refundPayment(order.paypal_order_id);
                                          providerRefunded = true;
                                        } catch (e) {
                                          console.warn('PayPal refund failed for', order.paypal_order_id, e);
                                        }
                                      }
                                    }
                                  } catch (e) {
                                    console.warn('PayPal orders lookup failed:', e);
                                  }
                                }
                              }

                              // Always create a DB refund record
                              await adminInsert('transactions', {
                                user_id: tx.user_id,
                                contract_id: tx.contract_id,
                                type: 'refund' as any,
                                amount: tx.amount,
                                status: providerRefunded ? 'completed' : 'pending',
                                description: providerRefunded
                                  ? `Refund processed via provider for transaction ${tx.id.slice(0, 8)}`
                                  : `Refund pending — no provider payment found for transaction ${tx.id.slice(0, 8)}`
                              });
                              await fetchTransactions();
                            } catch (err) { console.error(err); }
                            finally { setActionLoading(null); }
                          }}
                            disabled={actionLoading === `${tx.id}-refund`}
                            className="p-1.5 hover:bg-amber-500/10 rounded-lg text-amber-400 transition-colors" title="Issue Refund">
                            {actionLoading === `${tx.id}-refund` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
