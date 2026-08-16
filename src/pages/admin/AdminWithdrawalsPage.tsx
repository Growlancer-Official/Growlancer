import { useState, useEffect, useCallback } from 'react';
import {
  PiggyBank, Wallet, ArrowUpRight, RotateCcw, Loader2, RefreshCw,
  Landmark, Smartphone, AlertTriangle, CheckCircle2, XCircle, Clock, HelpCircle,
} from 'lucide-react';
import { useToast } from '../../components/Toast';
import { adminWithdrawalService, type AdminWithdrawal, type AdminCommissionBalance } from '../../lib/adminWithdrawal';
import { formatCurrency as libFormatCurrency, currencySymbol } from '../../lib/currency';

function formatCurrency(amount: number): string {
  return libFormatCurrency(amount || 0);
}

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

const statusStyles: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-400', icon: Clock },
  processing: { label: 'Processing', cls: 'bg-blue-500/10 text-blue-400', icon: Clock },
  completed: { label: 'Completed', cls: 'bg-emerald-500/10 text-emerald-400', icon: CheckCircle2 },
  failed: { label: 'Failed', cls: 'bg-red-500/10 text-red-400', icon: XCircle },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-500/10 text-slate-400', icon: XCircle },
};

export function AdminWithdrawalsPage() {
  const [balance, setBalance] = useState<AdminCommissionBalance | null>(null);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Withdraw form state
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'bank' | 'upi'>('bank');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const toast = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminWithdrawalService.getHistory();
      if (!res.success) throw new Error(res.error || 'Failed to load');
      setBalance(res.balance || null);
      setWithdrawals(res.withdrawals || []);
    } catch (e) {
      console.error('Failed to load admin withdrawals:', e);
      setError(e instanceof Error ? e.message : 'Failed to load withdrawal data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // Real-time: refresh whenever admin_withdrawals changes
  useEffect(() => {
    const unsub = adminWithdrawalService.subscribe(() => { void fetchAll(); });
    return () => { unsub(); };
  }, [fetchAll]);

  const validateForm = (): string | null => {
    const amt = Number(amount);
    if (!amount || !Number.isFinite(amt) || amt <= 0) return 'Please enter a valid withdrawal amount.';
    if (amt < 100) return `Minimum withdrawal amount is ${formatCurrency(100)} (per SBM bank limits).`;
    if (amt > 500000) return `Maximum withdrawal amount is ${formatCurrency(500000)} (per SBM bank limits).`;
    if (amt > (balance?.available_balance || 0)) {
      return `Insufficient commission balance. Available: ${formatCurrency(balance?.available_balance || 0)}`;
    }
    if (method === 'bank') {
      if (!accountHolder.trim()) return 'Account holder name is required.';
      if (!/^\d{9,18}$/.test(accountNumber.trim())) return 'Enter a valid bank account number (9–18 digits).';
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase())) return 'Enter a valid IFSC code (e.g. SBIN0001234).';
    } else {
      if (!/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upiId.trim())) return 'Enter a valid UPI ID (e.g. name@upi).';
    }
    return null;
  };

  const handleSubmit = async () => {
    setFormError(null);
    const err = validateForm();
    if (err) { setFormError(err); return; }

    setSubmitting(true);
    try {
      const res = await adminWithdrawalService.createWithdrawal({
        amount: Number(amount),
        method,
        account_holder_name: method === 'bank' ? accountHolder.trim() : undefined,
        account_number: method === 'bank' ? accountNumber.trim() : undefined,
        ifsc_code: method === 'bank' ? ifsc.trim().toUpperCase() : undefined,
        bank_name: method === 'bank' ? bankName.trim() || undefined : undefined,
        upi_id: method === 'upi' ? upiId.trim() : undefined,
      });

      if (!res.success) {
        setFormError(res.error || 'Withdrawal failed');
        return;
      }

      if (res.queued) {
        toast.success('Withdrawal queued', 'Funds are reserved — the payout will be processed once the payout service is configured.');
      } else {
        toast.success('Withdrawal processed', 'Your commission withdrawal has been initiated.');
      }

      // Reset form
      setAmount(''); setAccountHolder(''); setAccountNumber(''); setIfsc(''); setBankName(''); setUpiId('');
      await fetchAll();
    } catch (e) {
      console.error('Withdraw error:', e);
      setFormError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const stats = [
    { label: 'Total Commission', value: balance?.total_commission || 0, icon: PiggyBank, color: 'text-emerald-400', sub: 'Lifetime 5% platform fee' },
    { label: 'This Month', value: balance?.this_month || 0, icon: Wallet, color: 'text-blue-400', sub: 'Commission this month' },
    { label: 'Withdrawn', value: balance?.withdrawn || 0, icon: ArrowUpRight, color: 'text-orange-400', sub: 'Paid out / in flight' },
    { label: 'Available to Withdraw', value: balance?.available_balance || 0, icon: RotateCcw, color: 'text-amber-400', sub: 'Ready for payout' },
  ];

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Commission Withdrawals</h1>
          <p className="text-slate-400 text-sm mt-1">Withdraw Growlancer's 5% commission to your bank in real time</p>
        </div>
        <button
          onClick={() => void fetchAll()}
          className="px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-[10px] font-bold uppercase hover:bg-emerald-500/20 transition-all flex items-center gap-1.5"
        >
          <RefreshCw className={'w-3.5 h-3.5 ' + (loading ? 'animate-spin' : '')} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{s.label}</p>
              <s.icon className={'w-4 h-4 ' + s.color} />
            </div>
            <p className={'text-xl font-bold ' + (i === 3 ? 'text-amber-400' : 'text-white')}>{formatCurrency(s.value)}</p>
            <p className="text-[10px] text-slate-600 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Withdraw form */}
        <div className="p-6 rounded-[2rem]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Withdraw Commission</h3>
          </div>
          <p className="text-[11px] text-slate-500 mb-5">
            Transfers go to your bank via RazorpayX. Per SBM (Suryoday Small Finance Bank) limits: <span className="text-amber-400 font-bold">min {formatCurrency(100)} · max {formatCurrency(500000)}</span>.
          </p>

          {/* Method toggle */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => setMethod('bank')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                method === 'bank'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-800/50 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <Landmark className="w-3.5 h-3.5" /> Bank Transfer
            </button>
            <button
              type="button"
              onClick={() => setMethod('upi')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                method === 'upi'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : 'bg-slate-800/50 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> UPI
            </button>
          </div>

          {/* Amount */}
          <div className="mb-4">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Amount ({currencySymbol()})</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">{currencySymbol()}</span>
              <input
                type="number"
                min={100}
                max={500000}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="100 – 5,00,000"
                className="w-full pl-8 pr-3 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-600"
              />
            </div>
            <p className="text-[10px] text-slate-600 mt-1.5 flex items-center gap-1">
              <HelpCircle className="w-3 h-3" /> Available: <span className="text-amber-400 font-bold">{formatCurrency(balance?.available_balance || 0)}</span>
            </p>
          </div>

          {/* Bank fields */}
          {method === 'bank' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Account Holder Name</label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={e => setAccountHolder(e.target.value)}
                  placeholder="Name as per bank records"
                  className="w-full px-3 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Account Number</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value)}
                  placeholder="9–18 digit account number"
                  className="w-full px-3 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">IFSC Code</label>
                  <input
                    type="text"
                    value={ifsc}
                    onChange={e => setIfsc(e.target.value.toUpperCase())}
                    placeholder="e.g. SBIN0001234"
                    className="w-full px-3 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Bank Name (optional)</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    placeholder="e.g. Suryoday SFB"
                    className="w-full px-3 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-600"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">UPI ID</label>
              <input
                type="text"
                value={upiId}
                onChange={e => setUpiId(e.target.value)}
                placeholder="e.g. growlancer@upi"
                className="w-full px-3 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-600"
              />
            </div>
          )}

          {formError && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {formError}
            </div>
          )}

          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="mt-5 w-full py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
            {submitting ? 'Processing...' : 'Withdraw to Bank'}
          </button>
        </div>

        {/* Bank limits info card */}
        <div className="p-6 rounded-[2rem]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
            <Landmark className="w-4 h-4 text-emerald-400" /> Bank & Withdrawal Rules
          </h3>
          <ul className="space-y-3 text-xs text-slate-400">
            <li className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
              <span><strong className="text-slate-200">Real-time payout</strong> — once you confirm, the edge function fires the RazorpayX payout immediately and updates the status live.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
              <span><strong className="text-slate-200">Limits (SBM Small Finance Bank):</strong> minimum <strong className="text-amber-400">{formatCurrency(100)}</strong>, maximum <strong className="text-amber-400">{formatCurrency(500000)}</strong> per payout.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
              <span><strong className="text-slate-200">Available balance</strong> = total commission − withdrawals in flight. A failed payout automatically returns the amount to the available balance.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
              <span><strong className="text-slate-200">Funds arrive in 1–3 business days</strong> depending on your bank (NEFT for bank transfers, instant for UPI).</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
              <span><strong className="text-slate-200">Security:</strong> admin-only access (server-side role check), rate-limited, and every payout is recorded with its RazorpayX payout ID for audit.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* History */}
      <div className="p-6 rounded-[2rem]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Withdrawal History ({withdrawals.length})</h3>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest">Updates in real time</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/5">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Method</th>
                <th className="py-2 pr-4">Destination</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Payout ID</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map(w => {
                const st = statusStyles[w.status] || statusStyles.pending;
                const dest = w.method === 'bank'
                  ? `${w.bank_name || 'Bank'} · ${w.account_number ? '••' + w.account_number.slice(-4) : ''}`
                  : w.upi_id || 'UPI';
                return (
                  <tr key={w.id} className="border-b border-white/5 text-xs text-slate-300 hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-4">{formatDateTime(w.created_at)}</td>
                    <td className="py-2.5 pr-4 uppercase">{w.method}</td>
                    <td className="py-2.5 pr-4 text-slate-400" title={w.failure_reason || ''}>{dest}</td>
                    <td className="py-2.5 pr-4 text-right font-bold text-white">{formatCurrency(w.amount)}</td>
                    <td className="py-2.5 pr-4">
                      <span className={'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase flex items-center gap-1 w-fit ' + st.cls}>
                        <st.icon className="w-3 h-3" /> {st.label}
                      </span>
                    </td>
                    <td className="py-2.5 text-[10px] text-slate-500">{w.razorpay_payout_id || '—'}</td>
                  </tr>
                );
              })}
              {withdrawals.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">No withdrawals yet — your commission will appear here as you withdraw.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
