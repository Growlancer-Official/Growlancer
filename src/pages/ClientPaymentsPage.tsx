import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, realtimeChannels } from '../lib/supabase';
import { clientPaymentMethodsService } from '../lib/clientPaymentMethods';
import { razorpayService, type SavedPaymentCard } from '../lib/razorpay';
import type { ClientPaymentMethod } from '../lib/clientPaymentMethods';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Building2, Calendar, CheckCircle2, CreditCard, DollarSign, Download, FileText, Filter, Loader2, Plus, PlusCircle, Save, Shield, Trash2, XCircle } from 'lucide-react';

interface Transaction {
  id: string;
  user_id: string;
  contract_id?: string;
  escrow_id?: string;
  amount: number;
  type: 'credit' | 'debit';
  source: 'escrow' | 'withdrawal' | 'deposit' | 'refund' | 'platform_fee';
  status: 'pending' | 'completed' | 'failed';
  description?: string;
  created_at: string;
  contract?: {
    id: string;
    project?: {
      title: string;
    };
  };
}

export function ClientPaymentsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit'>('all');

  // Payment methods state (manual reference records)
  const [paymentMethods, setPaymentMethods] = useState<ClientPaymentMethod[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [paymentMethodsError, setPaymentMethodsError] = useState<string | null>(null);
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [addingPaymentMethod, setAddingPaymentMethod] = useState(false);
  const [deletingPaymentMethodId, setDeletingPaymentMethodId] = useState<string | null>(null);
  const [confirmDeletePaymentMethod, setConfirmDeletePaymentMethod] = useState<string | null>(null);
  const [newPaymentMethod, setNewPaymentMethod] = useState({
    type: 'card' as 'card' | 'paypal' | 'bank_transfer',
    cardLastFour: '',
    cardBrand: '',
    cardExpiry: '',
    paypalEmail: '',
    accountHolderName: '',
    accountNumberLastFour: '',
    bankName: '',
    isDefault: false,
  });

  // Saved cards from Razorpay tokenization
  const [savedCards, setSavedCards] = useState<SavedPaymentCard[]>([]);
  const [savedCardsLoading, setSavedCardsLoading] = useState(false);
  const [deletingSavedCardId, setDeletingSavedCardId] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        contract:contracts!transactions_contract_id_fkey(
          id,
          project:projects(title)
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
    } else {
      setTransactions(data as unknown as Transaction[] || []);
    }
    setLoading(false);
  }, [user?.id]);

  const fetchPaymentMethods = useCallback(async () => {
    setPaymentMethodsLoading(true);
    setPaymentMethodsError(null);
    try {
      const result = await clientPaymentMethodsService.getPaymentMethods();
      if (result.success && result.methods) {
        setPaymentMethods(result.methods);
      } else {
        setPaymentMethodsError(result.error || 'Failed to load payment methods');
      }
    } catch (err) {
      setPaymentMethodsError('Failed to load payment methods');
    } finally {
      setPaymentMethodsLoading(false);
    }
  }, []);

  const fetchSavedCards = useCallback(async () => {
    setSavedCardsLoading(true);
    try {
      const cards = await razorpayService.getSavedCards();
      setSavedCards(cards);
    } catch {
      // Saved cards fetch is non-critical
    } finally {
      setSavedCardsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
    void fetchPaymentMethods();
    void fetchSavedCards();

    const subscription = realtimeChannels.transactions(`client-payments-${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${user?.id}` as any,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTransactions((prev) => [payload.new as Transaction, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTransactions((prev) =>
              prev.map((t) => (t.id === payload.new.id ? (payload.new as Transaction) : t))
            );
          }
        }
      )
      .subscribe();

    const paypalSub = supabase
      .channel(`client-paypal-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'paypal_orders' },
        () => void fetchTransactions()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      void paypalSub.unsubscribe();
    };
  }, [user?.id, fetchTransactions, fetchPaymentMethods, fetchSavedCards]);

  const handleAddPaymentMethod = async () => {
    if (!user?.id) return;
    setAddingPaymentMethod(true);
    setPaymentMethodsError(null);
    try {
      const formData: {
        type: 'card' | 'paypal' | 'bank_transfer';
        card_last_four?: string | null;
        card_brand?: string | null;
        card_expiry?: string | null;
        paypal_email?: string | null;
        account_holder_name?: string | null;
        account_number_last_four?: string | null;
        bank_name?: string | null;
        is_default?: boolean;
      } = { type: newPaymentMethod.type };

      if (newPaymentMethod.type === 'card') {
        formData.card_last_four = newPaymentMethod.cardLastFour || null;
        formData.card_brand = newPaymentMethod.cardBrand || null;
        formData.card_expiry = newPaymentMethod.cardExpiry || null;
      } else if (newPaymentMethod.type === 'paypal') {
        formData.paypal_email = newPaymentMethod.paypalEmail || null;
      } else if (newPaymentMethod.type === 'bank_transfer') {
        formData.account_holder_name = newPaymentMethod.accountHolderName || null;
        formData.account_number_last_four = newPaymentMethod.accountNumberLastFour || null;
        formData.bank_name = newPaymentMethod.bankName || null;
      }

      if (paymentMethods.length === 0 || newPaymentMethod.isDefault) {
        formData.is_default = true;
      }

      const result = await clientPaymentMethodsService.addPaymentMethod(formData);
      if (!result.success) {
        setPaymentMethodsError(result.error || 'Failed to add payment method');
        return;
      }

      setShowAddPaymentMethod(false);
      setNewPaymentMethod({
        type: 'card',
        cardLastFour: '',
        cardBrand: '',
        cardExpiry: '',
        paypalEmail: '',
        accountHolderName: '',
        accountNumberLastFour: '',
        bankName: '',
        isDefault: false,
      });
      void fetchPaymentMethods();
    } catch (err) {
      setPaymentMethodsError('Failed to add payment method');
    } finally {
      setAddingPaymentMethod(false);
    }
  };

  const handleRemovePaymentMethod = async (id: string) => {
    if (!user?.id) return;
    setDeletingPaymentMethodId(id);
    setPaymentMethodsError(null);
    try {
      const result = await clientPaymentMethodsService.deletePaymentMethod(id);
      if (!result.success) {
        setPaymentMethodsError(result.error || 'Failed to delete payment method');
        return;
      }
      void fetchPaymentMethods();
    } catch (err) {
      setPaymentMethodsError('Failed to delete payment method');
    } finally {
      setDeletingPaymentMethodId(null);
      setConfirmDeletePaymentMethod(null);
    }
  };

  const handleSetDefaultPaymentMethod = async (id: string) => {
    setPaymentMethodsError(null);
    try {
      const result = await clientPaymentMethodsService.setDefaultPaymentMethod(id);
      if (!result.success) {
        setPaymentMethodsError(result.error || 'Failed to set default payment method');
        return;
      }
      void fetchPaymentMethods();
    } catch (err) {
      setPaymentMethodsError('Failed to set default payment method');
    }
  };

  const filteredTransactions = transactions.filter((t) =>
    filter === 'all' ? true : t.type === filter
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'escrow':
        return <CreditCard className="w-4 h-4" />;
      case 'withdrawal':
        return <ArrowUpRight className="w-4 h-4" />;
      case 'deposit':
        return <ArrowDownLeft className="w-4 h-4" />;
      default:
        return <DollarSign className="w-4 h-4" />;
    }
  };

  const formatAmount = (amount: number, type: string) => {
    return `${type === 'credit' ? '+' : '-'}$${Math.abs(amount).toLocaleString()}`;
  };

  const exportCsv = () => {
    const rows = [
      ['Date', 'Type', 'Source', 'Amount', 'Status', 'Description'],
      ...filteredTransactions.map((t) => [
        t.created_at ? new Date(t.created_at).toISOString() : '',
        t.type,
        t.source,
        String(t.amount),
        t.status,
        t.description || '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `growlancer-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-slate-500 mt-1">Manage your transactions and payment methods</p>
        </div>
        <Link
          to="/client/contracts"
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25"
        >
          <Plus className="w-5 h-5" />
          Fund Escrow
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
              Total Spent
            </h3>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight">
            $
            {transactions
              .filter((t) => t.type === 'debit' && t.status === 'completed')
              .reduce((sum, t) => sum + t.amount, 0)
              .toLocaleString()}
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
              In Escrow
            </h3>
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight">
            $
            {transactions
              .filter((t) => t.source === 'escrow' && t.status === 'pending')
              .reduce((sum, t) => sum + t.amount, 0)
              .toLocaleString()}
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
              Refunds
            </h3>
            <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-bold tracking-tight">
            $
            {transactions
              .filter((t) => t.source === 'refund' && t.status === 'completed')
              .reduce((sum, t) => sum + t.amount, 0)
              .toLocaleString()}
          </p>
        </div>
      </div>

      {/* ===== Razorpay Saved Cards Section ===== */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            Saved Payment Cards
          </h2>
        </div>

        {/* Loading */}
        {savedCardsLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="ml-2 text-sm text-slate-500">Loading saved cards...</span>
          </div>
        )}

        {/* Saved cards list */}
        {!savedCardsLoading && savedCards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {savedCards.map((card) => (
              <div
                key={card.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:border-emerald-300 transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-emerald-600" />
                    <div>
                      <span className="font-medium text-slate-900 text-sm">
                        {card.card_network || 'Card'} •••• {card.card_last_four}
                      </span>
                      <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium uppercase">
                        {card.card_type || 'Card'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setDeletingSavedCardId(card.card_id);
                      try {
                        await razorpayService.deleteSavedCard(card.card_id);
                        await fetchSavedCards();
                      } catch { /* ignore */ }
                      setDeletingSavedCardId(null);
                    }}
                    disabled={deletingSavedCardId === card.card_id}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    title="Remove saved card"
                  >
                    {deletingSavedCardId === card.card_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="text-xs text-slate-500 space-y-0.5">
                  {card.card_expiry_month && card.card_expiry_year && (
                    <p>Expires {card.card_expiry_month}/{card.card_expiry_year}</p>
                  )}
                  {card.card_holder_name && <p>{card.card_holder_name}</p>}
                  {card.last_used_at && (
                    <p>Last used {new Date(card.last_used_at).toLocaleDateString()}</p>
                  )}
                  <p>Used {card.used_count} time{card.used_count !== 1 ? 's' : ''}</p>
                </div>

                <div className="mt-3 p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                  <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    One-click pay enabled — cards are tokenized via Razorpay
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!savedCardsLoading && savedCards.length === 0 && (
          <div className="text-center py-8 text-slate-500 mb-4">
            <Shield className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No saved cards yet</p>
            <p className="text-sm mt-1">Save a card during your next escrow payment for one-click checkout</p>
          </div>
        )}

        <div className="h-px bg-slate-200 my-4" />

        {/* ===== Manual Payment Method References ===== */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-400" />
            Payment Method References
          </h3>
          {!showAddPaymentMethod && (
            <button
              onClick={() => setShowAddPaymentMethod(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-all text-sm"
            >
              <PlusCircle className="w-4 h-4" />
              Add Reference
            </button>
          )}
        </div>

        {/* Loading */}
        {paymentMethodsLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="ml-2 text-sm text-slate-500">Loading payment methods...</span>
          </div>
        )}

        {/* Error */}
        {paymentMethodsError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{paymentMethodsError}</p>
            <button
              onClick={() => void fetchPaymentMethods()}
              className="ml-auto text-xs text-red-600 hover:text-red-800 font-medium underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Method list */}
        {!paymentMethodsLoading && paymentMethods.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className={`p-4 rounded-xl border transition-all ${
                  method.is_default
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {method.type === 'card' ? (
                      <CreditCard className="w-5 h-5 text-blue-600" />
                    ) : method.type === 'paypal' ? (
                      <DollarSign className="w-5 h-5 text-blue-500" />
                    ) : (
                      <Building2 className="w-5 h-5 text-green-600" />
                    )}
                    <span className="font-medium text-slate-900 text-sm capitalize">{method.type.replace('_', ' ')}</span>
                    {method.is_default && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                        Default
                      </span>
                    )}
                  </div>
                  {/* Confirm delete inline */}
                  {confirmDeletePaymentMethod === method.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRemovePaymentMethod(method.id)}
                        disabled={deletingPaymentMethodId === method.id}
                        className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50"
                      >
                        {deletingPaymentMethodId === method.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Confirm'
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmDeletePaymentMethod(null)}
                        className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeletePaymentMethod(method.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove payment method"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="text-sm text-slate-600 space-y-0.5">
                  {method.type === 'card' && (
                    <>
                      <p className="font-medium text-slate-800">
                        {method.card_brand ? `${method.card_brand} •••• ${method.card_last_four}` : `•••• ${method.card_last_four}`}
                      </p>
                      {method.card_expiry && <p className="text-xs">Expires {method.card_expiry}</p>}
                    </>
                  )}
                  {method.type === 'paypal' && (
                    <p className="font-medium text-slate-800">{method.paypal_email}</p>
                  )}
                  {method.type === 'bank_transfer' && (
                    <>
                      <p className="font-medium text-slate-800">{method.bank_name || 'Bank Account'}</p>
                      <p className="text-xs">
                        {method.account_holder_name ? `${method.account_holder_name} — ` : ''}
                        •••• {method.account_number_last_four}
                      </p>
                    </>
                  )}
                </div>

                {!method.is_default && (
                  <button
                    onClick={() => handleSetDefaultPaymentMethod(method.id)}
                    className="mt-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Set as Default
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!paymentMethodsLoading && paymentMethods.length === 0 && !showAddPaymentMethod && (
          <div className="text-center py-8 text-slate-500">
            <CreditCard className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No payment method references saved</p>
            <p className="text-sm mt-1">Add a payment method for record-keeping purposes</p>
          </div>
        )}

        {/* Add Payment Method Form */}
        {showAddPaymentMethod && (
          <div className="p-4 border-2 border-dashed border-slate-200 rounded-xl">
            <h3 className="font-medium text-slate-900 mb-4">Add Payment Method</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Method Type</label>
                <select
                  value={newPaymentMethod.type}
                  onChange={(e) =>
                    setNewPaymentMethod({
                      ...newPaymentMethod,
                      type: e.target.value as 'card' | 'paypal' | 'bank_transfer',
                    })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                >
                  <option value="card">Credit / Debit Card</option>
                  <option value="paypal">PayPal</option>
                  <option value="bank_transfer">Bank Account</option>
                </select>
              </div>

              {newPaymentMethod.type === 'card' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Card Brand</label>
                      <input
                        type="text"
                        value={newPaymentMethod.cardBrand}
                        onChange={(e) =>
                          setNewPaymentMethod({ ...newPaymentMethod, cardBrand: e.target.value })
                        }
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                        placeholder="Visa, Mastercard..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Last 4 Digits</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={newPaymentMethod.cardLastFour}
                        onChange={(e) =>
                          setNewPaymentMethod({ ...newPaymentMethod, cardLastFour: e.target.value })
                        }
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                        placeholder="1234"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Expiry Date</label>
                    <input
                      type="text"
                      value={newPaymentMethod.cardExpiry}
                      onChange={(e) =>
                        setNewPaymentMethod({ ...newPaymentMethod, cardExpiry: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                      placeholder="MM/YY"
                    />
                  </div>
                </>
              )}

              {newPaymentMethod.type === 'paypal' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">PayPal Email</label>
                  <input
                    type="email"
                    value={newPaymentMethod.paypalEmail}
                    onChange={(e) =>
                      setNewPaymentMethod({ ...newPaymentMethod, paypalEmail: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                    placeholder="your@email.com"
                  />
                </div>
              )}

              {newPaymentMethod.type === 'bank_transfer' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Account Holder Name</label>
                    <input
                      type="text"
                      value={newPaymentMethod.accountHolderName}
                      onChange={(e) =>
                        setNewPaymentMethod({ ...newPaymentMethod, accountHolderName: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Bank Name</label>
                      <input
                        type="text"
                        value={newPaymentMethod.bankName}
                        onChange={(e) =>
                          setNewPaymentMethod({ ...newPaymentMethod, bankName: e.target.value })
                        }
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Last 4 Digits</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={newPaymentMethod.accountNumberLastFour}
                        onChange={(e) =>
                          setNewPaymentMethod({ ...newPaymentMethod, accountNumberLastFour: e.target.value })
                        }
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                        placeholder="1234"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="makeDefault"
                  checked={newPaymentMethod.isDefault}
                  onChange={(e) =>
                    setNewPaymentMethod({ ...newPaymentMethod, isDefault: e.target.checked })
                  }
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300"
                />
                <label htmlFor="makeDefault" className="text-sm text-slate-700">
                  Set as default payment method
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowAddPaymentMethod(false);
                    setPaymentMethodsError(null);
                  }}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddPaymentMethod}
                  disabled={addingPaymentMethod}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingPaymentMethod ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <PlusCircle className="w-5 h-5" />
                  )}
                  {addingPaymentMethod ? 'Adding...' : 'Save Method'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-4 border-b border-slate-200">
        {(['all', 'credit', 'debit'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 font-medium transition-colors ${
              filter === f
                ? 'text-emerald-600 border-b-2 border-emerald-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button className="ml-auto flex items-center gap-2 px-4 py-2 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors">
          <Filter className="w-4 h-4" />
          Filter
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-2 px-4 py-2 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Transactions List */}
      {filteredTransactions.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-100">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CreditCard className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            {filter === 'all' ? 'No transactions yet' : `No ${filter} transactions`}
          </h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-6">
            {filter === 'all'
              ? 'When you fund escrow for a contract or make payments, your transaction history will appear here.'
              : `You don\'t have any ${filter} transactions at the moment.`}
          </p>
          {filter === 'all' && (
            <Link
              to="/client/contracts"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-600/25 transition-all hover:-translate-y-0.5"
            >
              <FileText className="w-5 h-5" />
              View Contracts
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Transaction
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                          {getSourceIcon(transaction.source)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {transaction.description || transaction.source}
                          </p>
                          {transaction.contract?.project && (
                            <p className="text-sm text-slate-500">
                              {transaction.contract.project.title}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {new Date(transaction.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 text-xs font-bold uppercase rounded-full ${getStatusColor(
                          transaction.status
                        )}`}
                      >
                        {transaction.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={`font-bold ${
                          transaction.type === 'credit' ? 'text-emerald-600' : 'text-slate-900'
                        }`}
                      >
                        {formatAmount(transaction.amount, transaction.type)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}