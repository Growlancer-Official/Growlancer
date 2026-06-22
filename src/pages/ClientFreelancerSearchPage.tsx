import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, Bell, BellOff, Briefcase, CheckCircle2, ChevronDown, ChevronUp, Clock, Filter, Globe, Layers, Loader2, MapPin, Plus, Save, Search, Star, Trash2, X,  } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useCategories } from '../hooks/useCategories';
import { getSellerLevelBadgeProps } from '../lib/sellerLevels';
import { CategoriesSection } from '../components/CategoriesSection';

interface FreelancerResult {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar: string | null;
  location: string | null;
  title: string | null;
  hourly_rate: number | null;
  experience: string | null;
  skills: string[];
  languages: string[];
  availability: boolean | null;
  rating: number | null;
  total_reviews: number | null;
  total_projects: number | null;
  seller_level: string | null;
}

interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  notify_new_results: boolean;
  created_at: string;
}

export function ClientFreelancerSearchPage() {
  const { user } = useAuth();
  const [freelancers, setFreelancers] = useState<FreelancerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [availabilityOnly, setAvailabilityOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'rating' | 'rate_low' | 'rate_high'>('rating');
  const [showCategories, setShowCategories] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { flatNames: categories } = useCategories();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');

  const fetchFreelancers = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('freelancer_profiles')
        .select('id, user_id, full_name, avatar, location, title, hourly_rate, experience, skills, languages, availability, rating, total_reviews, total_projects, seller_level')
        .not('user_id', 'is', null);

      if (minRate) query = query.gte('hourly_rate', Number(minRate));
      if (maxRate) query = query.lte('hourly_rate', Number(maxRate));
      if (availabilityOnly) query = query.eq('availability', true);

      switch (sortBy) {
        case 'rating': query = query.order('rating', { ascending: false, nullsFirst: false }); break;
        case 'rate_low': query = query.order('hourly_rate', { ascending: true, nullsFirst: true }); break;
        case 'rate_high': query = query.order('hourly_rate', { ascending: false, nullsFirst: false }); break;
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;

      let results = (data || []) as unknown as FreelancerResult[];

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        results = results.filter((f) =>
          f.full_name?.toLowerCase().includes(q) ||
          f.title?.toLowerCase().includes(q) ||
          f.skills?.some((s) => s.toLowerCase().includes(q))
        );
      }

      if (selectedCategory !== 'All') {
        results = results.filter((f) =>
          f.skills?.some((s) => s.toLowerCase().includes(selectedCategory.toLowerCase())) ||
          f.title?.toLowerCase().includes(selectedCategory.toLowerCase())
        );
      }

      setFreelancers(results);
    } catch (err) {
      console.error('Error fetching freelancers:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, minRate, maxRate, availabilityOnly, sortBy]);

  useEffect(() => { fetchFreelancers(); }, [fetchFreelancers]);

  useEffect(() => {
    if (!user) return;
    const fetchSaved = async () => {
      const { data } = await supabase
        .from('saved_searches')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setSavedSearches(data as unknown as SavedSearch[]);
    };
    fetchSaved();
  }, [user]);

  const handleSaveSearch = async () => {
    if (!user || !saveName.trim()) return;
    const filters = { searchQuery, selectedCategory, minRate, maxRate, availabilityOnly, sortBy };
    await supabase.from('saved_searches').insert({
      user_id: user.id,
      name: saveName.trim(),
      filters,
      notify_new_results: true,
    });
    setShowSaveModal(false);
    setSaveName('');
    // Refresh
    const { data } = await supabase.from('saved_searches').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setSavedSearches(data as unknown as SavedSearch[]);
  };

  const handleDeleteSaved = async (id: string) => {
    await supabase.from('saved_searches').delete().eq('id', id);
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
  };

  const handleToggleNotify = async (search: SavedSearch) => {
    await supabase.from('saved_searches').update({ notify_new_results: !search.notify_new_results }).eq('id', search.id);
    setSavedSearches((prev) => prev.map((s) => s.id === search.id ? { ...s, notify_new_results: !s.notify_new_results } : s));
  };

  const loadSavedSearch = (search: SavedSearch) => {
    const f = search.filters as Record<string, unknown>;
    setSearchQuery((f.searchQuery as string) || '');
    setSelectedCategory((f.selectedCategory as string) || 'All');
    setMinRate((f.minRate as string) || '');
    setMaxRate((f.maxRate as string) || '');
    setAvailabilityOnly((f.availabilityOnly as boolean) || false);
    setSortBy((f.sortBy as typeof sortBy) || 'rating');
  };

  const getSellerLevelBadge = (level: string | null) => {
    if (!level) return null;
    const props = getSellerLevelBadgeProps(level as any);
    return (
      <span className={props.className}>
        <Award className="w-3 h-3" />
        {props.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Find Talent</h1>
          <p className="text-slate-500 mt-1">Search and hire skilled freelancers for your projects</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowFilters(!showFilters)} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
            <Filter className="w-4 h-4" /> Filters
          </button>
          <button onClick={() => setShowSaveModal(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> Save Search
          </button>
        </div>
      </div>

      {/* Saved Searches */}
      {savedSearches.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {savedSearches.map((search) => (
            <div key={search.id} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm flex-shrink-0">
              <button onClick={() => loadSavedSearch(search)} className="font-medium text-slate-700 hover:text-emerald-600 transition-colors">{search.name}</button>
              <button onClick={() => handleToggleNotify(search)} className="p-1 text-slate-400 hover:text-emerald-600" title={search.notify_new_results ? 'Notifications on' : 'Notifications off'}>
                {search.notify_new_results ? <Bell className="w-3 h-3 text-emerald-500" /> : <BellOff className="w-3 h-3" />}
              </button>
              <button onClick={() => handleDeleteSaved(search.id)} className="p-1 text-slate-400 hover:text-red-500">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Browse Categories - A-Z Accordion */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <button
          onClick={() => setShowCategories(!showCategories)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-slate-900">Browse Categories</span>
            <span className="text-xs text-slate-400 font-medium">A-Z</span>
          </div>
          {showCategories ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
          showCategories ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="px-4 pb-4 border-t border-slate-50">
            <CategoriesSection mode="browse" maxInitial={0} />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name, skill, or title..." className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="All">All Categories</option>
              {categories.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
            </select>
            <input type="number" value={minRate} onChange={(e) => setMinRate(e.target.value)} placeholder="Min $/hr" className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <input type="number" value={maxRate} onChange={(e) => setMaxRate(e.target.value)} placeholder="Max $/hr" className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <label className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
              <input type="checkbox" checked={availabilityOnly} onChange={(e) => setAvailabilityOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-emerald-600" />
              <span className="text-sm font-medium text-slate-700">Available Now</span>
            </label>
          </div>
        </div>
      )}

      {/* Sort & Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'Searching...' : `${freelancers.length} freelancer${freelancers.length !== 1 ? 's' : ''} found`}</p>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="rating">Best Rating</option>
          <option value="rate_low">Rate: Low to High</option>
          <option value="rate_high">Rate: High to Low</option>
        </select>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
      ) : freelancers.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
          <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">No freelancers found</h3>
          <p className="text-slate-500">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {freelancers.map((f) => (
            <div key={f.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                  {f.avatar ? <img src={f.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-400">{(f.full_name || 'U')[0]}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 truncate">{f.full_name || 'Freelancer'}</h3>
                    {f.availability && <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />Available</span>}
                  </div>
                  {f.title && <p className="text-sm text-slate-500 truncate">{f.title}</p>}
                </div>
              </div>
              {f.seller_level && <div className="mb-2">{getSellerLevelBadge(f.seller_level)}</div>}
              <div className="flex items-center gap-3 text-sm mb-3">
                {f.rating && f.rating > 0 ? <span className="flex items-center gap-1 font-semibold"><Star className="w-4 h-4 text-amber-400 fill-amber-400" />{f.rating.toFixed(1)}<span className="text-slate-400 font-normal">({f.total_reviews || 0})</span></span> : <span className="text-slate-400 text-xs">New</span>}
                {f.total_projects && f.total_projects > 0 && <span className="flex items-center gap-1 text-slate-500"><Briefcase className="w-3.5 h-3.5" />{f.total_projects}</span>}
              </div>
              {f.skills && f.skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {f.skills.slice(0, 3).map((s) => <span key={s} className="px-2 py-0.5 bg-slate-50 text-slate-600 text-xs rounded-lg">{s}</span>)}
                  {f.skills.length > 3 && <span className="text-xs text-slate-400">+{f.skills.length - 3}</span>}
                </div>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="flex items-center gap-1 text-xs text-slate-500">{f.location && <><MapPin className="w-3 h-3" />{f.location}</>}</span>
                {f.hourly_rate && <span className="text-lg font-bold text-emerald-600">${f.hourly_rate}<span className="text-xs text-slate-400 font-normal">/hr</span></span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Save This Search</h3>
            <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. React developers under $50/hr" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="flex gap-3">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={handleSaveSearch} disabled={!saveName.trim()} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">Save Search</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
