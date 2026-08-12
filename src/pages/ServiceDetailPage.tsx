import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BadgePercent, Calendar, CheckCircle, ChevronRight, Clock, HandCoins, Loader2, MessageSquare, Send, Shield, ShoppingCart, Star, Tag, X } from 'lucide-react';
import { supabase, uniqueChannelName } from '../lib/supabase';
import { reviewService } from '../lib/reviews';
import { useToast } from '../components/Toast';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { ProBadge } from '../components/ProBadge';
import { razorpayService } from '../lib/razorpay';
import { useAuth } from '../context/AuthContext';

interface ServiceData {
  id: string;
  freelancer_id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string | null;
  price_type: 'fixed' | 'hourly' | 'package';
  price: number;
  extra_revision_price?: number;
  revisions?: number;
  price_package?: { name: string; price: number; description: string }[];
  delivery_time: string;
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
  image_url?: string | null;
  freelancer?: {
    id: string;
    name: string | null;
    avatar: string | null;
    is_pro?: boolean | null;
    verification_status?: string | null;
    professional?: {
      title: string | null;
      hourly_rate: number | null;
      location: string | null;
      skills: string[];
    } | null;
    average_rating?: number;
    total_reviews?: number;
  };
}

export function ServiceDetailPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [service, setService] = useState<ServiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const [addingToCart, setAddingToCart] = useState(false);
  // 💬 Negotiable price + tips
  const [myOffers, setMyOffers] = useState<any[]>([]);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [tipPercent, setTipPercent] = useState<number | null>(null);

  useEffect(() => {
    if (!serviceId) return;

    const fetchService = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('services')
          .select(`
            *,
            freelancer:profiles!services_freelancer_id_fkey (
              id,
              name,
              avatar,
              is_pro,
              verification_status,
              professional:freelancer_profiles(title, hourly_rate, location, skills)
            )
          `)
          .eq('id', serviceId)
          .eq('status', 'active')
          .maybeSingle();

        // Graceful not-found: a missing/inactive/deleted service must show the
        // friendly "Service Not Found" state — never a scary error toast.
        // (.single() used to raise PGRST116 here which surfaced as
        // "Failed to load service." even though nothing was actually broken.)
        if (error) throw error;
        if (!data) {
          setService(null);
          setLoading(false);
          return;
        }

        const svc = data as unknown as ServiceData;

        // Fetch freelancer reviews for rating
        if (svc.freelancer) {
          const reviewsResult = await reviewService.getUserReviews(svc.freelancer_id);
          svc.freelancer.average_rating = reviewsResult.average_rating;
          svc.freelancer.total_reviews = reviewsResult.total_reviews;
        }

        setService(svc);
      } catch (err) {
        toast.error('Error', 'Failed to load service.');
      } finally {
        setLoading(false);
      }
    };

    fetchService();
  }, [serviceId, toast]);

  // 💬 Client-side: track my price offers on this service (real time).
  // If the freelancer accepts, the order price switches to the agreed amount.
  useEffect(() => {
    if (!user || !service || service.freelancer_id === user.id) return;
    let cancelled = false;

    const fetchMyOffers = async () => {
      try {
        const { data } = await supabase
          .from('service_offers')
          .select('*')
          .eq('service_id', service.id)
          .eq('client_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);
        if (!cancelled && data) setMyOffers(data);
      } catch { /* non-critical */ }
    };
    void fetchMyOffers();

    const channel = supabase
      .channel(uniqueChannelName('svc-offers', `${service.id}:${user.id}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_offers',
          filter: `service_id=eq.${service.id} AND client_id=eq.${user.id}`,
        },
        (payload) => {
          if (cancelled) return;
          if (payload.eventType === 'INSERT') {
            setMyOffers(prev => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setMyOffers(prev => prev.map(o => (o.id === payload.new.id ? { ...o, ...payload.new } : o)));
          } else if (payload.eventType === 'DELETE') {
            setMyOffers(prev => prev.filter(o => o.id !== (payload.old as any)?.id));
          }
        }
      )
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [user, service]);

  // Record a service view (once per session, never for the owner) so the
  // freelancer's dashboard shows a real-time view count.
  useEffect(() => {
    if (!serviceId || !service) return;
    // Skip counting the owner's own visits
    if (user?.id && service.freelancer_id === user.id) return;

    const sessionKey = `gw_service_view:${serviceId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const record = async () => {
      try {
        await (supabase.rpc as any)('record_service_view', {
          p_service_id: serviceId,
        });
        sessionStorage.setItem(sessionKey, '1');
      } catch (error) {
        console.error('Error recording service view:', error);
      }
    };
    void record();
  }, [serviceId, service, user?.id]);

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
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  // One-price model — hourly/package pricing was removed platform-wide.
  // Every service shows a single fixed price set by the freelancer.
  // One-price model — hourly/package pricing was removed platform-wide.
  // Every service shows a single fixed price set by the freelancer.
  // Legacy package services (created before the change) fall back to their
  // first package price so the card never renders ₹0/NaN.
  const currentPrice = service.price
    || (service.price_package && service.price_package.length > 0 ? service.price_package[0].price : 0);

  // Real checkout — creates a Razorpay service_purchase order (server-side
  // amount recomputed from the services table, never trusts the client) and
  // opens the Razorpay checkout modal. On success the payment is verified
  // via signature and the user is confirmed.
  // The effective price: an ACCEPTED offer replaces the listed price (the
  // razorpay function re-verifies the accepted offer server-side — the client
  // can never pay an amount the freelancer didn't agree to).
  const acceptedOffer = myOffers.find(o => o.status === 'accepted');
  const pendingOffer = myOffers.find(o => o.status === 'pending');
  const declinedOffer = myOffers.find(o => o.status === 'declined');
  const displayPrice = acceptedOffer ? Number(acceptedOffer.amount) : currentPrice;
  const tipAmount = tipPercent
    ? Math.round((displayPrice * tipPercent) / 100 * 100) / 100
    : 0;
  const totalPayable = displayPrice + tipAmount;

  const submitOffer = async () => {
    if (!user || !service) return;
    const amount = parseFloat(offerAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Invalid offer', 'Enter a valid offer amount.');
      return;
    }
    setSubmittingOffer(true);
    try {
      const { error } = await supabase.from('service_offers').insert({
        service_id: service.id,
        client_id: user.id,
        freelancer_id: service.freelancer_id,
        amount,
        message: offerMessage.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      // The freelancer's in-app notification is created by the DB trigger
      // (service_offers_notify_fn, SECURITY DEFINER) — real time, automatic.
      toast.success('Offer sent', 'The freelancer will review your offer in real time.');
      setShowOfferModal(false);
      setOfferAmount('');
      setOfferMessage('');
    } catch (err) {
      console.error('Submit offer failed:', err);
      toast.error('Error', 'Failed to send your offer. Please try again.');
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleContinueToOrder = async () => {
    if (!user) {
      toast.info('Login required', 'Please log in to place an order.');
      navigate('/login');
      return;
    }
    if (!service) return;

    setAddingToCart(true);
    try {
      const { order, razorpay_key_id, amount, currency } = await razorpayService.createOrder({
        order_type: 'service_purchase',
        amount: totalPayable,
        currency: 'INR',
        description: `Service: ${service.title}${tipAmount > 0 ? ' + tip' : ''}`,
        metadata: {
          service_id: service.id,
          service_title: service.title,
          // Server-side validated: 0 <= tip <= service price
          tip_amount: tipAmount > 0 ? tipAmount : 0,
          // Server-side validated: only the client's ACCEPTED offer is honored
          offer_id: acceptedOffer?.id || undefined,
        },
      });

      await razorpayService.openCheckout({
        key: razorpay_key_id,
        amount: Math.round(amount * 100), // paise
        currency,
        name: 'Growlancer',
        description: `Service: ${service.title}`,
        order_id: order.razorpay_order_id,
        config_id: import.meta.env.VITE_RAZORPAY_CONFIG_ID || undefined,
        prefill: {
          name: user.name || '',
          email: user.email || '',
        },
        theme: { color: '#059669' },
        method: {
          card: true,
          upi: true,
          netbanking: true,
          wallet: true,
          emi: true,
        },
        handler: async (response) => {
          await razorpayService.verifyPayment(response);
          toast.success(
            'Order Placed!',
            `Payment for "${service.title}" received. The freelancer will start your order.`
          );
          setAddingToCart(false);
        },
        modal: {
          ondismiss: () => setAddingToCart(false),
        },
      });
    } catch (err) {
      console.error('Order failed:', err);
      toast.error('Order Failed', err instanceof Error ? err.message : 'Could not start payment.');
      setAddingToCart(false);
    }
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
              className="w-full h-64 sm:h-72 md:h-80 object-contain p-2 bg-slate-50 rounded-b-3xl shadow-md"
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
                  Fixed Price
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Updated {new Date(service.updated_at).toLocaleDateString()}
                </span>
                {typeof service.revisions === 'number' && service.revisions > 0 && (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {service.revisions} free revisions
                  </span>
                )}
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

            {/* Revision Policy — transparent to the client */}
            {(typeof service.revisions === 'number' && service.revisions > 0) || Number(service.extra_revision_price) > 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  Revision Policy
                </h2>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">
                        {service.revisions || 0} free revisions included
                      </p>
                      <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                        You can request up to {service.revisions || 0} revision(s) of the delivered work at no extra
                        cost. Revisions cover reasonable fixes to the agreed scope of the service.
                      </p>
                    </div>
                  </div>
                  {Number(service.extra_revision_price) > 0 ? (
                    <div className="flex items-start gap-3 p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
                      <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          Extra revisions: {formatCurrency(Number(service.extra_revision_price))} each
                        </p>
                        <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                          Beyond the included free revisions, the freelancer may charge {formatCurrency(Number(service.extra_revision_price))}
                          per revision. The freelancer sets this rate — you can agree on the price before any extra work begins.
                          No charge applies unless you both agree.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                      <Shield className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Extra revisions</p>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          Beyond the free revisions, any additional revision is subject to a mutually agreed price
                          between you and the freelancer. All payments stay protected by Growlancer Escrow.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Price Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <div className="text-center">
                <p className="text-3xl font-bold text-slate-900">{formatCurrency(displayPrice)}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {service.delivery_time ? `in ${service.delivery_time}` : 'fixed price'}
                </p>
                {(service as any).negotiable && !acceptedOffer && (
                  <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 text-[11px] font-bold rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                    <BadgePercent className="w-3 h-3" />
                    Price Negotiable — make a fair offer
                  </span>
                )}
                {(service as any).accepts_tips && !acceptedOffer && (
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100">
                    <HandCoins className="w-3 h-3" />
                    Tips welcome
                  </span>
                )}
              </div>

              {/* 💬 Offer status — live */}
              {pendingOffer && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                  <p className="text-xs font-semibold text-amber-800">
                    Offer of {formatCurrency(Number(pendingOffer.amount))} pending — the freelancer is reviewing it.
                  </p>
                </div>
              )}
              {declinedOffer && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                  <p className="text-xs font-semibold text-red-700">
                    Your offer of {formatCurrency(Number(declinedOffer.amount))} was declined. Order at the listed price or make a new offer.
                  </p>
                </div>
              )}
              {acceptedOffer && (
                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <p className="text-xs font-semibold text-emerald-800">
                    ✓ Offer accepted — you can order at {formatCurrency(Number(acceptedOffer.amount))} (agreed price).
                  </p>
                </div>
              )}

              {/* 💜 Tip selector — only when the freelancer enables tips */}
              {(service as any).accepts_tips && !acceptedOffer && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Add a tip (goes 100% to the freelancer):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[0, 5, 10, 15].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setTipPercent(tipPercent === pct ? null : (pct || null))}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                          tipPercent === pct
                            ? 'bg-fuchsia-600 border-fuchsia-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-fuchsia-300'
                        }`}
                      >
                        {pct === 0 ? 'No tip' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                  {tipPercent ? (
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Tip: {formatCurrency(tipAmount)} · Total: <span className="font-bold text-slate-800">{formatCurrency(totalPayable)}</span>
                    </p>
                  ) : null}
                </div>
              )}

              <button
                onClick={handleContinueToOrder}
                disabled={addingToCart}
                className="w-full mt-5 flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg shadow-emerald-600/25"
              >
                {addingToCart ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShoppingCart className="w-4 h-4" />
                )}
                {addingToCart ? 'Processing...' : 'Continue to Order'}
              </button>

              {/* 🤝 Make an Offer — only for logged-in clients on negotiable services */}
              {(service as any).negotiable && !acceptedOffer && user && service.freelancer_id !== user.id && (
                <button
                  onClick={() => setShowOfferModal(true)}
                  disabled={pendingOffer || submittingOffer}
                  className="w-full mt-3 flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <BadgePercent className="w-4 h-4" />
                  {pendingOffer ? 'Offer Pending' : 'Make an Offer'}
                </button>
              )}

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

            {/* 🤝 Make an Offer Modal */}
            {showOfferModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => !submittingOffer && setShowOfferModal(false)}>
                <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Make a Price Offer</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Propose a fair price on "{service.title}". The freelancer accepts or declines — the agreed price is honored, never changed silently.
                      </p>
                    </div>
                    <button onClick={() => !submittingOffer && setShowOfferModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Your offer (₹) *</label>
                      <input
                        type="number"
                        min="1"
                        value={offerAmount}
                        onChange={(e) => setOfferAmount(e.target.value)}
                        placeholder={`Listed price: ${service.price}`}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Message (optional)</label>
                      <textarea
                        rows={3}
                        value={offerMessage}
                        onChange={(e) => setOfferMessage(e.target.value)}
                        placeholder="e.g., I have a clear scope and can share all assets upfront..."
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition-all resize-none"
                      />
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                      <p className="text-[11px] text-blue-700 leading-relaxed">
                        Offers are protected by Growlancer policy: the freelancer decides the agreed price,
                        payment is always processed through escrow, and no work starts before funding.
                      </p>
                    </div>
                    <button
                      onClick={submitOffer}
                      disabled={submittingOffer || !offerAmount}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold"
                    >
                      {submittingOffer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {submittingOffer ? 'Sending...' : 'Send Offer'}
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                      (service.freelancer.name || 'U')[0]
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                      {service.freelancer.name || 'Freelancer'}
                      {service.freelancer.verification_status === 'verified' && <VerifiedBadge size="xs" />}
                      {service.freelancer.is_pro && <ProBadge size="xs" />}
                    </p>
                    {service.freelancer.professional?.title && (
                      <p className="text-xs text-slate-500">{service.freelancer.professional.title}</p>
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
                  {(service.freelancer.professional?.skills || []).slice(0, 4).map((skill) => (
                    <span key={skill} className="px-2 py-0.5 bg-slate-50 text-slate-600 text-xs rounded-md">
                      {skill}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-md shadow-emerald-600/20">
                  <MessageSquare className="w-4 h-4" />
                  Contact Me
                  <ChevronRight className="w-4 h-4" />
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}