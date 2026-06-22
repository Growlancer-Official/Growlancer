import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, ChevronUp, Clock, Filter, Globe, Layers, Loader2, MapPin, Search, Star, Stars, Type, X,  } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCategories } from '../hooks/useCategories';
import { CategoriesSection } from '../components/CategoriesSection';

interface FreelancerResult {
  id: string;
  user_id: string;
  location: string | null;
  bio: string | null;
  hourly_rate: number | null;
  experience: number | null;
  skills: string[];
  languages: string[];
  availability: boolean | null;
  rating: number | null;
  total_reviews: number | null;
  completion_rate: number | null;
  created_at: string;
  profile: { name: string; avatar: string | null } | null;
}

export function FreelancersSearchPage() {
  const [freelancers, setFreelancers] = useState<FreelancerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [minRating, setMinRating] = useState('0');
  const [availabilityOnly, setAvailabilityOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'rating' | 'rate_low' | 'rate_high' | 'newest'>('rating');
  const [showCategories, setShowCategories] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { flatNames: categories } = useCategories();
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');

  const fetchFreelancers = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('freelancer_profiles')
        .select(`
          id,
          user_id,
          location,
          bio,
          hourly_rate,
          experience,
          skills,
          languages,
          availability,
          rating,
          total_reviews,
          completion_rate,
          created_at,
          profile:profiles!freelancer_profiles_user_id_fkey(name, avatar)
        `)
        .not('user_id', 'is', null);

      // Apply filters
      if (minRate) query = query.gte('hourly_rate', Number(minRate));
      if (maxRate) query = query.lte('hourly_rate', Number(maxRate));
      if (minRating && Number(minRating) > 0) query = query.gte('rating', Number(minRating));
      if (availabilityOnly) query = query.eq('availability', true);

      // Apply sorting
      switch (sortBy) {
        case 'rating':
          query = query.order('rating', { ascending: false, nullsFirst: false });
          break;
        case 'rate_low':
          query = query.order('hourly_rate', { ascending: true, nullsFirst: true });
          break;
        case 'rate_high':
          query = query.order('hourly_rate', { ascending: false, nullsFirst: false });
          break;
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
      }

      query = query.limit(50);

      const { data, error } = await query;
      if (error) throw error;

      let results = (data || []) as FreelancerResult[];

      // Client-side filters for text search, category, and skills
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        results = results.filter(
          (f) =>
            f.bio?.toLowerCase().includes(q) ||
            f.skills?.some((s) => s.toLowerCase().includes(q))
        );
      }

      if (selectedCategory && selectedCategory !== 'All') {
        results = results.filter((f) =>
          f.skills?.some((s) => s.toLowerCase().includes(selectedCategory.toLowerCase())) ||
          f.bio?.toLowerCase().includes(selectedCategory.toLowerCase())
        );
      }

      if (selectedSkills.length > 0) {
        results = results.filter((f) =>
          selectedSkills.every((skill) =>
            f.skills?.some((s) => s.toLowerCase().includes(skill.toLowerCase()))
          )
        );
      }

      setFreelancers(results);
    } catch (err) {
      console.error('Error fetching freelancers:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, minRate, maxRate, minRating, availabilityOnly, sortBy, selectedSkills]);

  useEffect(() => {
    fetchFreelancers();
  }, [fetchFreelancers]);

  const addSkillFilter = () => {
    if (skillInput.trim() && !selectedSkills.includes(skillInput.trim())) {
      setSelectedSkills([...selectedSkills, skillInput.trim()]);
      setSkillInput('');
    }
  };

  const removeSkillFilter = (skill: string) => {
    setSelectedSkills(selectedSkills.filter((s) => s !== skill));
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Hero */}
      <section className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-3xl sm:text-4xl font-bold mb-3">Find Top Freelancers</h1>
          <p className="text-emerald-100 text-lg mb-6">Browse talented professionals ready to bring your vision to life.</p>

          {/* Search Bar */}
          <div className="flex gap-3 max-w-3xl">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, skill, or title..."
                className="w-full pl-12 pr-4 py-3.5 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-5 py-3.5 bg-white/20 hover:bg-white/30 rounded-xl flex items-center gap-2 font-medium transition-colors"
            >
              <Filter className="w-5 h-5" />
              Filters
            </button>
          </div>
        </div>
      </section>

      {/* Browse Categories - A-Z Accordion */}
      <section className="py-6 bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
        </div>
      </section>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white border-b border-slate-200 py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="All">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Min Rate */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Min Rate ($/hr)</label>
                <input
                  type="number"
                  value={minRate}
                  onChange={(e) => setMinRate(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Max Rate */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Max Rate ($/hr)</label>
                <input
                  type="number"
                  value={maxRate}
                  onChange={(e) => setMaxRate(e.target.value)}
                  placeholder="500"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Min Rating */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Min Rating</label>
                <select
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="0">Any Rating</option>
                  <option value="4.5">4.5+ Stars</option>
                  <option value="4.0">4.0+ Stars</option>
                  <option value="3.5">3.5+ Stars</option>
                </select>
              </div>

              {/* Availability */}
              <div className="flex items-end">
                <label className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors w-full">
                  <input
                    type="checkbox"
                    checked={availabilityOnly}
                    onChange={(e) => setAvailabilityOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-medium text-slate-700">Available Now</span>
                </label>
              </div>
            </div>

            {/* Skill Filters */}
            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Skills</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedSkills.map((skill) => (
                  <span key={skill} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 text-sm rounded-full font-medium">
                    {skill}
                    <button onClick={() => removeSkillFilter(skill)} className="hover:text-emerald-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkillFilter())}
                  placeholder="Type a skill and press Enter"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button onClick={addSkillFilter} className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors">Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <section className="py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Sort & Count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-slate-500">
              {loading ? 'Searching...' : `${freelancers.length} freelancer${freelancers.length !== 1 ? 's' : ''} found`}
            </p>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="rating">Sort by Rating</option>
              <option value="rate_low">Rate: Low to High</option>
              <option value="rate_high">Rate: High to Low</option>
              <option value="newest">Newest</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : freelancers.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">No freelancers found</h3>
              <p className="text-slate-500 mb-6">Try adjusting your filters or search terms.</p>
              <button onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setMinRate(''); setMaxRate(''); setMinRating('0'); setAvailabilityOnly(false); setSelectedSkills([]); }} className="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors">Clear All Filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {freelancers.map((freelancer) => (
                <Link
                  key={freelancer.id}
                  to={`/freelancer/${freelancer.user_id}`}
                  className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
                >
                  {/* Header */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                      {freelancer.profile?.avatar ? (
                        <img src={freelancer.profile.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl font-bold text-slate-400">
                          {(freelancer.profile?.name || 'U')[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-slate-900 truncate group-hover:text-emerald-600 transition-colors">
                          {freelancer.profile?.name || 'Freelancer'}
                        </h3>
                        {freelancer.availability && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full flex-shrink-0">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            Available
                          </span>
                        )}
                      </div>
                      {freelancer.bio && (
                        <p className="text-sm text-slate-500 truncate">{freelancer.bio}</p>
                      )}
                    </div>
                  </div>

                  {/* Rating & Stats */}
                  <div className="flex items-center gap-4 mb-4 text-sm">
                    {freelancer.rating && freelancer.rating > 0 ? (
                      <span className="flex items-center gap-1 font-semibold text-slate-900">
                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        {freelancer.rating.toFixed(1)}
                        <span className="text-slate-400 font-normal">({freelancer.total_reviews || 0})</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">New freelancer</span>
                    )}
                    {freelancer.completion_rate && freelancer.completion_rate > 0 && (
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        {Math.round(freelancer.completion_rate)}% completion
                      </span>
                    )}
                  </div>

                  {/* Skills */}
                  {freelancer.skills && freelancer.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {freelancer.skills.slice(0, 4).map((skill) => (
                        <span key={skill} className="px-2 py-1 bg-slate-50 text-slate-600 text-xs rounded-lg border border-slate-100">
                          {skill}
                        </span>
                      ))}
                      {freelancer.skills.length > 4 && (
                        <span className="px-2 py-1 text-slate-400 text-xs">+{freelancer.skills.length - 4}</span>
                      )}
                    </div>
                  )}

                  {/* Location & Rate */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {freelancer.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {freelancer.location}
                        </span>
                      )}
                      {freelancer.languages && freelancer.languages.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {freelancer.languages[0]}
                        </span>
                      )}
                    </div>
                    {freelancer.hourly_rate && (
                      <span className="text-lg font-bold text-emerald-600">
                        ${freelancer.hourly_rate}
                        <span className="text-xs text-slate-400 font-normal">/hr</span>
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-[2.5rem] p-8 sm:p-12 text-center border border-slate-200 shadow-sm">
            <h2 className="font-display text-3xl font-bold text-slate-900 mb-4">Can't find the right freelancer?</h2>
            <p className="text-slate-600 mb-8 max-w-lg mx-auto">Post a project and let our AI match you with the perfect freelancer based on skills, experience, and budget.</p>
            <Link to="/signup" className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors">
              Post a Project <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
