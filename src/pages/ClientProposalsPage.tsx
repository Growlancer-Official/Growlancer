import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, realtimeChannels } from '../lib/supabase';
import { hireFreelancerFromProposal, rejectProposal } from '../lib/workflowService';
import { CheckCircle, Clock, DollarSign, ExternalLink, Eye, FileText, MoreVertical, Plus, Star, User, XCircle,  } from 'lucide-react';

interface Proposal {
  id: string;
  project_id: string;
  freelancer_id: string;
  bid_amount: number;
  cover_letter: string;
  estimated_duration: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  created_at: string;
  project?: {
    id: string;
    title: string;
    budget_min: number;
    budget_max: number;
  };
    freelancer?: {
      id: string;
      name: string;
      avatar?: string;
      deleted_at?: string | null;
      freelancer_profiles?: {
        rating?: number;
        hourly_rate?: number;
        completed_projects?: number;
      } | {
        rating?: number;
        hourly_rate?: number;
        completed_projects?: number;
      }[];
    };
  }

/* ── Dropdown menu for each proposal card ── */
function ProposalMenu({
  proposalId,
  freelancerId,
  status,
  onAccept,
  onReject,
}: {
  proposalId: string;
  freelancerId: string;
  status: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-2 hover:bg-slate-100 rounded-lg transition-colors relative z-10"
      >
        <MoreVertical className="w-5 h-5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white rounded-xl border border-slate-200 shadow-xl py-1.5 animate-in fade-in slide-in-from-top-1">
          <Link
            to={`/client/proposals?freelancer=${freelancerId}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            onClick={() => setOpen(false)}
          >
            <ExternalLink className="w-4 h-4 text-slate-400" />
            <span>View Freelancer Profile</span>
          </Link>

          {status === 'pending' && (
            <>
              <div className="h-px bg-slate-100 my-1.5 mx-3" />
              <button
                onClick={() => { setOpen(false); onAccept(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Accept & Hire</span>
              </button>
              <button
                onClick={() => { setOpen(false); onReject(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ClientProposalsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected'>('all');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageSize = 20;
  const pageRef = useRef(0);

  const fetchProposals = useCallback(async (loadMore = false) => {
    if (!user) return;
    if (loadMore) setLoadingMore(true);
    try {
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .eq('client_id', user.id);

      const projectIds = projects?.map((p) => p.id) || [];

      if (projectIds.length === 0) {
        setProposals([]);
        setLoading(false);
        return;
      }

      const currentPage = pageRef.current;
      const from = loadMore ? (currentPage + 1) * pageSize : 0;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from('proposals')
        .select(`
            *,
            project:projects(id, title, budget_min, budget_max),
            freelancer:profiles!proposals_freelancer_id_fkey(
              id, 
              name, 
              avatar, 
              deleted_at,
              freelancer_profiles(rating, hourly_rate, completed_projects)
            )
          `)
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      if (data) {
        // Filter out proposals from deleted users
        const validProposals = (data as unknown as Proposal[]).filter(p => {
          return p.freelancer && !p.freelancer.deleted_at;
        });
        if (loadMore) {
          setProposals(prev => [...prev, ...validProposals]);
          pageRef.current = currentPage + 1;
        } else {
          setProposals(validProposals);
          pageRef.current = 0;
        }
        setHasMore(validProposals.length === pageSize);
      }
    } catch (error) {
      console.error('Error fetching proposals:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    void fetchProposals();

    const subscription = realtimeChannels.proposals(`client-proposals-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proposals' },
        () => {
          void fetchProposals();
        }
      )
      .subscribe();

    return () => {
      void subscription.unsubscribe();
    };
  }, [user, fetchProposals]);

  const filteredProposals = proposals.filter((p) =>
    filter === 'all' ? true : p.status === filter
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'accepted':
        return 'bg-emerald-100 text-emerald-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      case 'withdrawn':
        return 'bg-slate-100 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const handleAccept = async (proposal: Proposal) => {
    if (!user) return;
    setActionId(proposal.id);
    setActionError(null);
    const result = await hireFreelancerFromProposal(proposal.id, user.id, { useEscrowRpc: true });
    if (!result.success) {
      setActionError((result as any).error);
      setActionId(null);
      return;
    }
    await fetchProposals();
    setActionId(null);
    navigate(`/client/workspace?contract=${result.contractId}`);
  };

  const handleReject = async (proposalId: string) => {
    setActionId(proposalId);
    setActionError(null);
    const ok = await rejectProposal(proposalId);
    if (!ok) setActionError('Could not reject proposal');
    else await fetchProposals();
    setActionId(null);
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
          <h1 className="font-display text-2xl font-bold text-slate-900">Proposals</h1>
          <p className="text-slate-500 mt-1">Review and manage proposals from freelancers</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-700 rounded-xl">
          <FileText className="w-5 h-5" />
          <span className="font-bold">{proposals.length} Proposals</span>
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2">{actionError}</p>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(['all', 'pending', 'accepted', 'rejected'] as const).map((f) => (
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
      </div>

      {/* Proposals List */}
      {filteredProposals.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-100">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <FileText className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            {filter === 'all' ? 'No proposals yet' : `No ${filter} proposals`}
          </h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-6">
            {filter === 'all'
              ? 'Post a project to start receiving proposals from interested freelancers.'
              : `You don\'t have any ${filter} proposals at the moment.`}
          </p>
          {filter === 'all' ? (
            <Link
              to="/client/post"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-600/25 transition-all hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5" />
              Post a Project
            </Link>
          ) : (
            <Link
              to="/client/proposals"
              className="text-emerald-600 font-medium hover:underline text-sm"
            >
              View all proposals →
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {filteredProposals.map((proposal) => (
            <div
              key={proposal.id}
              className="bg-white p-6 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                    {proposal.freelancer?.avatar ? (
                      <img src={proposal.freelancer.avatar} alt={proposal.freelancer.name} />
                    ) : (
                      <User className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-slate-900">
                      {proposal.freelancer?.name || 'Unknown Freelancer'}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span>
                          {(() => {
                            const fp = Array.isArray(proposal.freelancer?.freelancer_profiles) 
                              ? proposal.freelancer.freelancer_profiles[0] 
                              : proposal.freelancer?.freelancer_profiles;
                            return fp?.rating ? Number(fp.rating).toFixed(1) : '—';
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        <span>
                          ${(() => {
                            const fp = Array.isArray(proposal.freelancer?.freelancer_profiles) 
                              ? proposal.freelancer.freelancer_profiles[0] 
                              : proposal.freelancer?.freelancer_profiles;
                            return fp?.hourly_rate || 0;
                          })()}/hr
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 text-xs font-bold uppercase rounded-full ${getStatusColor(
                      proposal.status
                    )}`}
                  >
                    {proposal.status}
                  </span>
                  <ProposalMenu
                    proposalId={proposal.id}
                    freelancerId={proposal.freelancer_id}
                    status={proposal.status}
                    onAccept={() => handleAccept(proposal)}
                    onReject={() => handleReject(proposal.id)}
                  />
                </div>
              </div>

              {proposal.project && (
                <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Project:</span> {proposal.project.title}
                  </p>
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Budget:</span> ${proposal.project.budget_min?.toLocaleString()} - ${proposal.project.budget_max?.toLocaleString()}
                  </p>
                </div>
              )}

              <div className="mb-4 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-700 line-clamp-3">{proposal.cover_letter}</p>
              </div>

              <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  <span className="font-bold text-slate-900">${proposal.bid_amount.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{proposal.estimated_duration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Submitted {new Date(proposal.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {proposal.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={actionId === proposal.id}
                    onClick={() => handleAccept(proposal)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {actionId === proposal.id ? 'Hiring…' : 'Accept & Hire'}
                  </button>
                  <button
                    type="button"
                    disabled={actionId === proposal.id}
                    onClick={() => handleReject(proposal.id)}
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                  <Link
                    to="/client/matches"
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Find more talent
                  </Link>
                </div>
              )}
            </div>
          ))}
            </div>
          </>
      )}

      {/* Load More */}
      {filteredProposals.length > 0 && hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => fetchProposals(true)}
            disabled={loadingMore}
            className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load More Proposals'}
          </button>
        </div>
      )}
    </div>
  );
}
