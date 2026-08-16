import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { ArrowRight, Briefcase, CheckCircle, IndianRupee, Image, Plus, Shield, Sparkles, Tag, X, Zap } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useCategories } from '../../hooks/useCategories';
import { ImageUpload } from '../../components/ImageUpload';
import AIGenerateModal from '../../components/AIGenerateModal';

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
    price: '',
    // ⚠️ Hourly removed — services are fixed-price (or package tiers) only.
    // Clients expect one clear professional price; per-hour billing caused
    // confusion between freelancer and client. Only 'fixed' | 'package' remain.
    price_type: 'fixed' as 'fixed' | 'package',
    delivery_days: '7',
    revisions: '5',
    extra_revision_price: '',
    requirements: '',
    tags: [] as string[],
    features: [] as string[],
    image_url: '',
    // 💡 Tip + negotiable — freelancer chooses; clients see them on the detail page
    accepts_tips: false,
    negotiable: false,
  });
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
          accepts_tips: boolean | null; negotiable: boolean | null;
        };

        setFormData({
          title: svc.title || '',
          description: svc.description || '',
          category: svc.category || 'Web Development',
          price: svc.price != null ? String(svc.price) : '',
          // One-price model: every service is fixed-price, even if it was
          // created as 'package' before this change — saving converts it.
          price_type: 'fixed',
          delivery_days: svc.delivery_days != null ? String(svc.delivery_days) : '7',
          revisions: svc.revisions != null ? String(svc.revisions) : '5',
          extra_revision_price: svc.extra_revision_price ? String(svc.extra_revision_price) : '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      title: formData.title,
      description: formData.description,
      category: formData.category,
      price: parseFloat(formData.price),
      // One-price model — hourly/package pricing was removed platform-wide.
      price_type: 'fixed' as const,
      delivery_days: parseInt(formData.delivery_days),
      revisions: parseInt(formData.revisions),
      extra_revision_price: parseFloat(formData.extra_revision_price) || 0,
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
        const { error } = await supabase
          .from('services')
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
                    extra_revision_price: formData.extra_revision_price || undefined,
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

        {/* Pricing & Delivery */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
            Pricing & Delivery
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Fixed Price — one clear price</p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Set a single professional price for your service. Clients see exactly what they pay, and you
                  receive 100% of it — the 5% platform fee is paid by the client on top.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Price (₹) *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Delivery Days *</label>
              <input
                type="number"
                required
                min="1"
                value={formData.delivery_days}
                onChange={(e) => setFormData({ ...formData, delivery_days: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="7"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Revisions Included (Free) *</label>
              <input
                type="number"
                required
                min="0"
                value={formData.revisions}
                onChange={(e) => setFormData({ ...formData, revisions: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="5"
              />
              <p className="text-xs text-slate-500 mt-1">Free revisions included in the base price. We recommend at least 5 for client confidence.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Extra Revision Price (₹/revision)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={formData.extra_revision_price}
                onChange={(e) => setFormData({ ...formData, extra_revision_price: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="0 (no extra charge)"
              />
              <p className="text-xs text-slate-500 mt-1">Charge per revision beyond the free limit. Clients see this clearly before ordering — you decide the rate.</p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-blue-50 rounded-xl flex items-start gap-2">
            <Shield className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>Professional note:</strong> If the client requests more revisions than included, you may charge
              your extra-revision rate (or a mutually agreed price). The included free revisions guarantee the client a
              clear scope — anything beyond it is fairly paid work, agreed before it starts. Both sides stay protected by
              Growlancer's Refund & Dispute Policy.
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
                    Let clients make a fair offer. You accept or decline — the agreed price is honored, never changed silently.
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
