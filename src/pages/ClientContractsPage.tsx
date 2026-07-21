import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, realtimeChannels } from '../lib/supabase';
import { AlertCircle, Calendar, Clock, DollarSign, FileText, Handshake, Laptop, User, Users,  } from 'lucide-react';

interface Contract {
  id: string;
  project_id: string;
  freelancer_id: string;
  client_id: string;
  proposal_id?: string;
  amount: number;
  status: string | null;
  start_date: string | null;
  end_date?: string | null;
  created_at: string | null;
  project?: { id: string; title: string } | null;
  freelancer?: { id: string; name: string; avatar?: string | null } | null;
  escrow?: { id: string; amount: number; status: string }[] | { id: string; amount: number; status: string } | null;
}

function getEscrow(c: Contract) {
  if (!c.escrow) return null;
  return Array.isArray(c.escrow) ? c.escrow[0] : c.escrow;
}

function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
    </div>
  );
}

export function ClientContractsPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'pending'>('all');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageSize = 20;
  const pageRef = useRef(0);

  const fetchContracts = useCallback(async (loadMore = false) => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const currentPage = pageRef.current;
    const from = loadMore ? (currentPage + 1) * pageSize : 0;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        project:projects(id, title),
        freelancer:profiles!contracts_freelancer_id_fkey(id, name, avatar),
        escrow(id, amount, status)
      `)
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching contracts:', error);
    } else {
      const newContracts = (data as Contract[]) || [];
      if (loadMore) {
        setContracts(prev => [...prev, ...newContracts]);
        pageRef.current = currentPage + 1;
      } else {
        setContracts(newContracts);
        pageRef.current = 0;
      }
      setHasMore(newContracts.length === pageSize);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    void fetchContracts();

    const subscription = realtimeChannels
      .contracts(`client-contracts-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contracts',
          filter: `client_id=eq.${user.id}`,
        },
        () => {
          void fetchContracts();
        }
      )
      .subscribe();

    return () => {
      void subscription.unsubscribe();
    };
  }, [user?.id, fetchContracts]);

  const filteredContracts = contracts.filter((c) => {
    if (filter === 'all') return true;
    if (filter === 'active') return c.status === 'active' || c.status === 'in_progress';
    if (filter === 'completed') return c.status === 'completed';
    if (filter === 'pending') return c.status === 'pending' || c.status === 'draft';
    return true;
  });

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'pending':
      case 'draft':
        return 'bg-yellow-100 text-yellow-700';
      case 'active':
      case 'in_progress':
        return 'bg-emerald-100 text-emerald-700';
      case 'completed':
        return 'bg-blue-100 text-blue-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'disputed':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  if (loading) {
    return <PageSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Contracts</h1>
          <p className="text-slate-500 mt-1">Manage active and completed contracts with freelancers</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl">
          <Handshake className="w-5 h-5" />
          <span className="font-bold">{contracts.length} Contracts</span>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(['all', 'active', 'completed', 'pending'] as const).map((f) => (
          <button
            key={f}
            type="button"
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

      {filteredContracts.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-100">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Handshake className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            {filter === 'all' ? 'No contracts yet' : `No ${filter} contracts`}
          </h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-6">
            {filter === 'all'
              ? 'Contracts are created when you accept a proposal or a freelancer accepts your invite. Then you can manage milestones, escrow, and payments here.'
              : `You don't have any ${filter} contracts at the moment.`}
          </p>
          {filter === 'all' ? (
            <div className="flex gap-3 justify-center">
              <Link
                to="/client/proposals"
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-600/25 transition-all hover:-translate-y-0.5"
              >
                <FileText className="w-5 h-5" />
                View Proposals
              </Link>
              <Link
                to="/client/matches"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all"
              >
                <Users className="w-5 h-5" />
                Find Freelancers
              </Link>
            </div>
          ) : (
            <Link
              to="/client/contracts"
              className="text-emerald-600 font-medium hover:underline text-sm"
            >
              View all contracts →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredContracts.map((contract) => {
            const escrow = getEscrow(contract);
            return (
              <div
                key={contract.id}
                className="bg-white p-6 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                      {contract.freelancer?.avatar ? (
                        <img src={contract.freelancer.avatar} alt={contract.freelancer.name} />
                      ) : (
                        <User className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-slate-900">
                        {contract.freelancer?.name || 'Unknown Freelancer'}
                      </h3>
                      {contract.project && (
                        <p className="text-sm text-slate-500">{contract.project.title}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 text-xs font-bold uppercase rounded-full ${getStatusColor(
                      contract.status
                    )}`}
                  >
                    {contract.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <DollarSign className="w-4 h-4" />
                    <span className="font-medium text-slate-900">
                      ${Number(contract.amount).toLocaleString()}
                    </span>
                  </div>
                  {contract.start_date && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Calendar className="w-4 h-4" />
                      <span>Started: {new Date(contract.start_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {contract.end_date && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Clock className="w-4 h-4" />
                      <span>Ends: {new Date(contract.end_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {escrow && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <FileText className="w-4 h-4" />
                      <span>
                        Escrow: ${escrow.amount.toLocaleString()} ({escrow.status})
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Link
                    to={`/client/workspace?contract=${contract.id}`}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700"
                  >
                    <Laptop className="w-4 h-4" />
                    Open Workspace
                  </Link>
                  <Link
                    to="/client/payments"
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 font-medium rounded-lg hover:bg-slate-50"
                  >
                    <DollarSign className="w-4 h-4" />
                    Payments
                  </Link>
                  {(contract.status === 'active' || contract.status === 'in_progress') && (
                    <Link
                      to={`/client/workspace?contract=${contract.id}`}
                      className="flex items-center gap-2 px-4 py-2 text-slate-600 font-medium rounded-lg hover:bg-slate-50"
                    >
                      <AlertCircle className="w-4 h-4" />
                      Report Issue
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {filteredContracts.length > 0 && hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => fetchContracts(true)}
            disabled={loadingMore}
            className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : 'Load More Contracts'}
          </button>
        </div>
      )}
    </div>
  );
}
