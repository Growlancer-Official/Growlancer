import { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock,
  CreditCard,
  Filter,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { withdrawalService, type Withdrawal, type PayoutMethod } from '../../lib/withdrawal';
import { PLATFORM_CONFIG } from '../../lib/config';

// ────────────────────────────────────────
// Types
// ────────────────────────────────────────

type TabId = 'overview' | 'transactions' | 'withdraw' | 'payout-methods';

interface TransactionRow {
  id: string;
  created_at: string | null;
  type: 'credit' | 'debit';
  amount: number;
  status: string | null;
  description: string | null;
  source: string;
  contract_id: string | null;
}

// ────────────────────────────────────────
// Helpers
// ────────────────────────────────────────

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const formatCompactCurrency = (amount: number) => {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return formatCurrency(amount);
};

const maskEmail = (email: string | null) => {
  if (!email) return '';
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}****@${domain}`;
};

const maskAccount = (num: string | null) => {
  if (!num) return '';
  return `****${num.slice(-4)}`;
};

const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-amber-100 text-amber-700',
    processing: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-slate-100 text-slate-600',
    failed: 'bg-red-100 text-red-700',
  };
  const icons: Record<string, React.ReactNode> = {
    completed: <CheckCircle2 className="w-3 h-3" />,
    pending: <Clock className="w-3 h-3" />,
    processing: <RefreshCw className="w-3 h-3 animate-spin" />,
    cancelled: <XCircle className="w-3 h-3" />,
    failed: <AlertCircle className="w-3 h-3" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
        styles[status] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {icons[status] || null}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// ────────────────────────────────────────
// Component
// ────────────────────────────────────────

export function WalletPage() {
  const { user } = useAuth();

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // ── Overview state ──
  const [balance, setBalance] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // ── Withdrawal history state ──
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);

  // ── Transaction history state ──
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);
  const [txFilterStatus, setTxFilterStatus] = useState<string>('all');
  const [txPage, setTxPage] = useState(0);
  const [txHasMore, setTxHasMore] = useState(true);
  const TX_PAGE_SIZE = 15;

  // ── Withdraw form state ──
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>([]);
  const [payoutMethodsLoading, setPayoutMethodsLoading] = useState(false);
  const [withdrawProcessing, setWithdrawProcessing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<Withdrawal | null>(null);
  const [showReview, setShowReview] = useState(false);
  const WITHDRAWAL_FEE_RATE = PLATFORM_CONFIG.fees.payment_processing_percentage / 100; // From central config

  // ── Payout Methods state ──
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [methodError, setMethodError] = useState<string | null>(null);
  const [addingMethod, setAddingMethod] = useState(false);
  const [newMethodType, setNewMethodType] = useState<'paypal' | 'bank_transfer'>('paypal');
  const [newMethodEmail, setNewMethodEmail] = useState('');
  const [newMethodBankName, setNewMethodBankName] = useState('');
  const [newMethodAccountHolder, setNewMethodAccountHolder] = useState('');
  const [newMethodAccountNumber, setNewMethodAccountNumber] = useState('');
  const [newMethodRoutingNumber, setNewMethodRoutingNumber] = useState('');
  const [newMethodIfscCode, setNewMethodIfscCode] = useState('');
  const [newMethodUpiId, setNewMethodUpiId] = useState('');
  const [newMethodSaving, setNewMethodSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteProcessing, setDeleteProcessing] = useState(false);

  // ── Shared state ──
  const [error, setError] = useState<string | null>(null);

  // =============================================
  // Data fetching
  // =============================================

  /** Fetch wallet balance & total withdrawn from completed withdrawals */
  const fetchOverview = useCallback(async () => {
    if (!user) return;
    setOverviewLoading(true);
    try {
      // Get wallet balance
      const balanceResult = await withdrawalService.getWalletBalance();
      if (balanceResult.success && balanceResult.balance) {
        setBalance(balanceResult.balance.balance);
        setPendingBalance(balanceResult.balance.pending_balance);
      }

      // Get total withdrawn (completed withdrawals)
      const allWithdrawals = await withdrawalService.getWithdrawals();
      setWithdrawals(allWithdrawals);
      const completedSum = allWithdrawals
        .filter((w) => w.status === 'completed')
        .reduce((sum, w) => sum + Number(w.amount), 0);
      setTotalWithdrawn(completedSum);
    } catch (err) {
      console.error('Error fetching overview:', err);
      setError('Failed to load wallet data');
    } finally {
      setOverviewLoading(false);
    }
  }, [user]);

  /** Fetch full transaction history — withdrawals (debits) + escrow releases (credits) */
  const fetchTransactions = useCallback(async (page: number, replace = false) => {
    if (!user) return;
    setTxLoading(true);
    setTxError(null);
    try {
      const limit = TX_PAGE_SIZE;
      const offset = page * TX_PAGE_SIZE;

      // Fetch withdrawals (debits)
      let withdrawalsData: any[] = [];
      try {
        const { data, error: withdrawalsError } = await supabase
          .from('withdrawals')
          .select('id, created_at, amount, status, method, fee, net_amount')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (!withdrawalsError && data) withdrawalsData = data;
      } catch { /* Withdrawal fetch failed silently */ }

      // Fetch credit transactions from the transactions table (escrow releases, payments)
      let creditsData: any[] = [];
      try {
        const { data, error: creditsError } = await supabase
          .from('transactions')
          .select('id, created_at, amount, status, type, description, source, contract_id')
          .eq('user_id', user.id)
          .in('type', ['escrow_release', 'payment', 'credit', 'refund'])
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (!creditsError && data) creditsData = data;
      } catch { /* Credits fetch failed silently */ }

      // Map withdrawals to debit transaction rows
      const debitRows: TransactionRow[] = (withdrawalsData || []).map((w) => ({
        id: `w-${w.id}`,
        created_at: w.created_at,
        type: 'debit' as const,
        amount: Number(w.amount),
        status: w.status,
        description: `Withdrawal via ${w.method}`,
        source: w.method || 'withdrawal',
        contract_id: null,
      }));

      // Map credits to credit transaction rows
      const creditRows: TransactionRow[] = (creditsData || []).map((t) => ({
        id: `t-${t.id}`,
        created_at: t.created_at,
        type: 'credit' as const,
        amount: Number(t.amount),
        status: t.status || 'completed',
        description: t.description || t.type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
        source: t.source || t.type,
        contract_id: t.contract_id,
      }));

      // Merge and sort by date (newest first)
      const allTransactions = [...debitRows, ...creditRows].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      if (replace) {
        setTransactions(allTransactions);
      } else {
        setTransactions((prev) => {
          const merged = [...prev, ...allTransactions];
          // Deduplicate by id
          const seen = new Set<string>();
          return merged.filter(t => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
          });
        });
      }
      setTxHasMore((withdrawalsData || []).length === limit || (creditsData || []).length === limit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load transactions';
      setTxError(msg);
    } finally {
      setTxLoading(false);
    }
  }, [user]);

  /** Fetch payout methods */
  const fetchPayoutMethods = useCallback(async () => {
    if (!user) return;
    setMethodsLoading(true);
    setMethodError(null);
    try {
      const result = await withdrawalService.getPayoutMethods();
      if (result.success && result.methods) {
        setMethods(result.methods);
        setPayoutMethods(result.methods);
      } else {
        setMethodError(result.error || 'Failed to load payout methods');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load payout methods';
      setMethodError(msg);
    } finally {
      setMethodsLoading(false);
    }
  }, [user]);

  // ── Initial data load ──
  useEffect(() => {
    if (!user) return;
    fetchOverview();
    fetchTransactions(0, true);
    fetchPayoutMethods();
  }, [user, fetchOverview, fetchTransactions, fetchPayoutMethods]);

  // ── Real-time subscription to withdrawals ──
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('wallet-page-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawals',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchOverview();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user, fetchOverview]);

  // =============================================
  // Withdraw form handlers
  // =============================================

  const handleWithdrawSubmit = useCallback(async () => {
    if (!user) return;
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      setWithdrawError('Please enter a valid amount');
      return;
    }
    if (amount > balance) {
      setWithdrawError('Amount exceeds your available balance');
      return;
    }

    const method = methods.find((m) => m.id === selectedMethodId);
    if (!method) {
      setWithdrawError('Please select a payout method');
      return;
    }

    setWithdrawProcessing(true);
    setWithdrawError(null);

    try {
      // Determine withdrawal method type from selected payout method
      const isRazorpayPayout = method.type === 'bank_transfer' || method.type === 'razorpay_payout';
      
      const result = await withdrawalService.createWithdrawal({
        amount,
        method: isRazorpayPayout ? 'razorpay_payout' : 'paypal',
        paypal_email: !isRazorpayPayout ? method.email || '' : undefined,
        fund_account_id: isRazorpayPayout ? method.account_number || method.upi_id || undefined : undefined,
      });

      if (result.success && result.withdrawal) {
        setWithdrawSuccess(result.withdrawal);
        setShowReview(false);
        setWithdrawAmount('');
        // Refresh data
        fetchOverview();
        fetchTransactions(0, true);
      } else {
        setWithdrawError(result.error || 'Failed to process withdrawal');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setWithdrawError(msg);
    } finally {
      setWithdrawProcessing(false);
    }
  }, [user, withdrawAmount, balance, methods, selectedMethodId, fetchOverview, fetchTransactions]);

  const resetWithdrawForm = useCallback(() => {
    setWithdrawAmount('');
    setSelectedMethodId('');
    setWithdrawError(null);
    setWithdrawSuccess(null);
    setShowReview(false);
  }, []);

  // =============================================
  // Payout method handlers
  // =============================================

  const handleAddPayoutMethod = useCallback(async () => {
    if (!user) return;

    if (newMethodType === 'paypal' && !newMethodEmail) {
      setMethodError('PayPal email is required');
      return;
    }
    if (newMethodType === 'bank_transfer') {
      if (!newMethodAccountHolder || !newMethodAccountNumber || !newMethodIfscCode) {
        setMethodError('Please fill in account holder name, account number, and IFSC code');
        return;
      }
    }

    setNewMethodSaving(true);
    setMethodError(null);

    try {
      const result = await withdrawalService.addPayoutMethod({
        type: newMethodType,
        email: newMethodType === 'paypal' ? newMethodEmail : null,
        account_holder_name: newMethodType === 'bank_transfer' ? newMethodAccountHolder : null,
        account_number: newMethodType === 'bank_transfer' ? newMethodAccountNumber : null,
        routing_number: newMethodType === 'bank_transfer' ? newMethodRoutingNumber || null : null,
        bank_name: newMethodType === 'bank_transfer' ? newMethodBankName || null : null,
        ifsc_code: newMethodType === 'bank_transfer' ? newMethodIfscCode || null : null,
        upi_id: newMethodType === 'bank_transfer' ? newMethodUpiId || null : null,
      });

      if (result.success && result.method) {
        await fetchPayoutMethods();
        setAddingMethod(false);
        // Reset form
        setNewMethodEmail('');
        setNewMethodBankName('');
        setNewMethodAccountHolder('');
        setNewMethodAccountNumber('');
        setNewMethodRoutingNumber('');
        setNewMethodIfscCode('');
        setNewMethodUpiId('');
      } else {
        setMethodError(result.error || 'Failed to add payout method');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add payout method';
      setMethodError(msg);
    } finally {
      setNewMethodSaving(false);
    }
  }, [user, newMethodType, newMethodEmail, newMethodAccountHolder, newMethodAccountNumber, newMethodRoutingNumber, newMethodBankName, fetchPayoutMethods]);

  const handleSetDefault = useCallback(async (methodId: string) => {
    try {
      const result = await withdrawalService.setDefaultPayoutMethod(methodId);
      if (result.success) {
        await fetchPayoutMethods();
      } else {
        setMethodError(result.error || 'Failed to set default method');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to set default method';
      setMethodError(msg);
    }
  }, [fetchPayoutMethods]);

  const handleDeleteMethod = useCallback(async (methodId: string) => {
    setDeleteProcessing(true);
    try {
      const result = await withdrawalService.deletePayoutMethod(methodId);
      if (result.success) {
        await fetchPayoutMethods();
        setDeleteConfirmId(null);
      } else {
        setMethodError(result.error || 'Failed to delete payout method');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete payout method';
      setMethodError(msg);
    } finally {
      setDeleteProcessing(false);
    }
  }, [fetchPayoutMethods]);

  // =============================================
  // Derived values
  // =============================================

  const availableBalance = balance;
  const netAmount = parseFloat(withdrawAmount || '0') * (1 - WITHDRAWAL_FEE_RATE);
  const feeAmount = parseFloat(withdrawAmount || '0') * WITHDRAWAL_FEE_RATE;

  // Filter transactions by status
  const filteredTransactions =
    txFilterStatus === 'all'
      ? transactions
      : transactions.filter((tx) => tx.status === txFilterStatus);

  // =============================================
  // Loading state
  // =============================================

  if (overviewLoading && activeTab === 'overview') {
    return <LoadingSkeleton variant="full-page" />;
  }

  // =============================================
  // Render
  // =============================================

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Wallet</h1>
            <p className="text-slate-500 text-sm">Manage your earnings, withdrawals, and payout methods</p>
          </div>
        </div>
        <button
          onClick={() => {
            fetchOverview();
            fetchTransactions(0, true);
            fetchPayoutMethods();
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {([
            { id: 'overview' as TabId, label: 'Overview', icon: Wallet },
            { id: 'transactions' as TabId, label: 'Transactions', icon: ArrowDownLeft },
            { id: 'withdraw' as TabId, label: 'Withdraw', icon: ArrowUpRight },
            { id: 'payout-methods' as TabId, label: 'Payout Methods', icon: CreditCard },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Global Error ── */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* TAB 1 — OVERVIEW                        */}
      {/* ════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Balance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Available Balance */}
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-500/10">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <span className="text-xs font-medium bg-white/20 px-3 py-1 rounded-full">
                  Available
                </span>
              </div>
              <p className="text-3xl font-bold">{formatCurrency(availableBalance)}</p>
              <p className="text-emerald-100 text-sm mt-1">Ready for withdrawal</p>
            </div>

            {/* Pending Balance */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amber-500" />
                </div>
                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                  Pending
                </span>
              </div>
              <p className="text-3xl font-bold text-slate-900">{formatCurrency(pendingBalance)}</p>
              <p className="text-slate-500 text-sm mt-1">In escrow / processing</p>
            </div>

            {/* Total Withdrawn */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                  <ArrowUpRight className="w-6 h-6 text-blue-500" />
                </div>
                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  Withdrawn
                </span>
              </div>
              <p className="text-3xl font-bold text-slate-900">{formatCurrency(totalWithdrawn)}</p>
              <p className="text-slate-500 text-sm mt-1">Total withdrawn to date</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h3 className="font-display text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setActiveTab('withdraw')}
                disabled={availableBalance <= 0}
                className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50/50 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-transparent"
              >
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <ArrowUpRight className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Withdraw Funds</p>
                  <p className="text-sm text-slate-500">
                    {availableBalance > 0
                      ? `${formatCurrency(availableBalance)} available`
                      : 'No funds available'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>

              <button
                onClick={() => setActiveTab('transactions')}
                className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50/50 transition-colors text-left"
              >
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                  <ArrowDownLeft className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">View Transactions</p>
                  <p className="text-sm text-slate-500">See your full withdrawal history</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-900">Recent Withdrawals</h3>
              {withdrawals.length > 5 && (
                <button
                  onClick={() => setActiveTab('transactions')}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                >
                  View all
                </button>
              )}
            </div>

            {withdrawals.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {withdrawals.slice(0, 5).map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        w.status === 'completed'
                          ? 'bg-emerald-100'
                          : w.status === 'failed'
                          ? 'bg-red-100'
                          : w.status === 'cancelled'
                          ? 'bg-slate-100'
                          : 'bg-amber-100'
                      }`}
                    >
                      <ArrowUpRight
                        className={`w-5 h-5 ${
                          w.status === 'completed'
                            ? 'text-emerald-600'
                            : w.status === 'failed'
                            ? 'text-red-600'
                            : w.status === 'cancelled'
                            ? 'text-slate-500'
                            : 'text-amber-600'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900">
                        Withdrawal — {w.method === 'paypal' ? 'PayPal' : w.method}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(w.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">
                        -{formatCurrency(Number(w.amount))}
                      </p>
                      <div className="mt-1">{getStatusBadge(w.status)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Banknote className="w-8 h-8 text-slate-400" />
                </div>
                <h4 className="font-semibold text-slate-900 mb-1">No withdrawals yet</h4>
                <p className="text-sm text-slate-500 mb-4">
                  Your completed withdrawals will appear here
                </p>
                {availableBalance > 0 && (
                  <button
                    onClick={() => setActiveTab('withdraw')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Withdraw Funds
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* TAB 2 — TRANSACTIONS                    */}
      {/* ════════════════════════════════════════ */}
      {activeTab === 'transactions' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          {/* Header + Filters */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h3 className="font-display text-lg font-bold text-slate-900">Transaction History</h3>

              {/* Status filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={txFilterStatus}
                  onChange={(e) => {
                    setTxFilterStatus(e.target.value);
                    setTxPage(0);
                  }}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error state */}
          {txError && (
            <div className="p-4 mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{txError}</p>
            </div>
          )}

          {/* Loading state */}
          {txLoading && transactions.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : filteredTransactions.length > 0 ? (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left px-6 py-3 font-medium text-slate-500">Date</th>
                      <th className="text-left px-6 py-3 font-medium text-slate-500">Type</th>
                      <th className="text-left px-6 py-3 font-medium text-slate-500">Amount</th>
                      <th className="text-left px-6 py-3 font-medium text-slate-500">Status</th>
                      <th className="text-left px-6 py-3 font-medium text-slate-500">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                          {tx.created_at
                            ? new Date(tx.created_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              tx.type === 'credit' ? 'bg-emerald-100' : 'bg-slate-100'
                            }`}>
                              {tx.type === 'credit' ? (
                                <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <ArrowUpRight className="w-4 h-4 text-slate-600" />
                              )}
                            </div>
                            <span className="font-medium text-slate-900">
                              {tx.type === 'credit' ? 'Payment Received' : 'Withdrawal'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {tx.type === 'credit' ? (
                            <span className="text-emerald-600">+{formatCurrency(tx.amount)}</span>
                          ) : (
                            <span>-{formatCurrency(tx.amount)}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">{getStatusBadge(tx.status || 'pending')}</td>
                        <td className="px-6 py-4 text-slate-500 max-w-[200px] truncate">
                          {tx.description || 'Withdrawal'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Load more / pagination */}
              <div className="p-4 border-t border-slate-100 flex justify-center">
                {txHasMore ? (
                  <button
                    onClick={() => {
                      const nextPage = txPage + 1;
                      setTxPage(nextPage);
                      fetchTransactions(nextPage);
                    }}
                    disabled={txLoading}
                    className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {txLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Load More
                      </>
                    )}
                  </button>
                ) : (
                  <p className="text-sm text-slate-400">All transactions loaded</p>
                )}
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-slate-400" />
              </div>
              <h4 className="font-semibold text-slate-900 mb-1">
                {txFilterStatus !== 'all'
                  ? `No ${txFilterStatus} transactions`
                  : 'No transactions yet'}
              </h4>
              <p className="text-sm text-slate-500">
                {txFilterStatus !== 'all'
                  ? 'Try changing the status filter'
                  : 'Your withdrawal history will appear here'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* TAB 3 — WITHDRAW                        */}
      {/* ════════════════════════════════════════ */}
      {activeTab === 'withdraw' && (
        <div className="max-w-2xl mx-auto">
          {/* Success state */}
          {withdrawSuccess ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="font-display text-xl font-bold text-slate-900 mb-2">
                Withdrawal Submitted!
              </h3>
              <p className="text-slate-500 mb-2">
                Your withdrawal of{' '}
                <span className="font-semibold text-slate-900">
                  {formatCurrency(Number(withdrawSuccess.amount))}
                </span>{' '}
                is being processed.
              </p>
              <p className="text-xs text-slate-400 mb-6">
                Reference: {withdrawSuccess.id.slice(0, 8)}...
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    resetWithdrawForm();
                    fetchOverview();
                    fetchTransactions(0, true);
                  }}
                  className="px-6 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors"
                >
                  Done
                </button>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className="px-6 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
                >
                  View Status
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-display text-lg font-bold text-slate-900 mb-6">
                Withdraw Funds
              </h3>

              {/* Error */}
              {withdrawError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{withdrawError}</p>
                </div>
              )}

              {/* Step 1: Amount + Method Selection */}
              {!showReview ? (
                <div className="space-y-5">
                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Amount (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                        $
                      </span>
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        min={1}
                        max={availableBalance}
                        step="0.01"
                        className="w-full pl-8 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-xs text-slate-500">
                        Available: <span className="font-medium">{formatCurrency(availableBalance)}</span>
                      </p>
                      {availableBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => setWithdrawAmount(String(availableBalance))}
                          className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          Max
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Payout Method Selector */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Payout Method
                    </label>
                    {payoutMethods.length > 0 ? (
                      <div className="space-y-2">
                        {payoutMethods.map((method) => (
                          <label
                            key={method.id}
                            className={`flex items-center gap-4 p-4 border rounded-xl cursor-pointer transition-colors ${
                              selectedMethodId === method.id
                                ? 'border-emerald-500 bg-emerald-50/50'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="payoutMethod"
                              value={method.id}
                              checked={selectedMethodId === method.id}
                              onChange={() => setSelectedMethodId(method.id)}
                              className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                            />
                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                              {method.type === 'paypal' ? (
                                <CircleDollarSign className="w-5 h-5 text-blue-600" />
                              ) : (
                                <Landmark className="w-5 h-5 text-slate-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-900 text-sm">
                                {method.type === 'paypal'
                                  ? 'PayPal'
                                  : method.bank_name || 'Bank Transfer'}
                              </p>
                              <p className="text-xs text-slate-500">
                                {method.type === 'paypal'
                                  ? maskEmail(method.email)
                                  : `${maskAccount(method.account_number)} — ${method.account_holder_name || ''}`}
                              </p>
                            </div>
                            {method.is_default && (
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                                Default
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 rounded-xl text-center">
                        <p className="text-sm text-slate-500 mb-2">
                          No payout methods saved yet
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('payout-methods')}
                          className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          Add a payout method
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Fee preview */}
                  {parseFloat(withdrawAmount || '0') > 0 && (
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-600">Withdrawal Amount</span>
                        <span className="font-medium text-slate-900">
                          {formatCurrency(parseFloat(withdrawAmount) || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-600">Fee ({(WITHDRAWAL_FEE_RATE * 100).toFixed(1)}%)</span>
                        <span className="font-medium text-red-500">
                          -{formatCurrency(feeAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                        <span className="font-medium text-slate-700">You'll Receive</span>
                        <span className="font-bold text-emerald-600">
                          {formatCurrency(netAmount)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Continue to review */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
                        setWithdrawError('Please enter an amount');
                        return;
                      }
                      if (parseFloat(withdrawAmount) > availableBalance) {
                        setWithdrawError('Amount exceeds available balance');
                        return;
                      }
                      if (!selectedMethodId) {
                        setWithdrawError('Please select a payout method');
                        return;
                      }
                      setWithdrawError(null);
                      setShowReview(true);
                    }}
                    disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || !selectedMethodId}
                    className="w-full py-3.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Review Withdrawal
                  </button>
                </div>
              ) : (
                /* Step 2: Review & Confirm */
                <div className="space-y-5">
                  <div className="p-5 bg-emerald-50 rounded-xl border border-emerald-100">
                    <h4 className="font-semibold text-slate-900 mb-3">Review Your Withdrawal</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Amount</span>
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(parseFloat(withdrawAmount) || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Fee</span>
                        <span className="font-medium text-red-500">-{formatCurrency(feeAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-emerald-200">
                        <span className="font-medium text-slate-700">Net Amount</span>
                        <span className="font-bold text-emerald-700">
                          {formatCurrency(netAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Payout Method</span>
                        <span className="font-medium text-slate-900">
                          {payoutMethods.find((m) => m.id === selectedMethodId)?.type === 'paypal'
                            ? 'PayPal'
                            : 'Bank Transfer'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowReview(false)}
                      className="flex-1 py-3.5 border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleWithdrawSubmit}
                      disabled={withdrawProcessing}
                      className="flex-1 py-3.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {withdrawProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Confirm Withdrawal'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════ */}
      {/* TAB 4 — PAYOUT METHODS                  */}
      {/* ════════════════════════════════════════ */}
      {activeTab === 'payout-methods' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left side — Saved Methods */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-slate-900">Saved Payout Methods</h3>
              <button
                onClick={() => {
                  setAddingMethod(!addingMethod);
                  setMethodError(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Method
              </button>
            </div>

            {/* Error */}
            {methodError && (
              <div className="p-4 mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{methodError}</p>
              </div>
            )}

            {/* Loading */}
            {methodsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : methods.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {methods.map((method) => (
                  <div key={method.id} className="p-5 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                    {/* Icon */}
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        method.type === 'paypal'
                          ? 'bg-blue-50'
                          : 'bg-slate-100'
                      }`}
                    >
                      {method.type === 'paypal' ? (
                        <CircleDollarSign className="w-6 h-6 text-blue-600" />
                      ) : (
                        <Landmark className="w-6 h-6 text-slate-600" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">
                          {method.type === 'paypal'
                            ? 'PayPal'
                            : method.bank_name || 'Bank Transfer'}
                        </p>
                        {method.is_default && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                            <Star className="w-3 h-3" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">
                        {method.type === 'paypal'
                          ? maskEmail(method.email)
                          : `${maskAccount(method.account_number)} — ${method.account_holder_name || ''}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Added {new Date(method.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!method.is_default && (
                        <button
                          onClick={() => handleSetDefault(method.id)}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                          Set Default
                        </button>
                      )}

                      {deleteConfirmId === method.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteMethod(method.id)}
                            disabled={deleteProcessing}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            {deleteProcessing ? '...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(method.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete method"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Empty */
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-8 h-8 text-slate-400" />
                </div>
                <h4 className="font-semibold text-slate-900 mb-1">No payout methods</h4>
                <p className="text-sm text-slate-500">
                  Add a PayPal or bank account to withdraw your earnings
                </p>
              </div>
            )}
          </div>

          {/* Right side — Add Method Form */}
          <div className="lg:col-span-2">
            {addingMethod && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-display text-lg font-bold text-slate-900">Add Method</h3>
                  <button
                    onClick={() => {
                      setAddingMethod(false);
                      setMethodError(null);
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Type selector */}
                <div className="flex gap-2 mb-5">
                  <button
                    type="button"
                    onClick={() => setNewMethodType('paypal')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      newMethodType === 'paypal'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <CircleDollarSign className="w-5 h-5" />
                    PayPal
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMethodType('bank_transfer')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      newMethodType === 'bank_transfer'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Landmark className="w-5 h-5" />
                    Bank
                  </button>
                </div>

                {/* Fields */}
                <div className="space-y-4">
                  {newMethodType === 'paypal' ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        PayPal Email
                      </label>
                      <input
                        type="email"
                        value={newMethodEmail}
                        onChange={(e) => setNewMethodEmail(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        placeholder="your@email.com"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Account Holder Name
                        </label>
                        <input
                          type="text"
                          value={newMethodAccountHolder}
                          onChange={(e) => setNewMethodAccountHolder(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          placeholder="Your full name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Bank Name
                        </label>
                        <input
                          type="text"
                          value={newMethodBankName}
                          onChange={(e) => setNewMethodBankName(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          placeholder="Bank of America"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Account Number
                        </label>
                        <input
                          type="text"
                          value={newMethodAccountNumber}
                          onChange={(e) => setNewMethodAccountNumber(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          placeholder="****5678"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          IFSC Code <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newMethodIfscCode}
                          onChange={(e) => setNewMethodIfscCode(e.target.value.toUpperCase())}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          placeholder="SBIN0001234"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          UPI ID <span className="text-xs text-slate-400">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={newMethodUpiId}
                          onChange={(e) => setNewMethodUpiId(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          placeholder="username@upi"
                        />
                      </div>
                    </>
                  )}

                  {/* Save */}
                  <button
                    type="button"
                    onClick={handleAddPayoutMethod}
                    disabled={newMethodSaving}
                    className="w-full py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {newMethodSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Method'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Tips card */}
            {!addingMethod && (
              <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h4 className="font-semibold text-slate-900 mb-3">💡 Payout Tips</h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>Add at least one payout method before withdrawing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>PayPal withdrawals are processed within 24-48 hours</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>Bank transfers may take 3-5 business days</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>Set a default method for faster withdrawals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">•</span>
                    <span>A {(WITHDRAWAL_FEE_RATE * 100).toFixed(1)}% processing fee applies</span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}