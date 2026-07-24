import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, DollarSign, Eye, Filter, Loader2, Plus, Trash2, Trophy, Users,  } from 'lucide-react';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { supabase } from '../lib/supabase';
import { contestService, type Contest, getTimeRemaining } from '../lib/contests';

type StatusFilter = 'all' | 'active' | 'judging' | 'completed' | 'draft';

export function ClientContestsPage() {
  const { user } = useAuth();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const toast = useToast();

  const fetchContests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await contestService.getClientContests(user.id);
    setContests(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchContests();
    }
  }, [user, fetchContests]);

  const handleDelete = async (contestId: string) => {
    const success = await contestService.deleteContest(contestId);
    if (success) {
      fetchContests();
      toast.success('Contest deleted');
    } else {
      toast.error('Failed to delete contest');
    }
    setDeleteConfirm(null);
  };

  const filteredContests = contests.filter((contest) => {
    if (statusFilter === 'all') return true;
    return contest.status === statusFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'judging': return 'bg-yellow-100 text-yellow-700';
      case 'completed': return 'bg-blue-100 text-blue-700';
      case 'draft': return 'bg-slate-100 text-slate-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const stats = {
    total: contests.length,
    active: contests.filter(c => c.status === 'active').length,
    totalPrize: contests.reduce((sum, c) => sum + c.prize_amount, 0),
    totalSubmissions: contests.reduce((sum, c) => sum + c.submission_count, 0),
  };

  // Real-time subscription for contest updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`client-contests-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contests', filter: `client_id=eq.${user.id}` },
        () => { void fetchContests(); }
      )
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [user, fetchContests]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">My Contests</h1>
          <p className="text-slate-500">Manage your design and development contests</p>
        </div>
        <Link
          to="/client/contests/create"
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25"
        >
          <Plus className="w-5 h-5" />
          Create Contest
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <Trophy className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm text-slate-500 font-medium">Total Contests</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{stats.total}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 rounded-xl">
              <Clock className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm text-slate-500 font-medium">Active</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{stats.active}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-xl">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-slate-500 font-medium">Total Prizes</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">${stats.totalPrize.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-100 rounded-xl">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm text-slate-500 font-medium">Submissions</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900">{stats.totalSubmissions}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-slate-400" />
        {(['all', 'active', 'judging', 'completed', 'draft'] as StatusFilter[]).map((status) => (
          <button
            key={status}
            onClick={() => { setStatusFilter(status); setPage(1); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              statusFilter === status
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            {status !== 'all' && (
              <span className="ml-2 text-xs opacity-75">
                ({contests.filter(c => c.status === status).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Contests List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin h-12 w-12 text-emerald-600" />
        </div>
      ) : filteredContests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Trophy className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-900 mb-2">No contests yet</h3>
          <p className="text-slate-500 mb-6">Create your first contest to start receiving submissions</p>
          <Link
            to="/client/contests/create"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all"
          >
            <Plus className="w-5 h-5" />
            Create Contest
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {filteredContests
              .slice((page - 1) * pageSize, page * pageSize)
              .map((contest) => (
            <div key={contest.id} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition-all">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(contest.status)}`}>
                      {contest.status.charAt(0).toUpperCase() + contest.status.slice(1)}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                      {contest.contest_type.charAt(0).toUpperCase() + contest.contest_type.slice(1)}
                    </span>
                  </div>
                  
                  <Link
                    to={`/contests/${contest.id}`}
                    className="font-display text-xl font-bold text-slate-900 hover:text-emerald-600 transition-colors"
                  >
                    {contest.title}
                  </Link>
                  
                  <p className="text-slate-500 text-sm mt-1 line-clamp-1">{contest.description}</p>
                  
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                    <div className="flex items-center gap-1 text-slate-500">
                      <Calendar className="w-4 h-4" />
                      Ends {new Date(contest.end_date).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1 text-slate-500">
                      <Clock className="w-4 h-4" />
                      {getTimeRemaining(contest.end_date)}
                    </div>
                    <div className="flex items-center gap-1 text-slate-500">
                      <Users className="w-4 h-4" />
                      {contest.submission_count} submissions
                    </div>
                    <div className="flex items-center gap-1 text-emerald-600 font-semibold">
                      <DollarSign className="w-4 h-4" />
                      {contest.prize_amount.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/contests/${contest.id}`}
                    className="p-3 bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-600 rounded-xl transition-colors"
                    title="View"
                  >
                    <Eye className="w-5 h-5" />
                  </Link>
                  <button
                    onClick={() => setDeleteConfirm(contest.id)}
                    className="p-3 bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 rounded-xl transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          </div>
          <Pagination
            currentPage={page}
            totalItems={filteredContests.length}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm ? handleDelete(deleteConfirm) : Promise.resolve()}
        title="Delete Contest"
        message="Are you sure you want to delete this contest? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
