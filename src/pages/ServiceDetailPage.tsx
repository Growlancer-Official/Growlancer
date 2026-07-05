import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle, ChevronRight, Clock, Loader2, MessageSquare, Shield, ShoppingCart, Star, Tag,  } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { reviewService } from '../lib/reviews';

interface ServiceData {
  id: string;
  freelancer_id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string | null;
  price_type: 'fixed' | 'hourly' | 'package';
  price: number;
  price_package?: { name: string; price: number; description: string }[];
  delivery_time: string;
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
  image_url?: string | null;
  freelancer?: {
    id: string;
    full_name: string | null;
    avatar: string | null;
    title: string | null;
    hourly_rate: number | null;
    location: string | null;
    skills: string[];
    average_rating?: number;
    total_reviews?: number;
  };
}

export function ServiceDetailPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const [service, setService] = useState<ServiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<number>(0);
  const [addingToCart, setAddingToCart] = useState(false);

  useEffect(() => {
    if (!serviceId) return;

    const fetchService = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('services')
          .select(`
            *,
            freelancer:freelancer_id (
              id,
              full_name,
              avatar,
              title,
              hourly_rate,
              location,
              skills
            )
          `)
          .eq('id', serviceId)
          .eq('status', 'active')
          .single();

        if (error) throw error;

        const svc = data as unknown as ServiceData;

        // Fetch freelancer reviews for rating
        if (svc.freelancer) {
          const reviewsResult = await reviewService.getUserReviews(svc.freelancer_id);
          svc.freelancer.average_rating = reviewsResult.average_rating;
          svc.freelancer.total_reviews = reviewsResult.total_reviews;
        }

        setService(svc);
      } catch (err) {
        console.error('Failed to load service:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchService();
  }, [serviceId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Service Not Found</h2>
          <p className="text-slate-500 mb-6">This service doesn't exist or is no longer available.</p>
          <Link to="/" className="text-emerald-600 hover:underline font-medium">Go Home</Link>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const currentPrice = service.price_package
    ? service.price_package[selectedPackage]?.price || service.price
    : service.price;

  const handleAddToCart = () => {
    setAddingToCart(true);
    // In a real implementation, this would add to cart/checkout
    setTimeout(() => setAddingToCart(false), 1000);
  };

  return (
    <div className="min-h-screen bg-cream">
      {/* Back Navigation */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link to="/services" className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Services
          </Link>
        </div>
      </div>

      {/* Cover Image Hero */}
      {service.image_url && (
        <div className="w-full max-h-80 overflow-hidden bg-slate-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <img
              src={service.image_url}
              alt={service.title}
              className="w-full h-64 sm:h-72 md:h-80 object-cover rounded-b-3xl shadow-md"
            />
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Service Header */}
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                <Link to="/categories" className="hover:text-emerald-600">{service.category}</Link>
                {service.subcategory && (
                  <>
                    <ChevronRight className="w-3 h-3" />
                    <span>{service.subcategory}</span>
                  </>
                )}
              </div>
              <h1 className="text-3xl font-bold text-slate-900">{service.title}</h1>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {service.delivery_time} delivery
                </span>
                <span className="flex items-center gap-1">
                  <Tag className="w-4 h-4" />
                  {service.price_type === 'fixed' ? 'Fixed Price' : service.price_type === 'hourly' ? 'Hourly Rate' : 'Packages'}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Updated {new Date(service.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Description</h2>
              <div className="text-slate-600 whitespace-pre-wrap leading-relaxed">{service.description}</div>
            </div>

            {/* Tags */}
            {service.tags && service.tags.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {service.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 bg-slate-50 text-slate-600 text-sm rounded-lg border border-slate-100"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Packages */}
            {service.price_package && service.price_package.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Packages & Pricing</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {service.price_package.map((pkg, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedPackage(idx)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        selectedPackage === idx
                          ? 'border-emerald-500 bg-emerald-50/30'
                          : 'border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <p className="font-semibold text-slate-900">{pkg.name}</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(pkg.price)}</p>
                      <p className="text-sm text-slate-500 mt-1">{pkg.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Price Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm sticky top-24">
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">{formatCurrency(currentPrice)}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {service.price_type === 'hourly' ? 'per hour' : service.delivery_time ? `in ${service.delivery_time}` : ''}
                </p>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={addingToCart}
                className="w-full mt-5 flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {addingToCart ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShoppingCart className="w-4 h-4" />
                )}
                {addingToCart ? 'Adding...' : 'Continue to Order'}
              </button>

              <div className="mt-4 space-y-2 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  Payment protected by escrow
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  Satisfaction guaranteed
                </div>
              </div>
            </div>

            {/* Freelancer Card */}
            {service.freelancer && (
              <Link
                to={`/freelancer/${service.freelancer_id}`}
                className="block bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-lg font-medium text-slate-600 flex-shrink-0">
                    {service.freelancer.avatar ? (
                      <img src={service.freelancer.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      (service.freelancer.full_name || 'U')[0]
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{service.freelancer.full_name || 'Freelancer'}</p>
                    {service.freelancer.title && (
                      <p className="text-xs text-slate-500">{service.freelancer.title}</p>
                    )}
                  </div>
                </div>

                {service.freelancer.average_rating && service.freelancer.average_rating > 0 && (
                  <div className="flex items-center gap-1 text-sm">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span className="font-medium text-slate-900">{service.freelancer.average_rating.toFixed(1)}</span>
                    <span className="text-slate-400">({service.freelancer.total_reviews})</span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(service.freelancer.skills || []).slice(0, 4).map((skill) => (
                    <span key={skill} className="px-2 py-0.5 bg-slate-50 text-slate-600 text-xs rounded-md">
                      {skill}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                  <MessageSquare className="w-3 h-3" />
                  Contact Me
                  <ChevronRight className="w-3 h-3 ml-auto" />
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}