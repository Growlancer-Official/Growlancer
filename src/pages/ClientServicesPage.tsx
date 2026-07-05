import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { AlertCircle, ArrowRight, Check, Clock, Loader2, RefreshCw, Search, ShieldCheck, ShoppingBag, Sparkles, Star, Tag, X,  } from 'lucide-react';
import { EscrowPayPalPayment } from '../components/EscrowPayPalPayment';
import { PLATFORM_CONFIG } from '../lib/config';
import { useCategories } from '../hooks/useCategories';

interface FreelancerInfo {
  id: string;
  name: string;
  avatar: string | null;
}

interface Service {
  id: string;
  freelancer_id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  price_type: string;
  delivery_days: number;
  revisions: number;
  requirements: string | null;
  tags: string[] | null;
  status: string | null;
  views: number | null;
  orders: number | null;
  rating: number | null;
  reviews_count: number | null;
  image_url?: string | null;
  created_at: string | null;
  freelancer: FreelancerInfo | null;
}

export function ClientServicesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // Checkout Modal State
  const [checkoutService, setCheckoutService] = useState<Service | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<'review' | 'paying' | 'success'>('review');
  const [createdContractId, setCreatedContractId] = useState<string | null>(null);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Available categories — dynamically fetched from DB
  const { flatNames: catNames } = useCategories();
  const categories = ['All', ...catNames];

  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('services')
        .select(`
          *,
          freelancer:profiles!services_freelancer_id_fkey(id, name, avatar)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const mappedServices = (data as any[]).map(item => ({
          ...item,
          price: Number(item.price),
          freelancer: Array.isArray(item.freelancer) ? item.freelancer[0] : item.freelancer
        })) as Service[];
        setServices(mappedServices);
      }
    } catch (err) {
      console.error('Error fetching marketplace services:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Unique channel ID per mount to avoid "cannot add callbacks after subscribe()" error
  const channelId = useRef(`services-marketplace-rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    fetchServices();

    // Real-time: update marketplace when any service changes status/price
    const channel = supabase
      .channel(channelId.current)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'services',
      }, () => void fetchServices())
      .subscribe();

    return () => { void channel.unsubscribe(); };
  }, [fetchServices]);

  // Filter services by category and search term
  const filteredServices = useMemo(() => {
    return services.filter(service => {
      const matchesCategory = selectedCategory === 'All' || service.category === selectedCategory;
      const matchesSearch = service.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            service.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (service.tags && service.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())));
      return matchesCategory && matchesSearch;
    });
  }, [services, selectedCategory, searchTerm]);

  // Handle service purchase initialization
  const handleOpenCheckout = (service: Service) => {
    setCheckoutService(service);
    setCheckoutStep('review');
    setCheckoutError(null);
  };

  // Close Checkout Modal
  const handleCloseCheckout = () => {
    if (checkoutStep === 'paying') {
      if (window.confirm('Your purchase transaction is initiated. Are you sure you want to close?')) {
        setCheckoutService(null);
      }
    } else {
      setCheckoutService(null);
    }
  };

  // Programmatic Project and Contract Creation
  const handleProceedToEscrow = async () => {
    if (!user || !checkoutService) return;
    setIsProcessingCheckout(true);
    setCheckoutError(null);

    try {
      // 1. Programmatically Create a Private Project
      const deadlineDate = new Date();
      deadlineDate.setDate(deadlineDate.getDate() + checkoutService.delivery_days);
      const formattedDeadline = deadlineDate.toISOString().split('T')[0];

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          client_id: user.id,
          title: `Service: ${checkoutService.title}`,
          description: `Contract initiated via Service Marketplace purchase.\n\nService Details: ${checkoutService.description}\n\nFreelancer: ${checkoutService.freelancer?.name || 'Unknown'}`,
          budget_min: Math.round(checkoutService.price),
          budget_max: Math.round(checkoutService.price),
          skills_required: checkoutService.tags || [],
          status: 'active', // Set project as active directly since contract is going into escrow
          category: checkoutService.category,
          experience_level: 'intermediate',
          visibility: 'private',
          deadline: formattedDeadline
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // 2. Programmatically Create a Contract
      const contractAmount = Math.round(checkoutService.price);
      const platformFeeRate = PLATFORM_CONFIG.fees.platform_percentage / 100;
      const platformFee = Math.round(contractAmount * platformFeeRate);
      const freelancerAmount = contractAmount - platformFee;

      // Create initial milestone for service handover & kickoff
      const initialMilestones = [
        {
          id: 'init-task',
          title: `Service Handover & Kickoff`,
          status: 'todo',
          created_by: user.id,
          created_at: new Date().toISOString()
        }
      ];

      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert({
          project_id: project.id,
          freelancer_id: checkoutService.freelancer_id,
          client_id: user.id,
          amount: contractAmount,
          platform_fee: platformFee,
          freelancer_amount: freelancerAmount,
          status: 'pending',
          milestones: JSON.stringify(initialMilestones)
        })
        .select()
        .single();

      if (contractError) throw contractError;

      // Increment services count for views/orders metrics
      await supabase.from('services')
        .update({ orders: (checkoutService.orders || 0) + 1 })
        .eq('id', checkoutService.id);

      setCreatedContractId(contract.id);
      setCheckoutStep('paying');
    } catch (err: any) {
      console.error('Error initiating service purchase:', err);
      setCheckoutError(err?.message || 'Failed to initialize the transaction. Please try again.');
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  const handleCheckoutSuccess = () => {
    setCheckoutStep('success');
  };

  return (
    <div className="space-y-8">
      {/* Header Banner - Sleek HSL Gradient Background */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 text-white p-8 sm:p-12 shadow-2xl border border-emerald-900/40">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl -ml-20 -mb-20"></div>
        
        <div className="relative max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-full border border-emerald-500/30 text-xs uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Growlancer Escrow Marketplace
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-black tracking-tight leading-none">
            Buy Premium Services <br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">With 1-Click Escrow</span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg max-w-xl font-medium leading-relaxed">
            Instant project setup. Select a pre-designed service package, fund the Growlancer Escrow protection, and jump straight into synchronization canvases.
          </p>
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white/60 backdrop-blur-md p-4 rounded-3xl border border-slate-200/50 shadow-sm">
        {/* Categories Scroller */}
        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 text-sm font-bold rounded-xl whitespace-nowrap transition-all duration-300 ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 scale-105'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Bar Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search services, tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-11 pl-11 pr-4 bg-white/80 border border-slate-200 rounded-2xl text-slate-700 placeholder-slate-400 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
          />
        </div>
      </div>

      {/* Loading Skeleton & Service Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-3xl p-6 border border-slate-100 space-y-4 animate-pulse">
              <div className="h-6 bg-slate-200 rounded-full w-24"></div>
              <div className="h-8 bg-slate-200 rounded-lg w-full"></div>
              <div className="h-20 bg-slate-200 rounded-2xl w-full"></div>
              <div className="h-12 bg-slate-200 rounded-2xl w-full"></div>
            </div>
          ))}
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/50 p-16 text-center shadow-sm">
          <ShoppingBag className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-900 mb-2">No services found</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            We couldn't find any services matching your search or category filters. Create your own custom requirements project to hire instead.
          </p>
          <Link
            to="/client/post"
            className="inline-flex mt-6 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
          >
            Post Custom Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className="group bg-white rounded-3xl border border-slate-200/60 p-6 shadow-sm hover:shadow-xl hover:border-emerald-500/20 transition-all duration-300 flex flex-col justify-between"
            >
              {/* Service Cover Image */}
              {service.image_url ? (
                <div className="-mx-6 -mt-6 mb-4 aspect-video bg-slate-50 overflow-hidden rounded-t-3xl">
                  <img
                    src={service.image_url}
                    alt={service.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
              ) : null}

              <div className="space-y-4">
                {/* Category Badge & Price Tag */}
                <div className="flex justify-between items-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full border border-slate-200/40">
                    <Tag className="w-3 h-3 text-slate-500" />
                    {service.category}
                  </span>
                  <div className="text-emerald-600 font-display font-extrabold text-2xl tracking-tight">
                    ${service.price.toLocaleString()}
                  </div>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900 leading-snug group-hover:text-emerald-600 transition-colors line-clamp-1">
                    {service.title}
                  </h3>
                  <p className="text-slate-500 text-sm mt-2 line-clamp-3 leading-relaxed">
                    {service.description}
                  </p>
                </div>

                {/* Freelancer Profile Footer */}
                <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                  <img
                    src={service.freelancer?.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${service.freelancer?.name}`}
                    alt={service.freelancer?.name}
                    className="w-10 h-10 rounded-full object-cover border border-slate-100 bg-slate-50 shadow-sm"
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-800 leading-none">{service.freelancer?.name || 'Unknown'}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-bold text-slate-700">{service.rating ? service.rating.toFixed(1) : '—'}</span>
                      <span className="text-xs text-slate-400">({service.reviews_count ?? 0})</span>
                    </div>
                  </div>
                </div>

                {/* Tags List */}
                {service.tags && service.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {service.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 bg-slate-50 rounded-md border border-slate-100 text-slate-500 font-medium">
                        {tag}
                      </span>
                    ))}
                    {service.tags.length > 3 && (
                      <span className="text-xs text-slate-400 font-semibold px-1">
                        +{service.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-center text-sm font-bold">
                <div className="flex items-center gap-1.5 text-slate-500 justify-start">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>{service.delivery_days} days</span>
                </div>
                <button
                  onClick={() => handleOpenCheckout(service)}
                  className="w-full h-11 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-md hover:shadow-emerald-600/10 active:scale-95 flex items-center justify-center gap-2"
                >
                  Buy Service
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutService && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 flex flex-col justify-between animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="font-display font-black text-xl text-slate-900 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-600" />
                {checkoutStep === 'review' ? 'Checkout Order Details' : checkoutStep === 'paying' ? 'Secure Escrow Payment' : 'Purchase Successful!'}
              </h3>
              <button
                onClick={handleCloseCheckout}
                className="w-8 h-8 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Modal Scroll Content */}
            <div className="p-6 flex-1">
              {checkoutError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>{checkoutError}</div>
                </div>
              )}

              {/* STEP 1: REVIEW ORDER */}
              {checkoutStep === 'review' && (
                <div className="space-y-6">
                  {/* Service Card Summary */}
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/50 flex gap-4">
                    <img
                      src={checkoutService.freelancer?.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${checkoutService.freelancer?.name}`}
                      alt={checkoutService.freelancer?.name}
                      className="w-14 h-14 rounded-full object-cover border border-slate-100"
                    />
                    <div>
                      <h4 className="font-bold text-slate-900 leading-snug">{checkoutService.title}</h4>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">{checkoutService.category}</p>
                      <div className="flex gap-4 mt-2 text-xs text-slate-500 font-bold">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" /> {checkoutService.delivery_days} Days Delivery</span>
                        <span className="flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5 text-slate-400" /> {checkoutService.revisions || 'Unlimited'} Revisions</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Breakdown */}
                  <div className="space-y-3 pt-2">
                    <h5 className="font-bold text-slate-900">Payment Breakdown</h5>
                    <div className="p-5 bg-white rounded-2xl border border-slate-200/60 space-y-3 text-sm">
                      <div className="flex justify-between font-medium text-slate-600">
                        <span>Base Package Price</span>
                        <span>${checkoutService.price.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-medium text-slate-600">
                        <span>Growlancer Platform Fee ({PLATFORM_CONFIG.fees.platform_percentage}%)</span>
                        <span>-${(checkoutService.price * (PLATFORM_CONFIG.fees.platform_percentage / 100)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-medium text-slate-500">
                        <span>Freelancer Receives</span>
                        <span>${(checkoutService.price * (1 - PLATFORM_CONFIG.fees.platform_percentage / 100)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-extrabold text-slate-900 pt-3 border-t border-slate-100 text-base">
                        <span>Total Escrow Funding</span>
                        <span>${checkoutService.price.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Escrow Protection Explanation */}
                  <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100/60 flex gap-3 text-xs text-emerald-800 font-medium">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-extrabold text-emerald-950 block mb-0.5">Growlancer Escrow Protected</span>
                      Your funded payment will be held securely in escrow. It will only be released to {checkoutService.freelancer?.name || 'Unknown'} once you verify and approve the work.
                    </div>
                  </div>

                  {/* Confirm & Proceed Button */}
                  <button
                    onClick={handleProceedToEscrow}
                    disabled={isProcessingCheckout}
                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {isProcessingCheckout ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Setting Up Collaboration Room...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-5 h-5" />
                        Pay & Start Project Room
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* STEP 2: INLINE PAYPAL ESCROW GATEWAY */}
              {checkoutStep === 'paying' && createdContractId && (
                <div className="p-1">
                  <EscrowPayPalPayment
                    contractId={createdContractId}
                    amount={checkoutService.price}
                    freelancerName={checkoutService.freelancer?.name || 'Unknown'}
                    projectTitle={`Service: ${checkoutService.title}`}
                    onSuccess={handleCheckoutSuccess}
                    onCancel={() => setCheckoutStep('review')}
                  />
                </div>
              )}

              {/* STEP 3: SUCCESS CONGRATULATIONS */}
              {checkoutStep === 'success' && (
                <div className="text-center py-8 space-y-6">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <Check className="w-10 h-10 text-emerald-600" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-display font-black text-2xl text-slate-900">Purchase Completed!</h3>
                    <p className="text-slate-500 text-sm max-w-xs mx-auto">
                      Escrow payment was successfully funded. A dedicated collaborative workspace has been setup for this project.
                    </p>
                  </div>

                  {/* Redirection Actions */}
                  <button
                    onClick={() => {
                      setCheckoutService(null);
                      navigate('/client/workspace');
                    }}
                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    Go to Workspace Canvas
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
