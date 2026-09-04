import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Eye,
  HandCoins,
  IndianRupee,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { InfoTip } from '../../components/InfoTip';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';
import { PageSkeleton } from '../../components/PageSkeleton';
import { safeLower } from '../../utils/date';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';
import { supabase, realtimeChannels } from '../../lib/supabase';
import type { Tables } from '../../types/supabase';
import { formatCurrency } from '../../lib/currency';
import { serviceFromPrice } from '../../lib/servicePricing';

export function ServicesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Tables<'services'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [page, setPage] = useState(1);
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
      safeLower(service.description).includes(safeLower(searchTerm)) ||
      safeLower((service.skills || []).join(' ')).includes(safeLower(searchTerm));
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
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Package className="w-4 h-4 text-white" />
          </div>
          <div>
          <h1 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">My Services <InfoTip title="Get more orders from your services" text="Views grow when clients browse, orders count after a service purchase is completed, and your rating updates after each review — all in real time. Edit any service with the pencil icon — changes go live instantly." /></h1>
          <p className="text-slate-500 mt-1">Manage your service offerings</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/dashboard/services/create')}
          className="inline-flex items-center justify-center gap-3 px-3 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-semibold"
        >
          <Plus className="w-4 h-4" />
          Create Service
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white p-6 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <Package className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{services.length}</p>
              <p className="text-sm text-slate-500">Total Services</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Eye className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">
                {services.reduce((sum, s) => sum + (s.views || 0), 0)}
              </p>
              <p className="text-sm text-slate-500">Total Views</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5">
            <div className="p-3 bg-orange-100 rounded-xl">
              <ShoppingBag className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">
                {services.reduce((sum, s) => sum + (s.orders || 0), 0)}
              </p>
              <p className="text-sm text-slate-500">Total Orders</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1.5">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Star className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">
                {services.length > 0
                  ? (services.reduce((sum, s) => sum + (s.rating || 0), 0) / services.length).toFixed(1)
                  : '—'}
              </p>
              <p className="text-sm text-slate-500">Avg Rating</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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
        <EmptyState
          icon={<Package className="w-10 h-10" />}
          title="No services found"
          description={searchTerm || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first service to start offering your services'}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {filteredServices
              .slice((page - 1) * pageSize, page * pageSize)
              .map(service => (
            <div
              key={service.id}
              className="bg-white rounded-xl border border-slate-100 hover:shadow-lg transition-shadow"
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
              <div className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <span className="inline-block px-2 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 mb-2">
                      {service.category}
                    </span>
                    <h3 className="font-semibold text-slate-900 line-clamp-4">{service.title}</h3>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-semibold text-slate-900">{service.rating ? Number(service.rating).toFixed(1) : '—'}</span>
                  </div>
                </div>

                <p className="text-sm text-slate-500 line-clamp-3 mb-2">{service.description}</p>

                <div className="flex items-center gap-3 mb-3 text-sm text-slate-500">
                  <div className="flex items-center gap-1">
                    <IndianRupee className="w-4 h-4" />
                    <span className="font-semibold text-slate-900">
                      From {formatCurrency(serviceFromPrice(service))}
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
                {(service as any).accepts_tips && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100">
                      <HandCoins className="w-3.5 h-3.5" />
                      Tips welcome
                    </span>
                  </div>
                )}
                {Number(service.extra_revision_price) > 0 && (
                  <p className="text-xs text-amber-600 mb-2">
                    Extra revision: {formatCurrency(Number(service.extra_revision_price))} each (beyond free revisions)
                  </p>
                )}

                {service.skills && service.skills.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-2">
                    {service.skills.slice(0, 4).map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-violet-50 text-violet-700"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {skill}
                      </span>
                    ))}
                    {service.skills.length > 4 && (
                      <span className="text-xs text-slate-400">+{service.skills.length - 4} more</span>
                    )}
                  </div>
                )}

                {service.tags && service.tags.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-2">
                    {service.tags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-emerald-50 text-emerald-700"
                      >
                        <Tag className="w-3.5 h-3.5" />
                        {tag}
                      </span>
                    ))}
                    {service.tags.length > 3 && (
                      <span className="text-xs text-slate-400">+{service.tags.length - 3} more</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {service.views || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {service.orders || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
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
