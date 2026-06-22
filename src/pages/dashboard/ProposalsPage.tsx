import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, CheckCircle2, Clock, FileText, Filter, Info, List, Loader2, MessageSquare, User, View, XCircle,  } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { ConfirmModal } from '../../components/ConfirmModal';
import { realtimeChannels, tables } from '../../lib/supabase';
import type { Tables } from '../../types/supabase';

type ProposalWithProject = Tables<'proposals'> & {
  project: Tables<'projects'> & {
    client: Tables<'profiles'>;
  };
};

export function ProposalsPage() {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<ProposalWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const [withdrawingProposal, setWithdrawingProposal] = useState<string | null>(null);
  const [withdrawConfirm, setWithdrawConfirm] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const toast = useToast();
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useEffect(() => {
    if (!user) return;

    const fetchProposals = async () => {
      try {
        const { data, error } = await tables.proposals()
          .select(`
            *,
            project:projects(
              *,
              client:profiles!projects_client_id_fkey(id, name, email, avatar, deleted_at)
            )
          `)
          .eq('freelancer_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
          // Filter out proposals for projects belonging to deleted clients
          const filtered = (data as unknown as ProposalWithProject[]).filter(p => {
            const client = p.project?.client as { deleted_at?: string | null } | null;
            return client && !client.deleted_at;
          });
          setProposals(filtered);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching proposals:', error);
        setLoading(false);
      }
    };

    // Add timeout to prevent infinite loading - reduced to 3 seconds for faster UX
    const timeoutId = setTimeout(() => {
      if (loadingRef.current) {
        setLoading(false);
      }
    }, 3000);

    fetchProposals();

    const channel = realtimeChannels.proposals(`proposals-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposals',
          filter: `freelancer_id=eq.${user.id}`,
        },
        () => {
          void fetchProposals();
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      void channel.unsubscribe();
    };
  }, [user]);

  const handleWithdraw = async (proposalId: string) => {
    setWithdrawingProposal(proposalId);
    try {
      const { error } = await tables.proposals()
        .delete()
        .eq('id', proposalId);

      if (error) throw error;

      setProposals(prev => prev.filter((p) => p.id !== proposalId));
      toast.success('Proposal withdrawn successfully');
    } catch (error) {
      console.error('Error withdrawing proposal:', error);
      toast.error('Failed to withdraw proposal. Please try again.');
    } finally {
      setWithdrawingProposal(null);
      setWithdrawConfirm(null);
    }
  };

  const filteredProposals = proposals.filter((p) => p.status === activeTab);

  const pendingCount = proposals.filter((p) => p.status === 'pending').length;
  const acceptedCount = proposals.filter((p) => p.status === 'accepted').length;
  const rejectedCount = proposals.filter((p) => p.status === 'rejected').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm font-medium rounded-full">
            <Clock className="w-3 h-3" />
            Pending Review
          </span>
        );
      case 'accepted':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Accepted
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">
            <XCircle className="w-3 h-3" />
            Not Selected
          </span>
        );
      default:
        return null;
    }
  };

  const getDaysSinceSubmitted = (createdAt: string | null) => {
    if (!createdAt) return 0;
    const days = Math.floor((new Date().getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">My Proposals</h1>
            <p className="text-slate-500">
              {proposals.length} proposal{proposals.length !== 1 ? 's' : ''} submitted
            </p>
          </div>
        </div>

        <Link
          to="/dashboard/feed"
          className="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Submit New Proposal
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
              <p className="text-sm text-slate-500">Pending Review</p>
            </div>
            <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-orange-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-emerald-600">{acceptedCount}</p>
              <p className="text-sm text-slate-500">Accepted</p>
            </div>
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-slate-600">{rejectedCount}</p>
              <p className="text-sm text-slate-500">Not Selected</p>
            </div>
            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center">
              <XCircle className="w-6 h-6 text-slate-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => { setActiveTab('pending'); setPage(1); }}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'pending'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending Review
          {pendingCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
              {pendingCount}
            </span>
          )}
          {activeTab === 'pending' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('accepted'); setPage(1); }}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'accepted'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Accepted
          {acceptedCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">
              {acceptedCount}
            </span>
          )}
          {activeTab === 'accepted' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('rejected'); setPage(1); }}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'rejected'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Not Selected
          {rejectedCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
              {rejectedCount}
            </span>
          )}
          {activeTab === 'rejected' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></span>
          )}
        </button>
      </div>

      {/* Proposals List */}
      {filteredProposals.length > 0 ? (
        <>
          <div className="space-y-4">
            {filteredProposals
              .slice((page - 1) * pageSize, page * pageSize)
              .map((proposal) => {
            const daysSince = getDaysSinceSubmitted(proposal.created_at);
            
            return (
              <div
                key={proposal.id}
                className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"
              >
                <div className="flex items-start gap-6">
                  {/* Project Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        {proposal.project.title}
                      </h3>
                      {getStatusBadge(proposal.status)}
                    </div>

                    <p className="text-slate-600 mb-4 line-clamp-2">
                      {proposal.project.description}
                    </p>

                    {/* Meta Info */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mb-4">
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        Client: <span className="font-medium text-slate-700">{proposal.project.client?.name}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Submitted {new Date(proposal.created_at || '').toLocaleDateString()}
                      </span>
                      {daysSince === 0 ? (
                        <span className="text-emerald-600 font-medium">Today</span>
                      ) : daysSince === 1 ? (
                        <span className="text-orange-600 font-medium">Yesterday</span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {daysSince} days ago
                        </span>
                      )}
                    </div>

                    {/* Proposal Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                        <p className="text-xs text-emerald-600 mb-1 font-medium">Your Rate</p>
                        <p className="text-lg font-bold text-slate-900">
                          ${proposal.proposed_rate?.toLocaleString() || 'N/A'}
                          <span className="text-xs text-slate-500 font-normal ml-1">
                            /{proposal.rate_type === 'hourly' ? 'hr' : 'project'}
                          </span>
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <p className="text-xs text-slate-500 mb-1">Duration</p>
                        <p className="text-lg font-bold text-slate-900">
                          {proposal.estimated_duration} days
                        </p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <p className="text-xs text-slate-500 mb-1">Client Budget</p>
                        <p className="text-lg font-bold text-slate-900">
                          ${proposal.project.budget_min?.toLocaleString()} - ${proposal.project.budget_max?.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Your Message */}
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">Your proposal message:</span>
                      </div>
                      <p className="text-sm text-slate-600 italic">"{proposal.message}"</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {proposal.status === 'pending' && (
                      <>
                        <button
                          onClick={() => setWithdrawConfirm(proposal.id)}
                          disabled={withdrawingProposal === proposal.id}
                          className="px-6 py-2.5 border border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {withdrawingProposal === proposal.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                          Withdraw
                        </button>
                        <p className="text-xs text-slate-400 text-center">
                          Client is reviewing
                        </p>
                      </>
                    )}
                    {proposal.status === 'accepted' && (
                      <Link
                        to="/dashboard/contracts"
                        className="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                      >
                        View Contract
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
                    {proposal.status === 'rejected' && (
                      <div className="text-center">
                        <p className="text-sm text-slate-500 mb-2">Client chose another freelancer</p>
                        <Link
                          to="/dashboard/feed"
                          className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                        >
                          Find Similar Projects
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          <Pagination
            currentPage={page}
            totalItems={filteredProposals.length}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </>
      ) : (
        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="font-display text-xl font-bold text-slate-900 mb-2">
            {activeTab === 'pending'
              ? 'No pending proposals'
              : activeTab === 'accepted'
              ? 'No accepted proposals yet'
              : 'No rejected proposals'}
          </h3>
          <p className="text-slate-500 max-w-md mx-auto mb-6">
            {activeTab === 'pending'
              ? 'You have no proposals waiting for client review. Browse projects and submit proposals.'
              : activeTab === 'accepted'
              ? 'Accepted proposals become contracts. Keep submitting quality proposals!'
              : 'Don\'t be discouraged. Review your approach and try again.'}
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

      <ConfirmModal
        isOpen={!!withdrawConfirm}
        onClose={() => setWithdrawConfirm(null)}
        onConfirm={() => withdrawConfirm ? handleWithdraw(withdrawConfirm) : Promise.resolve()}
        title="Withdraw Proposal"
        message="Are you sure you want to withdraw this proposal? This action cannot be undone."
        confirmLabel="Withdraw"
        variant="warning"
      />
    </div>
  );
}
