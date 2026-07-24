import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowRight, Briefcase, Calendar, CheckCircle2, ChevronDown, ChevronRight, Clock, DollarSign, FileText, Handshake, Loader2, Shield, ThumbsUp, User, Wallet,  } from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { supabase, realtimeChannels } from '../../lib/supabase';
import type { Tables } from '../../types/supabase';
import { milestoneService, getMilestoneProgress } from '../../lib/contractMilestones';
import type { MilestoneItem } from '../../lib/contractMilestones';

type ContractWithDetails = Tables<'contracts'> & {
  projects: Tables<'projects'>;
  profiles: Tables<'profiles'>;
};

interface EscrowState {
  loaded: boolean;
  balance?: {
    totalAmount: number;
    fundedAmount: number;
    heldAmount: number;
    releasedAmount: number;
    milestoneCount: number;
    fundedMilestoneCount: number;
    isFullyFunded: boolean;
    isPartiallyFunded: boolean;
  };
  error?: string;
}

/** Color-coded milestone progress bar displayed on each contract card. */
function MilestoneProgressBar({ milestones }: { milestones: MilestoneItem[] }) {
  const progress = getMilestoneProgress(milestones);
  if (progress.total === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-slate-600">
          Milestones: {progress.completed}/{progress.total}
        </span>
        <span className="text-xs font-bold text-slate-700">{progress.percent}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${
            progress.percent === 100
              ? 'bg-emerald-500'
              : progress.percent >= 50
              ? 'bg-blue-500'
              : 'bg-amber-500'
          }`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}

/** Displays escrow funding status badge. */
function EscrowStatusBadge({ balance }: { balance: EscrowState['balance'] | undefined }) {
  if (!balance) return null;

  if (balance.isFullyFunded) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
        <Shield className="w-3 h-3" />
        Fully Funded
      </span>
    );
  }
  if (balance.isPartiallyFunded || balance.fundedAmount > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
        <AlertTriangle className="w-3 h-3" />
        Partially Funded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 text-xs font-medium rounded-full">
      <DollarSign className="w-3 h-3" />
      Not Funded
    </span>
  );
}

export function ContractsPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<ContractWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'all'>('active');
  const [selectedContract, setSelectedContract] = useState<ContractWithDetails | null>(null);
  const pageSize = 20;
  const pageRef = useRef(0);

  // Escrow balances keyed by contract ID
  const [escrowBalances, setEscrowBalances] = useState<Record<string, EscrowState>>({});
  // Action loading states
  const [releasingMilestone, setReleasingMilestone] = useState<{ contractId: string; idx: number } | null>(null);
  const [disputingMilestone, setDisputingMilestone] = useState<{ contractId: string; idx: number } | null>(null);
  const [disputeReason, setDisputeReason] = useState<string>('');
  const [disputeModal, setDisputeModal] = useState<{ contractId: string; idx: number } | null>(null);

  const fetchContracts = useCallback(async (loadMore = false) => {
    if (!user) return;

    try {
      const currentPage = pageRef.current;
      const from = loadMore ? (currentPage + 1) * pageSize : 0;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          projects!inner(*),
          profiles!contracts_client_id_fkey(*)
        `)
        .eq('freelancer_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      if (data) {
        const newContracts = data as unknown as ContractWithDetails[];

        if (loadMore) {
          setContracts(prev => [...prev, ...newContracts]);
          pageRef.current = currentPage + 1;
        } else {
          setContracts(newContracts);
          pageRef.current = 0;

          // Load escrow balances only on initial load
          const balanceMap: Record<string, EscrowState> = {};
          await Promise.all(
            newContracts.map(async (contract) => {
              const result = await milestoneService.getEscrowBalance(contract.id);
              if (result.success && result.balance) {
                balanceMap[contract.id] = { loaded: true, balance: result.balance };
              } else {
                balanceMap[contract.id] = { loaded: true, error: result.error };
              }
            })
          );
          setEscrowBalances(balanceMap);
        }

        // Load escrow balances for new items if loading more
        if (loadMore) {
          const balanceMap: Record<string, EscrowState> = {};
          await Promise.all(
            newContracts.map(async (contract) => {
              const result = await milestoneService.getEscrowBalance(contract.id);
              if (result.success && result.balance) {
                balanceMap[contract.id] = { loaded: true, balance: result.balance };
              } else {
                balanceMap[contract.id] = { loaded: true, error: result.error };
              }
            })
          );
          setEscrowBalances(prev => ({ ...prev, ...balanceMap }));
        }

        setHasMore(newContracts.length === pageSize);
      }

      setLoading(false);
      setLoadingMore(false);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, pageSize]);

  useEffect(() => {
    if (!user) return;

    // Add timeout to prevent infinite loading - reduced to 3 seconds for faster UX
    const timeoutId = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 3000);

    fetchContracts();

    // Real-time subscription for contract updates
    const channel = realtimeChannels.contracts(`contracts-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contracts',
          filter: `freelancer_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setContracts(prev =>
              prev.map((c) =>
                c.id === payload.new.id ? { ...c, ...payload.new } : c
              )
            );
            milestoneService.getEscrowBalance(payload.new.id).then((result) => {
              if (result.success && result.balance) {
                setEscrowBalances(prev => ({
                  ...prev,
                  [payload.new.id]: { loaded: true, balance: result.balance },
                }));
              }
            });
          } else if (payload.eventType === 'INSERT') {
            supabase
              .from('contracts')
              .select(`
                *,
                projects!inner(*),
                profiles!contracts_client_id_fkey(*)
              `)
              .eq('id', payload.new.id)
              .single()
              .then(({ data }) => {
                if (data) {
                  setContracts(prev => [data as unknown as ContractWithDetails, ...prev]);
                  milestoneService.getEscrowBalance(payload.new.id).then((result) => {
                    if (result.success && result.balance) {
                      setEscrowBalances(prev => ({
                        ...prev,
                        [payload.new.id]: { loaded: true, balance: result.balance },
                      }));
                    }
                  });
                }
              });
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      channel.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, fetchContracts]);

  const filteredContracts = contracts.filter((c) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return ['active', 'in_progress'].includes(c.status || '');
    if (activeTab === 'completed') return c.status === 'completed';
    return true;
  });

  const activeCount = contracts.filter((c) => ['active', 'in_progress'].includes(c.status || '')).length;
  const completedCount = contracts.filter((c) => c.status === 'completed').length;

  const totalEarnings = contracts
    .filter((c) => ['active', 'completed'].includes(c.status || ''))
    .reduce((sum, c) => sum + c.freelancer_amount, 0);

  const totalEscrowHeld = Object.values(escrowBalances).reduce(
    (sum, state) => sum + (state.balance?.heldAmount || 0),
    0
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
      case 'in_progress':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
            <Clock className="w-3 h-3" />
            In Progress
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleReleaseMilestone = async (contractId: string, milestoneIndex: number) => {
    setReleasingMilestone({ contractId, idx: milestoneIndex });
    try {
      // Call releaseMilestonePayment — uses the release_milestone RPC which
      // has FOR UPDATE row locking to prevent double-release race conditions.
      const result = await milestoneService.releaseMilestonePayment(contractId, milestoneIndex);
      if (!result.success) {
        console.error('Failed to release milestone payment:', result.error);
      }
      // Refresh escrow balance
      const balanceResult = await milestoneService.getEscrowBalance(contractId);
      if (balanceResult.success && balanceResult.balance) {
        setEscrowBalances(prev => ({
          ...prev,
          [contractId]: { loaded: true, balance: balanceResult.balance },
        }));
      }
    } finally {
      setReleasingMilestone(null);
    }
  };

  const handleDisputeMilestone = async () => {
    if (!disputeModal) return;
    const { contractId, idx } = disputeModal;
    if (!disputeReason.trim()) return;

    setDisputingMilestone({ contractId, idx });
    try {
      const result = await milestoneService.disputeMilestone(
        contractId,
        idx,
        disputeReason.trim(),
        disputeReason.trim()
      );
      if (!result.success) {
        console.error('Failed to dispute milestone:', result.error);
      }
      setDisputeModal(null);
      setDisputeReason('');
      // Refresh escrow balance
      const balanceResult = await milestoneService.getEscrowBalance(contractId);
      if (balanceResult.success && balanceResult.balance) {
        setEscrowBalances(prev => ({
          ...prev,
          [contractId]: { loaded: true, balance: balanceResult.balance },
        }));
      }
    } finally {
      setDisputingMilestone(null);
    }
  };

  const milestones = (raw: unknown): MilestoneItem[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as MilestoneItem[];
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as MilestoneItem[]; } catch { return []; }
    }
    return [];
  };

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Handshake className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">My Contracts</h1>
            <p className="text-slate-500">
              {activeCount} active contract{activeCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
            <p className="text-xs text-emerald-600">Total Earnings</p>
            <p className="text-xl font-bold text-emerald-700">{formatCurrency(totalEarnings)}</p>
          </div>
          <div className="px-4 py-2 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs text-blue-600">Escrow Held</p>
            <p className="text-xl font-bold text-blue-700">{formatCurrency(totalEscrowHeld)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'active'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Active
          {activeCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
              {activeCount}
            </span>
          )}
          {activeTab === 'active' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'completed'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Completed
          {completedCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">
              {completedCount}
            </span>
          )}
          {activeTab === 'completed' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'all'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          All
          {activeTab === 'all' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></span>
          )}
        </button>
      </div>

      {/* Contracts List */}
      {filteredContracts.length > 0 ? (
        <>
          <div className="space-y-4">
            {filteredContracts.map((contract) => {
            const contractMilestones = milestones(contract.milestones);
            const escrowState = escrowBalances[contract.id];
            const balance = escrowState?.balance;

            return (
              <div
                key={contract.id}
                className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedContract(selectedContract?.id === contract.id ? null : contract)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        {contract.projects.title}
                      </h3>
                      {getStatusBadge(contract.status || 'active')}
                      {balance && <EscrowStatusBadge balance={balance} />}
                    </div>

                    {/* Client Info */}
                    <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        Client: <span className="font-medium text-slate-700">{contract.profiles?.name}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Started {new Date(contract.start_date || '').toLocaleDateString()}
                      </span>
                      {contract.end_date && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          Ends {new Date(contract.end_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Financial Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-4">
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <p className="text-xs text-slate-500 mb-1">Contract Value</p>
                        <p className="text-lg font-bold text-slate-900">{formatCurrency(contract.amount)}</p>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl">
                        <p className="text-xs text-emerald-600 mb-1">Your Earnings</p>
                        <p className="text-lg font-bold text-emerald-700">{formatCurrency(contract.freelancer_amount)}</p>
                      </div>
                      <div className="p-3 bg-blue-50 rounded-xl">
                        <p className="text-xs text-blue-600 mb-1">Platform Fee</p>
                        <p className="text-lg font-bold text-blue-700">{formatCurrency(contract.platform_fee)}</p>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-xl">
                        <p className="text-xs text-purple-600 mb-1">Status</p>
                        <p className="text-lg font-bold text-purple-700 capitalize">{contract.status}</p>
                      </div>
                      {/* Escrow Balance Indicator */}
                      <div className={`p-3 rounded-xl ${
                        balance?.isFullyFunded
                          ? 'bg-emerald-50'
                          : balance && balance.fundedAmount > 0
                          ? 'bg-amber-50'
                          : 'bg-slate-50'
                      }`}>
                        <p className="text-xs text-slate-500 mb-1">Escrow</p>
                        <p className={`text-lg font-bold ${
                          balance?.isFullyFunded
                            ? 'text-emerald-700'
                            : balance && balance.fundedAmount > 0
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}>
                          {formatCurrency(balance?.heldAmount || 0)}
                        </p>
                        {balance && (
                          <p className="text-xs mt-0.5 text-slate-400">
                            {balance.isFullyFunded
                              ? 'Fully funded'
                              : balance.fundedAmount > 0
                              ? `${formatCurrency(balance.fundedAmount)} funded`
                              : 'Not funded'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Milestone Progress Bar */}
                    {contractMilestones.length > 0 && (
                      <div className="mb-4">
                        <MilestoneProgressBar milestones={contractMilestones} />
                      </div>
                    )}

                    {/* Milestones */}
                    {contractMilestones.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium text-slate-700 mb-2">Milestones</p>
                        <div className="space-y-2">
                          {contractMilestones.map((milestone, idx) => {
                            const mStatus = String(milestone.status || 'pending').toLowerCase();
                            const isCompleted = ['completed', 'approved', 'released', 'paid'].includes(mStatus);
                            const isDisputed = mStatus === 'disputed';
                            const isInProgress = mStatus === 'in_progress';

                            return (
                              <div
                                key={idx}
                                className={`flex items-center justify-between p-3 rounded-lg ${
                                  isCompleted
                                    ? 'bg-emerald-50'
                                    : isDisputed
                                    ? 'bg-red-50'
                                    : 'bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                    isCompleted
                                      ? 'bg-emerald-500 text-white'
                                      : isDisputed
                                      ? 'bg-red-500 text-white'
                                      : isInProgress
                                      ? 'bg-blue-500 text-white'
                                      : 'bg-slate-200 text-slate-600'
                                  }`}>
                                    {isCompleted ? (
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    ) : isDisputed ? (
                                      <AlertCircle className="w-3.5 h-3.5" />
                                    ) : (
                                      idx + 1
                                    )}
                                  </span>
                                  <div>
                                    <span className="text-sm text-slate-700">{milestone.title || `Milestone ${idx + 1}`}</span>
                                    <span className={`ml-2 text-xs font-medium capitalize ${
                                      isCompleted
                                        ? 'text-emerald-600'
                                        : isDisputed
                                        ? 'text-red-600'
                                        : 'text-slate-400'
                                    }`}>
                                      {mStatus.replace('_', ' ')}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-900">
                                    {formatCurrency(milestone.amount || 0)}
                                  </span>

                                  {/* Release Payment button - shown when milestone is completed and not yet released */}
                                  {mStatus === 'completed' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleReleaseMilestone(contract.id, idx);
                                      }}
                                      disabled={releasingMilestone?.contractId === contract.id && releasingMilestone?.idx === idx}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                                    >
                                      {releasingMilestone?.contractId === contract.id && releasingMilestone?.idx === idx ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <ThumbsUp className="w-3 h-3" />
                                      )}
                                      Release
                                    </button>
                                  )}

                                  {/* Dispute button - shown when milestone is in progress or completed but not released */}
                                  {(isInProgress || mStatus === 'completed') && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDisputeModal({ contractId: contract.id, idx });
                                        setDisputeReason('');
                                      }}
                                      className="px-3 py-1.5 border border-red-200 hover:bg-red-50 text-red-600 text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      Dispute
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Escrow Balance Summary */}
                    {balance && (
                      <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600 font-medium">Escrow Summary</span>
                          <span className="text-xs text-slate-400">
                            {balance.fundedMilestoneCount} of {balance.milestoneCount} milestones funded
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 mt-2">
                          <div>
                            <p className="text-xs text-slate-500">Funded</p>
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(balance.fundedAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Held</p>
                            <p className="text-sm font-bold text-emerald-700">{formatCurrency(balance.heldAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Released</p>
                            <p className="text-sm font-bold text-blue-700">{formatCurrency(balance.releasedAmount)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/dashboard/workspace?contract=${contract.id}`}
                        className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Briefcase className="w-4 h-4" />
                        Workspace
                      </Link>
                      <button
                        className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FileText className="w-4 h-4" />
                        View Contract
                      </button>
                      <Link
                        to={`/dashboard/wallet?contract=${contract.id}`}
                        className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Wallet className="w-4 h-4" />
                        Escrow Details
                      </Link>
                    </div>
                  </div>

                  <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${selectedContract?.id === contract.id ? 'rotate-90' : ''}`} />
                </div>
              </div>
            );
          }            )}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => { setLoadingMore(true); fetchContracts(true); }}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                ) : (
                  <><ChevronDown className="w-4 h-4" /> Load More Contracts</>
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Handshake className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="font-display text-xl font-bold text-slate-900 mb-2">
            {activeTab === 'active'
              ? 'No active contracts'
              : activeTab === 'completed'
              ? 'No completed contracts yet'
              : 'No contracts'}
          </h3>
          <p className="text-slate-500 max-w-md mx-auto mb-6">
            {activeTab === 'active'
              ? 'You have no active contracts. Submit proposals to get hired!'
              : activeTab === 'completed'
              ? 'Your completed contracts will appear here. Keep up the good work!'
              : 'Start your freelance journey by submitting proposals to projects.'}
          </p>
          <Link
            to="/dashboard/feed"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors"
          >
            Browse Projects
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Dispute Modal */}
      {disputeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setDisputeModal(null); setDisputeReason(''); }}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Dispute Milestone</h3>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to dispute milestone "{milestones(
                contracts.find((c) => c.id === disputeModal.contractId)?.milestones
              )[disputeModal.idx]?.title || `Milestone ${disputeModal.idx + 1}`}"?
              This will create a dispute case that needs resolution.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Reason for Dispute
              </label>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Describe the issue with this milestone..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setDisputeModal(null); setDisputeReason(''); }}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDisputeMilestone}
                disabled={!disputeReason.trim() || disputingMilestone !== null}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
              >
                {disputingMilestone ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Submit Dispute
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}