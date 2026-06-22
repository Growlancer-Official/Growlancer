import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, ChevronDown, Clock, DollarSign, Filter, Loader2, Search, Sparkles, Tag, Trophy, Type, Users,  } from 'lucide-react';
import { contestService, type Contest, CONTEST_CATEGORIES, getTimeRemaining } from '../lib/contests';

type ContestType = 'all' | 'design' | 'development' | 'writing' | 'marketing' | 'other';

export function ContestsPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<ContestType>('all');
  const [showFilters, setShowFilters] = useState(false);

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
      contest.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contest.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || contest.category === selectedCategory;
    const matchesType = selectedType === 'all' || contest.contest_type === selectedType;
    
    return matchesSearch && matchesCategory && matchesType;
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

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-sm font-semibold mb-6">
              <Trophy className="w-4 h-4" />
              CONTESTS & COMPETITIONS
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-extrabold mb-6">
              Compete. Create. <span className="text-emerald-200">Win.</span>
            </h1>
            <p className="text-emerald-100 text-lg mb-8">
              Join design and development contests to showcase your skills, win prizes, and build your portfolio.
            </p>
            
            {/* Search Bar */}
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contests by title, category, or skills..."
                className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-emerald-300/50 shadow-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Banner */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-3xl font-extrabold text-emerald-600">{contests.length}</p>
              <p className="text-sm text-slate-500 font-medium">Active Contests</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-extrabold text-emerald-600">
                ${contests.reduce((sum, c) => sum + c.prize_amount, 0).toLocaleString()}
              </p>
              <p className="text-sm text-slate-500 font-medium">Total Prizes</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-extrabold text-emerald-600">
                {contests.reduce((sum, c) => sum + c.submission_count, 0)}
              </p>
              <p className="text-sm text-slate-500 font-medium">Submissions</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-extrabold text-emerald-600">
                {CONTEST_CATEGORIES.length}
              </p>
              <p className="text-sm text-slate-500 font-medium">Categories</p>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filters
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {/* Type Tabs */}
            <div className="flex gap-2 overflow-x-auto">
              {(['all', 'design', 'development', 'writing', 'marketing', 'other'] as ContestType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                    selectedType === type
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex flex-wrap gap-3">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="all">All Categories</option>
                  {CONTEST_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Contests Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin h-12 w-12 text-emerald-600" />
          </div>
        ) : filteredContests.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">No contests found</h3>
            <p className="text-slate-500">Try adjusting your filters or check back later for new contests.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredContests.map((contest) => (
              <Link
                key={contest.id}
                to={`/contests/${contest.id}`}
                className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:border-emerald-200 transition-all duration-300"
              >
                {/* Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-start justify-between mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getContestTypeColor(contest.contest_type)}`}>
                      {contest.contest_type.charAt(0).toUpperCase() + contest.contest_type.slice(1)}
                    </span>
                    <div className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
                      <Clock className="w-4 h-4" />
                      {getTimeRemaining(contest.end_date)}
                    </div>
                  </div>
                  
                  <h3 className="font-display text-xl font-bold text-slate-900 mb-2 group-hover:text-emerald-600 transition-colors line-clamp-2">
                    {contest.title}
                  </h3>
                  <p className="text-slate-500 text-sm line-clamp-2 mb-4">
                    {contest.description}
                  </p>

                  {/* Skills */}
                  {contest.skills_required && contest.skills_required.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {contest.skills_required.slice(0, 3).map((skill) => (
                        <span key={skill} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg font-medium">
                          {skill}
                        </span>
                      ))}
                      {contest.skills_required.length > 3 && (
                        <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded-lg">
                          +{contest.skills_required.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">
                        {contest.client?.name?.charAt(0) || 'C'}
                      </div>
                      <span className="text-sm font-medium text-slate-700">
                        {contest.client?.name || 'Anonymous'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-slate-500">
                        <Users className="w-4 h-4" />
                        {contest.submission_count}
                      </div>
                      <div className="flex items-center gap-1 text-emerald-600 font-bold">
                        <DollarSign className="w-4 h-4" />
                        {contest.prize_amount.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-emerald-600 to-teal-600 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="font-display text-3xl font-extrabold text-white mb-4">
            Ready to Compete?
          </h2>
          <p className="text-emerald-100 mb-8 text-lg">
            Join contests to showcase your skills, win prizes, and build your reputation on Growlancer.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-emerald-600 font-bold rounded-2xl hover:bg-emerald-50 transition-all shadow-xl"
          >
            <Sparkles className="w-5 h-5" />
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
