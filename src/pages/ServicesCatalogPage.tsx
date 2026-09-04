import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Eye, Filter, Grid3X3, List, Loader2, Package, Search, ShoppingCart, Star,  } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/currency';
import { useCategories } from '../hooks/useCategories';
import { useToast } from '../components/Toast';
import { TipNote } from '../components/TipNote';
import { safeLower } from '../utils/date';

interface ServiceResult {
  id: string;
  freelancer_id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  price_type: string;
  delivery_days: number;
  tags: string[];

  image_url: string | null;
  views: number;
  orders: number;
  rating: number | null;
  status: string;
  created_at: string;
  freelancer?: {
    full_name: string | null;
    avatar: string | null;
    seller_level: string | null;
    rating: number | null;
  } | null;
}

export function ServicesCatalogPage() {
  const [services, setServices] = useState<ServiceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'newest' | 'price_low' | 'price_high' | 'rating'>('popular');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const toast = useToast();
  const { flatNames: categories } = useCategories();

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('services')
        .select(`
          *,
          freelancer:profiles!services_freelancer_id_fkey(name, avatar, rating)
        `)
        .eq('active', true);

      if (maxPrice) query = query.lte('price', Number(maxPrice));

      switch (sortBy) {
        case 'popular':
          query = query.order('orders', { ascending: false, nullsFirst: false });
          break;
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
        case 'price_low':
          query = query.order('price', { ascending: true });
          break;
        case 'price_high':
          query = query.order('price', { ascending: false });
          break;
        case 'rating':
          query = query.order('rating', { ascending: false, nullsFirst: false });
          break;
      }

      query = query.limit(60);

      const { data, error } = await query;
      if (error) throw error;

      let results = (data || []) as unknown as ServiceResult[];

      if (searchQuery) {
        const q = safeLower(searchQuery);
        results = results.filter(
          (s) =>
            safeLower(s.title).includes(q) ||
            safeLower(s.description).includes(q) ||
            safeLower(s.category).includes(q) ||
            (s.tags?.some((t) => safeLower(t).includes(q)) ?? false)
        );
      }

      if (selectedCategory && selectedCategory !== 'All') {
        results = results.filter((s) => s.category === selectedCategory);
      }

      setServices(results);
    } catch (err) {
      toast.error('Error', 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, maxPrice, sortBy, toast]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Hero */}
      <section className="bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-900 text-white py-6">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12">
          <h1 className="font-display text-3xl sm:text-4xl font-bold mb-3">Browse Services</h1>
          <p className="text-slate-300 text-lg mb-3">Discover pre-packaged services from top freelancers — order instantly.</p>
          <div className="mb-3">
            <TipNote tone="protection" title="Every order is protected" compact>
              Pay through <strong>Growlancer Escrow</strong> — your money is held safely and released to the freelancer only after you approve the completed work. Delivery times, free revisions and the full three-tier package pricing are shown on every card.
            </TipNote>
          </div>
          <div className="flex gap-3 max-w-3xl">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                id="service-search"
                name="service-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search services..."
                autoComplete="off"
                className="w-full pl-12 pr-4 py-3.5 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <button onClick={() => setShowFilters(!showFilters)} className="px-5 py-3.5 bg-white/20 hover:bg-white/30 rounded-xl flex items-center gap-3 font-medium transition-colors">
              <Filter className="w-5 h-5" /> Filters
            </button>
          </div>
        </div>
      </section>

      {/* Category Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12">
          <div className="flex gap-1 overflow-x-auto py-3 scrollbar-hide">
            {['All', ...categories].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white border-b border-slate-200 py-4">
          <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Max Price</label>
              <input
                type="number"
                id="max-price"
                name="max-price"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="No limit"
                className="w-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:text-slate-600'}`}>
                <Grid3X3 className="w-5 h-5" />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:text-slate-600'}`}>
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <section className="py-4 pb-16 sm:pb-20">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">
              {loading ? 'Searching...' : `${services.length} service${services.length !== 1 ? 's' : ''} found`}
            </p>
            <select aria-label="Sort services" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="popular">Most Popular</option>
              <option value="newest">Newest</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-xl border border-slate-100">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">No services found</h3>
              <p className="text-slate-500 mb-3">Try adjusting your search or filters.</p>
              <button onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setMaxPrice(''); }} className="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors">Clear Filters</button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {services.map((service) => (
                <Link
                  key={service.id}
                  to={`/services/${service.id}`}
                  className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-50 relative overflow-hidden">
                    {service.image_url ? (
                      <img src={service.image_url} alt={service.title} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-10 h-10 text-slate-300" />
                      </div>
                    )}
                    <div className="absolute top-3 right-3 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-bold text-slate-700 shadow-sm">
                      {service.delivery_days}d delivery
                    </div>
                  </div>

                  <div className="p-4">
                    {/* Freelancer Info */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-6 h-6 rounded-full bg-slate-100 overflow-hidden">
                        {service.freelancer?.avatar ? (
                          <img src={service.freelancer.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">
                            {(service.freelancer?.full_name || 'U')[0]}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 truncate">{service.freelancer?.full_name || 'Freelancer'}</span>
                      {service.freelancer?.seller_level && service.freelancer.seller_level.includes('top_rated') && (
                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                      )}
                    </div>

                    <h3 className="font-semibold text-slate-900 text-sm mb-2 line-clamp-2 group-hover:text-emerald-600 transition-colors">
                      {service.title}
                    </h3>

                    {/* Tags */}
                    {service.tags && service.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {service.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 bg-slate-50 text-slate-500 text-xs rounded border border-slate-100">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{service.views || 0}</span>
                        <span className="flex items-center gap-1"><ShoppingCart className="w-3.5 h-3.5" />{service.orders || 0}</span>
                        {service.rating && service.rating > 0 && (
                          <span className="flex items-center gap-0.5"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />{Number(service.rating).toFixed(1)}</span>
                        )}
                      </div>
                      <span className="text-lg font-bold text-emerald-600">
                        {formatCurrency(Number(service.price))}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="space-y-4">
              {services.map((service) => (
                <Link
                  key={service.id}
                  to={`/services/${service.id}`}
                  className="flex bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-all group"
                >
                  <div className="w-48 h-36 bg-slate-100 flex-shrink-0 relative overflow-hidden">
                    {service.image_url ? (
                      <img src={service.image_url} alt="" className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-slate-300" /></div>
                    )}
                  </div>
                  <div className="flex-1 p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-emerald-600 transition-colors">{service.title}</h3>
                        <p className="text-sm text-slate-500 line-clamp-2 mb-3">{service.description}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{service.delivery_days} days</span>
                          <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{service.views || 0} views</span>
                          <span className="flex items-center gap-1"><ShoppingCart className="w-3.5 h-3.5" />{service.orders || 0} orders</span>
                          {service.rating && <span className="flex items-center gap-0.5"><Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />{Number(service.rating).toFixed(1)}</span>}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <span className="text-xl font-bold text-emerald-600">{formatCurrency(Number(service.price))}</span>
                        <span className="text-xs text-slate-400 block">{(service as any).packages?.length > 0 ? 'From · 3 tiers' : 'Fixed Price'}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
