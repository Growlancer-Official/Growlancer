import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { ArrowRight, Briefcase, CheckCircle, IndianRupee, Image, Layers, Plus, Shield, Sparkles, Tag, Trash2, X, Zap } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useCategories } from '../../hooks/useCategories';
import { ImageUpload } from '../../components/ImageUpload';
import AIGenerateModal from '../../components/AIGenerateModal';
import { formatCurrency, currencySymbol } from '../../lib/currency';

// ── Package tier types (FINAL MODEL: 3 tiers, free for ALL freelancers) ──
export interface ServicePackage {
  tier: 'basic' | 'standard' | 'premium';
  title: string;
  price: number;
  currency: string;
  delivery_days: number;
  revisions: number;
  deliverables: string[];
}

export interface ServiceAddon {
  id: string;
  title: string;
  price: number;
  currency: string;
  type: 'extra_revision' | 'fast_delivery' | 'extra';
}

const TIER_META: Record<ServicePackage['tier'], { label: string; hint: string; accent: string }> = {
  basic:    { label: 'Basic',    hint: 'Essential — your entry offer for most clients', accent: 'border-slate-200 bg-slate-50/50' },
  standard: { label: 'Standard', hint: 'Most popular — best value for typical projects', accent: 'border-emerald-200 bg-emerald-50/40' },
  premium:  { label: 'Premium',  hint: 'Full package — for clients who want everything', accent: 'border-violet-200 bg-violet-50/40' },
};

const emptyPackage = (tier: ServicePackage['tier']): ServicePackage => ({
  tier,
  title: TIER_META[tier].label,
  price: 0,
  currency: 'INR',
  delivery_days: 7,
  revisions: 5,
  deliverables: [],
});

export function CreateServicePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { serviceId } = useParams<{ serviceId: string }>();
  const isEditMode = Boolean(serviceId);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEditMode);
  const toast = useToast();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Web Development',
    // FINAL MODEL: 3-tier packaging — Basic required, Standard/Premium optional.
    // The legacy single `price` column is kept in sync with the Basic tier so
    // cards/search continue to work; escrow uses packages server-side.
    price: '',
    packages: [emptyPackage('basic'), emptyPackage('standard'), emptyPackage('premium')] as ServicePackage[],
    addons: [] as ServiceAddon[],
    milestone_mode: 'single' as 'single' | 'multi',
    requirements: '',
    tags: [] as string[],
    features: [] as string[],
    image_url: '',
    // 💡 Tip + negotiable — freelancer chooses; clients see them on the detail page
    accepts_tips: false,
    negotiable: false,
  });
  const [addonInput, setAddonInput] = useState({ title: '', price: '' });
  const [tagInput, setTagInput] = useState('');
  const [featureInput, setFeatureInput] = useState('');

  const { flatNames: categories } = useCategories();

  const popularTags = [
    'React', 'Node.js', 'Python', 'JavaScript', 'TypeScript',
    'WordPress', 'Shopify', 'UI Design', 'UX Research', 'SEO',
    'Content Strategy', 'Social Media', 'Email Marketing', 'Brand Identity',
    'Logo Design', 'Video Production', 'Animation', 'Data Analysis',
  ];

  const handleAddTag = (tag: string) => {
    if (!formData.tags.includes(tag)) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tag],
      });
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((t) => t !== tag),
    });
  };

  const handleCustomTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()],
      });
      setTagInput('');
    }
  };

  const handleAddFeature = () => {
    if (featureInput.trim() && !formData.features.includes(featureInput.trim())) {
      setFormData({
        ...formData,
        features: [...formData.features, featureInput.trim()],
      });
      setFeatureInput('');
    }
  };

  const handleRemoveFeature = (feature: string) => {
    setFormData({
      ...formData,
      features: formData.features.filter((f) => f !== feature),
    });
  };

  // Edit mode: load the existing service into the form (real time — the
  // dashboard already subscribes to services changes, so saving updates every
  // open view of this service instantly).
  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;

    const loadService = async () => {
      try {
        const { data, error } = await supabase
          .from('services')
          .select('*')
          .eq('id', serviceId)
          .maybeSingle();

        if (error) throw error;
        if (cancelled || !data) return;
        if (data.freelancer_id !== user?.id) {
          toast.error('Error', 'You can only edit your own services.');
          navigate('/dashboard/services');
          return;
        }

        const svc = data as unknown as {
          title: string; description: string; category: string;
          price: number; price_type: string | null; delivery_days: number;
          revisions: number | null; extra_revision_price: number | null;
          requirements: string | null; tags: string[] | null;
          features: unknown; image_url: string | null;
          packages: unknown; addons: unknown; milestone_mode: string | null;
          accepts_tips: boolean | null; negotiable: boolean | null;
        };

        // Rebuild the package list from the stored JSONB (defaults when legacy
        // single-price services have no packages yet).
        const storedPackages = Array.isArray(svc.packages)
          ? (svc.packages as ServicePackage[])
          : [];
        const packages = (['basic', 'standard', 'premium'] as ServicePackage['tier'][]).map((tier) => {
          const found = storedPackages.find((p) => p.tier === tier);
          return found ? { ...emptyPackage(tier), ...found } : emptyPackage(tier);
        });
        // Legacy services fall back to their single price as the Basic tier.
        if (storedPackages.length === 0 && svc.price != null) {
          packages[0] = { ...packages[0], price: Number(svc.price) };
        }

        setFormData({
          title: svc.title || '',
          description: svc.description || '',
          category: svc.category || 'Web Development',
          price: svc.price != null ? String(svc.price) : '',
          packages,
          addons: Array.isArray(svc.addons) ? (svc.addons as ServiceAddon[]) : [],
          milestone_mode: svc.milestone_mode === 'multi' ? 'multi' : 'single',
          requirements: svc.requirements || '',
          tags: svc.tags || [],
          features: Array.isArray(svc.features) ? svc.features.map(String) : [],
          image_url: svc.image_url || '',
          accepts_tips: svc.accepts_tips === true,
          negotiable: svc.negotiable === true,
        });
      } catch (err) {
        console.error('Failed to load service for edit:', err);
        toast.error('Error', 'Failed to load service. Please try again.');
        navigate('/dashboard/services');
      } finally {
        if (!cancelled) setFetching(false);
      }
    };

    void loadService();
    return () => { cancelled = true; };
  }, [serviceId, user?.id, navigate, toast]);

  const updatePackage = (tier: ServicePackage['tier'], patch: Partial<ServicePackage>) => {
    setFormData({
      ...formData,
      packages: formData.packages.map((p) => (p.tier === tier ? { ...p, ...patch } : p)),
    });
  };

  const updatePackageDeliverable = (tier: ServicePackage['tier'], index: number, value: string) => {
    setFormData({
      ...formData,
      packages: formData.packages.map((p) =>
        p.tier === tier
          ? { ...p, deliverables: p.deliverables.map((d, i) => (i === index ? value : d)) }
          : p
      ),
    });
  };

  const addDeliverable = (tier: ServicePackage['tier']) => {
    setFormData({
      ...formData,
      packages: formData.packages.map((p) =>
        p.tier === tier ? { ...p, deliverables: [...p.deliverables, ''] } : p
      ),
    });
  };

  const removeDeliverable = (tier: ServicePackage['tier'], index: number) => {
    setFormData({
      ...formData,
      packages: formData.packages.map((p) =>
        p.tier === tier ? { ...p, deliverables: p.deliverables.filter((_, i) => i !== index) } : p
      ),
    });
  };

  const handleAddAddon = () => {
    const price = parseFloat(addonInput.price);
    if (!addonInput.title.trim() || !Number.isFinite(price) || price <= 0) return;
    setFormData({
      ...formData,
      addons: [
        ...formData.addons,
        {
          id: `addon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: addonInput.title.trim(),
          price,
          currency: 'INR',
          type: 'extra',
        },
      ],
    });
    setAddonInput({ title: '', price: '' });
  };

  const removeAddon = (id: string) => {
    setFormData({ ...formData, addons: formData.addons.filter((a) => a.id !== id) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate: Basic tier is mandatory and must have a real price.
    const basic = formData.packages.find((p) => p.tier === 'basic');
    if (!basic || !Number.isFinite(basic.price) || basic.price <= 0) {
      toast.error('Basic package required', 'Set a price for the Basic package — it is the minimum every client can order.');
      setLoading(false);
      return;
    }
    // Higher tiers are optional, but if present they must be valid.
    const invalidTier = formData.packages.find((p) => p.tier !== 'basic' && p.price > 0 && (!Number.isFinite(p.price) || p.price < 0));
    if (invalidTier) {
      toast.error('Invalid package price', `${TIER_META[invalidTier.tier].label} package price must be a valid amount.`);
      setLoading(false);
      return;
    }

    // Only keep tiers the freelancer actually filled (price > 0) so empty
    // optional tiers don't create ₹0 cards. Basic is always kept.
    const publishedPackages = formData.packages.filter(
      (p) => p.tier === 'basic' || (p.price > 0 && p.title.trim())
    );

    const payload = {
      title: formData.title,
      description: formData.description,
      category: formData.category,
      // Basic tier price feeds the legacy `price` column (cards/search).
      price: basic.price,
      price_type: 'package' as const,
      currency: 'INR',
      packages: publishedPackages,
      addons: formData.addons,
      milestone_mode: formData.milestone_mode,
      requirements: formData.requirements || null,
      features: formData.features,
      tags: formData.tags,
      image_url: formData.image_url || null,
      accepts_tips: formData.accepts_tips,
      negotiable: formData.negotiable,
    };

    try {
      if (isEditMode && serviceId) {
        // Keep the existing status — editing must NOT silently reactivate a
        // service the freelancer intentionally deactivated.
        const { error } = await (supabase.from('services') as any)
          .update(payload)
          .eq('id', serviceId);
        if (error) throw error;
        toast.success('Service updated', 'Your changes are live in real time.');
      } else {
        const { error } = await (supabase.from('services') as any).insert({
          ...payload,
          freelancer_id: user?.id,
          status: 'active',
          views: 0,
          orders: 0,
          rating: 0,
        });
        if (error) throw error;
        toast.success('Service published', 'Your service is now live.');
      }

      navigate('/dashboard/services');
    } catch (error) {
      console.error('Save service failed:', error);
      toast.error('Error', isEditMode ? 'Failed to update service. Please try again.' : 'Failed to create service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">
          {isEditMode ? 'Edit Service' : 'Create New Service'}
        </h1>
        <p className="text-slate-500">{isEditMode
          ? 'Update your service — changes go live instantly for clients'
          : 'Create a professional service offering to attract clients and grow your business'}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Service Image */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Image className="w-5 h-5 text-emerald-600" />
            Service Image
          </h2>
          <div className="space-y-1">
            <p className="text-xs text-emerald-600 font-medium">
              A great cover image helps your service stand out in search results. Recommended: bright, clean, and relevant to your service.
            </p>
          </div>
          <ImageUpload
            currentImage={formData.image_url}
            onUploadComplete={(url) => setFormData({ ...formData, image_url: url })}
            onRemove={() => setFormData({ ...formData, image_url: '' })}
            folder="services"
            label="Service Cover Image"
            aspectRatio="16/9"
            compact
          />
        </div>

        {/* Basic Information */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-emerald-600" />
            Basic Information
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Service Title *</label>
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                  placeholder="e.g., I will build a professional React website for your business"
                />
                <AIGenerateModal
                  field="service_title"
                  triggerLabel="AI"
                  className="shrink-0 mt-1"
                  context={{
                    category: formData.category || undefined,
                    base_price: formData.price || undefined,
                  }}
                  onApply={(text) => setFormData({ ...formData, title: text })}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Make it descriptive and keyword-rich for better visibility</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Description *</label>
              <textarea
                required
                rows={8}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all resize-none"
                placeholder="Describe your service in detail. Include what you deliver, your process, and what makes you unique..."
              />
              <div className="mt-2 flex items-center gap-2">
                <AIGenerateModal
                  field="service_description"
                  triggerLabel="Write description with AI"
                  context={{
                    category: formData.category || undefined,
                    base_price: formData.price || undefined,
                  }}
                  onApply={(text) => setFormData({ ...formData, description: text })}
                />
                <span className="text-[11px] text-slate-400">Free: 5/day · Pro: unlimited</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Minimum 150 characters recommended for better SEO</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Category *</label>
              <select
                required
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Pricing & Delivery — FINAL MODEL: 3 package tiers + addons */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
            Packages & Pricing
          </h2>

          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-start gap-2.5 mb-5">
            <Shield className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-900">3 tiers — free for every freelancer, no subscription needed</p>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                Offer Basic, Standard and Premium packages so clients can pick the scope that fits. This is completely
                free — your subscription never affects packages, visibility or ranking. The client pays the package
                price + a flat 5% platform fee; you receive 100% of the package price.
              </p>
            </div>
          </div>

          {/* Package tiers */}
          <div className="space-y-4">
            {formData.packages.map((pkg) => {
              const meta = TIER_META[pkg.tier];
              const isBasic = pkg.tier === 'basic';
              return (
                <div key={pkg.tier} className={`rounded-2xl border p-5 ${meta.accent}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        {meta.label}
                        {isBasic && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Required</span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{meta.hint}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Price ({currencySymbol()})</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={pkg.price > 0 ? pkg.price : ''}
                        onChange={(e) => updatePackage(pkg.tier, { price: parseFloat(e.target.value) || 0 })}
                        className="w-28 px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white"
                        placeholder={isBasic ? '500' : 'Optional'}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Package title</label>
                      <input
                        type="text"
                        value={pkg.title}
                        onChange={(e) => updatePackage(pkg.tier, { title: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white"
                        placeholder={meta.label}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Delivery (days)</label>
                        <input
                          type="number"
                          min="1"
                          value={pkg.delivery_days}
                          onChange={(e) => updatePackage(pkg.tier, { delivery_days: parseInt(e.target.value) || 1 })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Revisions</label>
                        <input
                          type="number"
                          min="0"
                          value={pkg.revisions}
                          onChange={(e) => updatePackage(pkg.tier, { revisions: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Deliverables — what this package includes */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      What's included (deliverables)
                    </label>
                    <div className="space-y-2">
                      {pkg.deliverables.map((d, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            type="text"
                            value={d}
                            onChange={(e) => updatePackageDeliverable(pkg.tier, i, e.target.value)}
                            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white"
                            placeholder={i === 0 ? `e.g., ${meta.label} design with 3 pages` : 'Another deliverable'}
                          />
                          <button
                            type="button"
                            onClick={() => removeDeliverable(pkg.tier, i)}
                            className="px-2.5 text-slate-400 hover:text-red-500 transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addDeliverable(pkg.tier)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add deliverable
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Milestone mode */}
          <div className="mt-5 p-4 rounded-xl border border-slate-200 bg-white">
            <p className="text-sm font-semibold text-slate-900 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              Milestone structure
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, milestone_mode: 'single' })}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  formData.milestone_mode === 'single'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                }`}
              >
                Single milestone (recommended)
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, milestone_mode: 'multi' })}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  formData.milestone_mode === 'multi'
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                }`}
              >
                One milestone per deliverable
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Single: the full package amount is released on delivery. Multi: the amount splits across deliverables
              and each releases as it's delivered. Every milestone has the same escrow protection + 72h auto-release.
            </p>
          </div>

          {/* Addons */}
          <div className="mt-5 p-4 rounded-xl border border-slate-200 bg-white">
            <p className="text-sm font-semibold text-slate-900 mb-1.5 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-emerald-600" />
              Add-ons (optional paid extras)
            </p>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Offer extras clients can add at checkout — faster delivery, extra revisions, or anything else you sell.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.addons.map((addon) => (
                <span
                  key={addon.id}
                  className="px-3 py-1.5 bg-violet-50 text-violet-700 text-sm font-medium rounded-full border border-violet-200 flex items-center gap-1.5"
                >
                  {addon.title} · {formatCurrency(Number(addon.price))}
                  <button
                    type="button"
                    onClick={() => removeAddon(addon.id)}
                    className="hover:text-violet-900"
                    title="Remove add-on"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={addonInput.title}
                onChange={(e) => setAddonInput({ ...addonInput, title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAddon())}
                className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="e.g., 48-hour fast delivery"
              />
              <input
                type="number"
                min="0"
                step="1"
                value={addonInput.price}
                onChange={(e) => setAddonInput({ ...addonInput, price: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAddon())}
                className="w-28 px-3 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder={`Price ${currencySymbol()}`}
              />
              <button
                type="button"
                onClick={handleAddAddon}
                className="px-4 py-2 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-5 p-4 bg-blue-50 rounded-xl flex items-start gap-2">
            <Shield className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>Professional note:</strong> Package prices are locked into escrow when a client orders — the client
              pays exactly the published price, plus a flat 5% platform fee. You receive 100% of the package price. If a
              client requests more revisions than included, you may charge your extra-revision rate (or a mutually agreed
              price) — agreed before it starts, protected by Growlancer's Refund & Dispute Policy.
            </p>
          </div>

          {/* 💡 Tip + Negotiable — professional ways to win more orders */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <span aria-hidden>💜</span> Accept Tips
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Clients can add an optional tip at checkout — happy clients tip generously and it builds goodwill.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.accepts_tips}
                  onClick={() => setFormData({ ...formData, accepts_tips: !formData.accepts_tips })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    formData.accepts_tips ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.accepts_tips ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <span aria-hidden>🤝</span> Price Negotiable
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Let clients make a fair offer on the package they choose. You accept or decline — the agreed price is
                    honored, never changed silently.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.negotiable}
                  onClick={() => setFormData({ ...formData, negotiable: !formData.negotiable })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                    formData.negotiable ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.negotiable ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Service Features */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            Service Features
          </h2>

          <div className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={featureInput}
                onChange={(e) => setFeatureInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFeature())}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="e.g., Responsive design, SEO optimization, 24/7 support"
              />
              <button
                type="button"
                onClick={handleAddFeature}
                className="px-4 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {formData.features.length > 0 && (
            <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-xl">
              <span className="text-sm font-medium text-slate-700">Features:</span>
              {formData.features.map((feature) => (
                <span
                  key={feature}
                  className="px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  {feature}
                  <button
                    type="button"
                    onClick={() => handleRemoveFeature(feature)}
                    className="hover:text-emerald-900 ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 p-4 bg-blue-50 rounded-xl">
            <p className="text-sm text-blue-700">
              <strong>Tip:</strong> Add 3-5 key features to make your service stand out. Features help clients quickly understand what you deliver.
            </p>
          </div>
        </div>

        {/* Tags */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-emerald-600" />
            Search Tags
          </h2>

          <div className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCustomTag())}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="Type a tag and press Enter"
              />
              <button
                type="button"
                onClick={handleCustomTag}
                className="px-4 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {popularTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleAddTag(tag)}
                className={`px-4 py-2 rounded-full border transition-colors ${
                  formData.tags.includes(tag)
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-xl">
              <span className="text-sm font-medium text-slate-700">Selected:</span>
              {formData.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full flex items-center gap-1"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-emerald-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Requirements */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            Client Requirements
          </h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">What do you need from the client?</label>
            <textarea
              rows={4}
              value={formData.requirements}
              onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all resize-none"
              placeholder="e.g., Brand assets, content, access to hosting, project brief, timeline requirements..."
            />
            <p className="text-xs text-slate-500 mt-1">List any materials or information you need from the client to start the project</p>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/dashboard/services')}
            className="px-6 py-3 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                {isEditMode ? 'Saving...' : 'Creating...'}
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                {isEditMode ? 'Save Changes' : 'Publish Service'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
