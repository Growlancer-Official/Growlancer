import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  ArrowRight,
  Briefcase,
  CheckCircle,
  DollarSign,
  Image,
  List,
  Package,
  Plus,
  Search,
  Shield,
  Sparkles,
  Tag,
  Tags,
  Type,
  Video,
  X,
  Zap,
} from 'lucide-react';
import { useCategories } from '../../hooks/useCategories';
import { ImageUpload } from '../../components/ImageUpload';

export function CreateServicePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Web Development',
    price: '',
    price_type: 'fixed' as 'fixed' | 'hourly' | 'package',
    delivery_days: '7',
    revisions: '3',
    requirements: '',
    tags: [] as string[],
    features: [] as string[],
    image_url: '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await (supabase.from('services') as any).insert({
        freelancer_id: user?.id,
        title: formData.title,
        description: formData.description,
        category: formData.category,
        price: parseFloat(formData.price),
        price_type: formData.price_type,
        delivery_days: parseInt(formData.delivery_days),
        revisions: parseInt(formData.revisions),
        requirements: formData.requirements || null,
        features: formData.features,
        tags: formData.tags,
        image_url: formData.image_url || null,
        status: 'active',
        views: 0,
        orders: 0,
        rating: 0,
      });

      if (error) throw error;

      navigate('/dashboard/services');
    } catch (error) {
      console.error('Error creating service:', error);
      alert('Failed to create service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">Create New Service</h1>
        <p className="text-slate-500">Create a professional service offering to attract clients and grow your business</p>
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
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="e.g., I will build a professional React website for your business"
              />
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
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Pricing & Delivery
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Price Type *</label>
              <select
                required
                value={formData.price_type}
                onChange={(e) => setFormData({ ...formData, price_type: e.target.value as 'fixed' | 'hourly' | 'package' })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              >
                <option value="fixed">Fixed Price</option>
                <option value="hourly">Hourly Rate</option>
                <option value="package">Package</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Price ($) *</label>
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

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Revisions Included *</label>
            <input
              type="number"
              required
              min="0"
              value={formData.revisions}
              onChange={(e) => setFormData({ ...formData, revisions: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              placeholder="3"
            />
            <p className="text-xs text-slate-500 mt-1">Number of free revisions included in the base price</p>
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
                Creating...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Publish Service
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
