import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, IndianRupee, Trophy, Users, Search, Filter, ArrowRight, Loader2 } from 'lucide-react';
import { contestService, type Contest, getTimeRemaining } from '../../lib/contests';
import { formatCurrency } from '../../lib/currency';
import { InfoTip } from '../../components/InfoTip';
import { PageSkeleton } from '../../components/PageSkeleton';
import { safeLower } from '../../utils/date';

type ContestType = 'all' | 'design' | 'development' | 'writing' | 'marketing' | 'other';

export function ContestsDashboardPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<ContestType>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    fetchContests();
  }, []);

  const fetchContests = async () => {
    setLoading(true);
    const data = await contestService.getActiveContests(50);
    setContests(data);
    setLoading(false);
  };

  const filteredContests = contests.filter((contest) => {
    const matchesSearch = searchQuery === '' ||
      safeLower(contest.title).includes(safeLower(searchQuery)) ||
      safeLower(contest.description).includes(safeLower(searchQuery));
    const matchesType = selectedType === 'all' || contest.contest_type === selectedType;
    const matchesCategory = selectedCategory === 'all' || contest.category === selectedCategory;
    return matchesSearch && matchesType && matchesCategory;
  });

  const getContestTypeColor = (type: string) => {
    switch (type) {
      case 'design': return 'bg-purple-100 text-purple-700';
      case 'development': return 'bg-blue-100 text-blue-700';
      case 'writing': return 'bg-orange-100 text-orange-700';
      case 'marketing': return 'bg-green-100 text-green-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  if (loading) {
    return <PageSkeleton />;;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 flex items-center gap-1.5">Contests <InfoTip text="Design, writing, and development contests with cash prizes." /></h1>
            <p className="text-slate-500 text-xs">Compete in design and development contests to win prizes</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 rounded-full border border-amber-100">
          <Trophy className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-xs font-bold text-amber-700">{contests.length} Active</span>
        </div>
      </div>

      <InfoTip title="Information" text="How contests work: Clients fund prizes in escrow — submit your best work, win prizes, and earn verified badges. No work outside Growlancer, ever." />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 p-3">
          <div className="flex items-center gap-1.5">
            <div className="p-2 bg-amber-100 rounded-lg"><Trophy className="w-3.5 h-3.5 text-amber-600" /></div>
            <div><p className="text-lg font-bold text-slate-900">{contests.length}</p><p className="text-xs text-slate-500">Active Contests</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-3">
          <div className="flex items-center gap-1.5">
            <div className="p-2 bg-emerald-100 rounded-lg"><IndianRupee className="w-3.5 h-3.5 text-emerald-600" /></div>
            <div><p className="text-lg font-bold text-slate-900">{formatCurrency(contests.reduce((sum, c) => sum + c.prize_amount, 0))}</p><p className="text-xs text-slate-500">Total Prizes</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-3">
          <div className="flex items-center gap-1.5">
            <div className="p-2 bg-blue-100 rounded-lg"><Users className="w-3.5 h-3.5 text-blue-600" /></div>
            <div><p className="text-lg font-bold text-slate-900">{contests.reduce((sum, c) => sum + c.submission_count, 0)}</p><p className="text-xs text-slate-500">Submissions</p></div>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contests..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(['all', 'design', 'development', 'writing', 'marketing', 'other'] as ContestType[]).map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                selectedType === type
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Contests Grid */}
      {filteredContests.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No contests found</h3>
          <p className="text-slate-500 text-xs">Check back later for new contests or adjust your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredContests.map((contest) => (
            <Link
              key={contest.id}
              to={`/contests/${contest.id}`}
              className="group bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-emerald-200 transition-all"
            >
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getContestTypeColor(contest.contest_type)}`}>
                    {contest.contest_type.charAt(0).toUpperCase() + contest.contest_type.slice(1)}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                    <Clock className="w-3 h-3" />
                    {getTimeRemaining(contest.end_date)}
                  </div>
                </div>
                <h3 className="font-bold text-slate-900 text-sm mb-1 group-hover:text-emerald-600 transition-colors line-clamp-2">
                  {contest.title}
                </h3>
                <p className="text-slate-500 text-xs line-clamp-2 mb-2">{contest.description}</p>
                {contest.skills_required && contest.skills_required.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {contest.skills_required.slice(0, 3).map((skill) => (
                      <span key={skill} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded font-medium">
                        {skill}
                      </span>
                    ))}
                    {contest.skills_required.length > 3 && (
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded">
                        +{contest.skills_required.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-[10px]">
                    {contest.client?.name?.charAt(0) || 'C'}
                  </div>
                  <span className="text-xs text-slate-600">{contest.client?.name || 'Client'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 flex items-center gap-0.5"><Users className="w-3 h-3" />{contest.submission_count}</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-0.5"><IndianRupee className="w-3 h-3" />{contest.prize_amount.toLocaleString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
