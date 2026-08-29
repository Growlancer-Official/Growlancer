import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, IndianRupee, Eye, Filter, Loader2, Lock, Medal, Plus, ShieldCheck, Trash2, Trophy, Users } from 'lucide-react';
import { InfoTip } from '../components/InfoTip';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/currency';
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">My Contests</h1>
            <p className="text-slate-500 text-xs">Manage your design and development contests</p>
          </div>
        </div>
        <Link
          to="/client/contests/create"
          className="inline-flex items-center justify-center gap-3 px-3 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Contest
        </Link>
      </div>

      <InfoTip title="How contests work" text="Post a prize and a brief, then fund the prize (escrowed + 5% fee) — freelancers can only submit once the prize is protected. After the deadline the contest moves to Judging, you pick 1st/2nd/3rd, and prizes are released to the winners' wallets in real time. Entries, votes and results are all public for transparency." />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5">
            <div className="p-2 bg-emerald-100 rounded-lg"><Trophy className="w-3.5 h-3.5 text-emerald-600" /></div>
            <div><p className="text-lg font-bold text-slate-900">{stats.total}</p><p className="text-xs text-slate-500">Total</p></div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5">
            <div className="p-2 bg-green-100 rounded-lg"><Clock className="w-3.5 h-3.5 text-green-600" /></div>
            <div><p className="text-lg font-bold text-slate-900">{stats.active}</p><p className="text-xs text-slate-500">Active</p></div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5">
            <div className="p-2 bg-emerald-100 rounded-lg"><IndianRupee className="w-3.5 h-3.5 text-emerald-600" /></div>
            <div><p className="text-lg font-bold text-slate-900">{formatCurrency(stats.totalPrize)}</p><p className="text-xs text-slate-500">Prizes</p></div>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5">
            <div className="p-2 bg-blue-100 rounded-lg"><Users className="w-3.5 h-3.5 text-blue-600" /></div>
            <div><p className="text-lg font-bold text-slate-900">{stats.totalSubmissions}</p><p className="text-xs text-slate-500">Submissions</p></div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin h-8 w-8 text-emerald-600" />
        </div>
      ) : filteredContests.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No contests yet</h3>
          <p className="text-slate-500 text-xs mb-3">Create your first contest to start receiving submissions</p>
          <Link
            to="/client/contests/create"
            className="inline-flex items-center justify-center gap-3 px-3 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all"
          >
            <Plus className="w-4 h-4" />
            Create Contest
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {filteredContests
              .slice((page - 1) * pageSize, page * pageSize)
              .map((contest) => (
            <div key={contest.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(contest.status)}`}>
                      {contest.status.charAt(0).toUpperCase() + contest.status.slice(1)}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                      {contest.contest_type.charAt(0).toUpperCase() + contest.contest_type.slice(1)}
                    </span>
                    {contest.prize_funded ? (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4" /> Escrowed
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-200 flex items-center gap-1">
                        <Lock className="w-4 h-4" /> Prize Not Funded
                      </span>
                    )}
                  </div>
                  
                  <Link
                    to={`/contests/${contest.id}`}
                    className="font-display text-xl font-bold text-slate-900 hover:text-emerald-600 transition-colors"
                  >
                    {contest.title}
                  </Link>
                  
                  <p className="text-slate-500 text-sm mt-1 line-clamp-3">{contest.description}</p>
                  
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
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
                      <IndianRupee className="w-4 h-4" />
                      {contest.prize_amount.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {contest.status === 'judging' && contest.prize_funded && (
                    <Link
                      to={`/contests/${contest.id}`}
                      className="px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-all inline-flex items-center gap-1.5"
                      title="Judge entries and award winners"
                    >
                      <Medal className="w-4 h-4" />
                      Judge & Award
                    </Link>
                  )}
                  {!contest.prize_funded && contest.status !== 'completed' && contest.status !== 'cancelled' && (
                    <Link
                      to={`/contests/${contest.id}`}
                      className="px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-all inline-flex items-center gap-1.5"
                      title="Fund the prize to go live"
                    >
                      <Lock className="w-4 h-4" />
                      Fund Prize
                    </Link>
                  )}
                  <Link
                    to={`/contests/${contest.id}`}
                    className="p-3 bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-600 rounded-xl transition-colors"
                    title="View"
                  >
                    <Eye className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => setDeleteConfirm(contest.id)}
                    className="p-3 bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 rounded-xl transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
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
