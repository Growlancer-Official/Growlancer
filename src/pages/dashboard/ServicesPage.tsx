import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgePercent,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  HandCoins,
  IndianRupee,
  Layers,
  MessageSquareText,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Star,
  Tag,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { TipNote } from '../../components/TipNote';
import { safeLower } from '../../utils/date';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';
import { CategoriesSection } from '../../components/CategoriesSection';
import { supabase, realtimeChannels } from '../../lib/supabase';
import type { Tables } from '../../types/supabase';
import { formatCurrency } from '../../lib/currency';

export function ServicesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Tables<'services'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showCategories, setShowCategories] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // 💬 Negotiable-price offers (client → freelancer), live via realtime.
  const [offers, setOffers] = useState<any[]>([]);
  const [showOffers, setShowOffers] = useState(false);
  const [offerBusy, setOfferBusy] = useState<string | null>(null);
  const pageSize = 9;
  const toast = useToast();

  useEffect(() => {
    if (!user) return;

    const fetchServices = async () => {
      try {
        const { data, error } = await supabase
          .from('services')
          .select('*')
          .eq('freelancer_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
          setServices(data);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching services:', error);
        setLoading(false);
      }
    };

    fetchServices();

    // Real-time subscription for services
    const channel = realtimeChannels.services('freelancer-services')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'services',
          filter: `freelancer_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Dedup by id — realtime can deliver the same INSERT twice (StrictMode
            // double-mount creates two subscriptions); never render duplicates.
            const incoming = payload.new as Tables<'services'>;
            setServices(prev =>
              prev.some(s => s.id === incoming.id)
                ? prev
                : [incoming, ...prev]
            );
          } else if (payload.eventType === 'UPDATE') {
            setServices(prev =>
              prev.map(s => (s.id === payload.new.id ? payload.new as Tables<'services'> : s))
            );
          } else if (payload.eventType === 'DELETE') {
            setServices(prev => prev.filter(s => s.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [user]);

  const handleDelete = async (serviceId: string) => {
    try {
      const { error } = await supabase.from('services').delete().eq('id', serviceId);
      if (error) throw error;
      toast.success('Service deleted successfully');
    } catch (error) {
      console.error('Error deleting service:', error);
      toast.error('Failed to delete service. Please try again.');
    }
    setDeleteConfirm(null);
  };

  // ── Offers (negotiable price) ────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const fetchOffers = async () => {
      try {
        const { data, error } = await supabase
          .from('service_offers')
          .select('*, client:profiles!service_offers_client_id_fkey(name, avatar), service:services(id, title, price)')
          .eq('freelancer_id', user.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (data) setOffers(data);
      } catch (err) {
        console.error('Error fetching service offers:', err);
      }
    };

    void fetchOffers();

    // Real-time: new offers + accept/decline flips arrive instantly.
    const channel = realtimeChannels.services('freelancer-service-offers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_offers', filter: `freelancer_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOffers(prev => [payload.new, ...prev].filter((o, i, a) => a.findIndex(x => x.id === o.id) === i));
          } else if (payload.eventType === 'UPDATE') {
            setOffers(prev => prev.map(o => (o.id === payload.new.id ? { ...o, ...payload.new } : o)));
          } else if (payload.eventType === 'DELETE') {
            setOffers(prev => prev.filter(o => o.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { void channel.unsubscribe(); };
  }, [user]);

  const respondToOffer = async (offer: any, status: 'accepted' | 'declined') => {
    setOfferBusy(offer.id);
    try {
      const { error } = await supabase
        .from('service_offers')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', offer.id)
        .eq('freelancer_id', user?.id);
      if (error) throw error;

      // The in-app notification for the client is created by the DB trigger
      // (service_offers_notify_fn, SECURITY DEFINER) — client-side inserts
      // would fail notifications RLS. Real time, automatic.
      toast.success(status === 'accepted' ? 'Offer accepted' : 'Offer declined');
    } catch (err) {
      console.error('Respond to offer failed:', err);
      toast.error('Error', 'Failed to update the offer. Please try again.');
    } finally {
      setOfferBusy(null);
    }
  };

  const handleToggleStatus = async (service: Tables<'services'>) => {
    try {
      const newStatus = service.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase
        .from('services')
        .update({ status: newStatus })
        .eq('id', service.id);

      if (error) throw error;
      toast.success(`Service ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
    } catch (error) {
      console.error('Error toggling service status:', error);
      toast.error('Failed to update service status. Please try again.');
    }
  };

  const filteredServices = services.filter(service => {
    const matchesSearch =
      safeLower(service.title).includes(safeLower(searchTerm)) ||
      safeLower(service.description).includes(safeLower(searchTerm));
    const matchesStatus =
      filterStatus === 'all' || service.status === filterStatus;
    const matchesCategory =
      filterCategory === 'all' || service.category === filterCategory;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleFilterChange = (value: string) => {
    setFilterStatus(value as 'all' | 'active' | 'inactive');
    setPage(1);
  };

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Services</h1>
          <p className="text-slate-500 mt-1">Manage your service offerings</p>
        </div>
        <button
          onClick={() => navigate('/dashboard/services/create')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium text-sm"
        >
          <Plus className="w-5 h-5" />
          Create Service
        </button>
      </div>

      {/* Services guide — plain-language */}
      <TipNote tone="tip" title="Get more orders from your services" compact>
        Views grow when clients browse, orders count after a service purchase is completed, and your rating updates after each review — all in real time. The <strong>Price Offers</strong> panel shows clients' negotiable offers on your services; accepting one lets the client order at that agreed price. Edit any service with the pencil icon — changes go live instantly.
      </TipNote>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <Package className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{services.length}</p>
              <p className="text-sm text-slate-500">Total Services</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Eye className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {services.reduce((sum, s) => sum + (s.views || 0), 0)}
              </p>
              <p className="text-sm text-slate-500">Total Views</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 rounded-xl">
              <ShoppingBag className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {services.reduce((sum, s) => sum + (s.orders || 0), 0)}
              </p>
              <p className="text-sm text-slate-500">Total Orders</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Star className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {services.length > 0
                  ? (services.reduce((sum, s) => sum + (s.rating || 0), 0) / services.length).toFixed(1)
                  : '—'}
              </p>
              <p className="text-sm text-slate-500">Avg Rating</p>
            </div>
          </div>
        </div>
      </div>

      {/* 💬 Negotiable-Price Offers — live */}
      {offers.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <button
            onClick={() => setShowOffers(!showOffers)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquareText className="w-5 h-5 text-emerald-600" />
              <span className="font-bold text-slate-900">Price Offers</span>
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">
                {offers.filter(o => o.status === 'pending').length} pending
              </span>
            </div>
            {showOffers ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>

          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
            showOffers ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
          }`}>
            <div className="px-4 pb-4 space-y-3 border-t border-slate-50">
              {offers.slice(0, 10).map(offer => (
                <div key={offer.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900">
                          {offer.client?.name || 'Client'} offered{' '}
                          <span className="text-emerald-600">{formatCurrency(Number(offer.amount))}</span>
                        </p>
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                          offer.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                          offer.status === 'declined' ? 'bg-red-100 text-red-600' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {offer.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">on "{offer.service?.title || 'Service'}"</p>
                      {offer.message && (
                        <p className="text-xs text-slate-600 mt-1 italic">"{offer.message}"</p>
                      )}
                    </div>
                    {offer.status === 'pending' && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => respondToOffer(offer, 'accepted')}
                          disabled={offerBusy === offer.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {offerBusy === offer.id ? '...' : 'Accept'}
                        </button>
                        <button
                          onClick={() => respondToOffer(offer, 'declined')}
                          disabled={offerBusy === offer.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Categories Section - A-Z Accordion */}
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search services..."
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => handleFilterChange(e.target.value)}
          className="px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
          className="px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">All Categories</option>
          {services
            .map(s => s.category)
            .filter((v, i, a) => a.indexOf(v) === i)
            .map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
        </select>
      </div>

      {/* Services Grid */}
      {filteredServices.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No services found</h3>
          <p className="text-slate-500">
            {searchTerm || filterStatus !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Create your first service to start offering your services'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredServices
              .slice((page - 1) * pageSize, page * pageSize)
              .map(service => (
            <div
              key={service.id}
              className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Cover Image */}
              {'image_url' in service && (service as unknown as Record<string, unknown>).image_url ? (
                <div className="relative aspect-video bg-slate-50 overflow-hidden group">
                  <img
                    src={(service as unknown as Record<string, string>).image_url}
                    alt={service.title}
                    className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
              ) : null}
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <span className="inline-block px-2 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 mb-2">
                      {service.category}
                    </span>
                    <h3 className="font-semibold text-slate-900 line-clamp-2">{service.title}</h3>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-semibold text-slate-900">{service.rating ? Number(service.rating).toFixed(1) : '—'}</span>
                  </div>
                </div>

                <p className="text-sm text-slate-500 line-clamp-3 mb-4">{service.description}</p>

                <div className="flex items-center gap-4 mb-3 text-sm text-slate-500">
                  <div className="flex items-center gap-1">
                    <IndianRupee className="w-4 h-4" />
                    <span className="font-semibold text-slate-900">
                      {(service as any).packages?.length > 0 ? 'From ' : ''}{formatCurrency(Number(service.price))}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{service.delivery_days} days</span>
                  </div>
                  {service.revisions ? (
                    <div className="flex items-center gap-1">
                      <Tag className="w-4 h-4" />
                      <span>{service.revisions} free rev</span>
                    </div>
                  ) : null}
                </div>
                {(service as any).negotiable || (service as any).accepts_tips ? (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(service as any).negotiable && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                        <BadgePercent className="w-3 h-3" />
                        Negotiable
                      </span>
                    )}
                    {(service as any).accepts_tips && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100">
                        <HandCoins className="w-3 h-3" />
                        Tips welcome
                      </span>
                    )}
                  </div>
                ) : null}
                {Number(service.extra_revision_price) > 0 && (
                  <p className="text-[11px] text-amber-600 mb-4">
                    Extra revision: {formatCurrency(Number(service.extra_revision_price))} each (beyond free revisions)
                  </p>
                )}

                {service.tags && service.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {service.tags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-emerald-50 text-emerald-700"
                      >
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                    {service.tags.length > 3 && (
                      <span className="text-xs text-slate-400">+{service.tags.length - 3} more</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {service.views || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3" />
                      {service.orders || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStatus(service)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                        service.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {service.status === 'active' ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => navigate(`/dashboard/services/edit/${service.id}`)}
                      title="Edit service"
                      className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(service.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
          <Pagination
            currentPage={page}
            totalItems={filteredServices.length}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm ? handleDelete(deleteConfirm) : Promise.resolve()}
        title="Delete Service"
        message="Are you sure you want to delete this service? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
