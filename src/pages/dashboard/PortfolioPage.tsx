import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Edit3, ExternalLink, Image, Loader2, Plus, Save, Star, StarOff, Tag, Trash2, X,  } from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useCategories } from '../../hooks/useCategories';
import { portfolioService, type PortfolioItemInput } from '../../lib/portfolio';
import { ImageUpload } from '../../components/ImageUpload';

interface PortfolioItem {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  project_url: string | null;
  tags: string[];
  technologies_used: string[];
  media_urls: string[];
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function PortfolioPage() {
  const { user } = useAuth();
  const { flatNames: options } = useCategories();
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const toast = useToast();

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formProjectUrl, setFormProjectUrl] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formTechnologies, setFormTechnologies] = useState('');
  const [formMediaUrls, setFormMediaUrls] = useState('');

  const fetchItems = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await portfolioService.getByUser(user.id);
      setItems(result as unknown as PortfolioItem[]);
    } catch (err) {
      console.error('Failed to fetch portfolio items:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);    // Subscribe to realtime changes
  useEffect(() => {
    if (!user) return;
    const unsubscribe = portfolioService.subscribeToPortfolio(user.id, () => {
      void fetchItems();
    });
    return () => { unsubscribe(); };
  }, [user, fetchItems]);

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormCategory('');
    setFormImageUrl('');
    setFormProjectUrl('');
    setFormTags('');
    setFormTechnologies('');
    setFormMediaUrls('');
    setEditingId(null);
    setShowForm(false);
  };

  const openEditForm = (item: PortfolioItem) => {
    setFormTitle(item.title);
    setFormDescription(item.description || '');
    setFormCategory(item.category || '');
    setFormImageUrl(item.image_url || '');
    setFormProjectUrl(item.project_url || '');
    setFormTags((item.tags || []).join(', '));
    setFormTechnologies((item.technologies_used || []).join(', '));
    setFormMediaUrls((item.media_urls || []).join('\n'));
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    try {
      const input: PortfolioItemInput = {
        title: formTitle,
        description: formDescription || undefined,
        category: formCategory || undefined,
        image_url: formImageUrl || undefined,
        project_url: formProjectUrl || undefined,
        tags: formTags.split(',').map((t) => t.trim()).filter(Boolean),
        technologies_used: formTechnologies.split(',').map((t) => t.trim()).filter(Boolean),
        media_urls: formMediaUrls.split('\n').map((u) => u.trim()).filter(Boolean),
      };

      if (editingId) {
        const result = await portfolioService.update(editingId, user.id, input);
        if (!result.success) throw new Error(result.error);
      } else {
        const result = await portfolioService.create(user.id, input);
        if (!result.success) throw new Error(result.error);
      }

      resetForm();
      await fetchItems();
    } catch (err) {
      console.error('Failed to save portfolio item:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    const result = await portfolioService.delete(itemId, user.id);
    if (result.success) {
      await fetchItems();
      toast.success('Portfolio item deleted');
    } else {
      toast.error(result.error || 'Failed to delete portfolio item');
    }
    setDeleteConfirm(null);
  };

  const handleToggleFeatured = async (item: PortfolioItem) => {
    if (!user) return;
    const result = await portfolioService.toggleFeatured(item.id, user.id, !item.is_featured);
    if (result.success) {
      await fetchItems();
    }
  };

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Portfolio</h1>
          <p className="text-slate-500 mt-1">Showcase your best work to potential clients</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Project
        </button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-slate-900">
              {editingId ? 'Edit Project' : 'New Project'}
            </h2>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Title */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Title *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  placeholder="e.g. E-commerce Dashboard Redesign"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                />
              </div>

              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe the project, your role, and key achievements..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all bg-white"
                >
                  <option value="">Select category</option>
                  {options.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Cover Image Upload - compact mode */}
              <div className="md:col-span-2">
                <ImageUpload
                  currentImage={formImageUrl}
                  onUploadComplete={(url) => setFormImageUrl(url)}
                  onRemove={() => setFormImageUrl('')}
                  folder="portfolio"
                  label="Cover Image"
                  aspectRatio="16/9"
                  compact
                />
              </div>

              {/* Project URL */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Project URL</label>
                <input
                  type="url"
                  value={formProjectUrl}
                  onChange={(e) => setFormProjectUrl(e.target.value)}
                  placeholder="https://myproject.com"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tags (comma separated)</label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="react, tailwind, stripe"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                />
              </div>

              {/* Technologies */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Technologies (comma separated)</label>
                <input
                  type="text"
                  value={formTechnologies}
                  onChange={(e) => setFormTechnologies(e.target.value)}
                  placeholder="React, Node.js, PostgreSQL"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                />
              </div>

              {/* Media URLs */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Additional Media URLs (one per line)</label>
                <textarea
                  value={formMediaUrls}
                  onChange={(e) => setFormMediaUrls(e.target.value)}
                  rows={3}
                  placeholder="https://example.com/screenshot1.png&#10;https://example.com/screenshot2.png"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !formTitle.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? 'Update' : 'Add to Portfolio'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Portfolio Grid */}
      {items.length === 0 && !showForm ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center shadow-sm">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Image className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">No portfolio items yet</h3>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            Showcase your best work to stand out to potential clients. Add your first project now.
          </p>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Your First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-all group"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-slate-50 overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Image className="w-12 h-12 text-slate-300" />
                  </div>
                )}
                {item.is_featured && (
                  <div className="absolute top-3 left-3 px-2.5 py-1 bg-amber-400 text-amber-900 text-xs font-bold rounded-lg">
                    Featured
                  </div>
                )}
                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleToggleFeatured(item)}
                    className="p-2 bg-white/90 backdrop-blur-sm rounded-lg hover:bg-white shadow-sm transition-colors"
                    title={item.is_featured ? 'Remove featured' : 'Mark as featured'}
                  >
                    {item.is_featured ? (
                      <StarOff className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Star className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  <button
                    onClick={() => openEditForm(item)}
                    className="p-2 bg-white/90 backdrop-blur-sm rounded-lg hover:bg-white shadow-sm transition-colors"
                    title="Edit"
                  >
                    <Edit3 className="w-4 h-4 text-slate-600" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(item.id)}
                    className="p-2 bg-white/90 backdrop-blur-sm rounded-lg hover:bg-white shadow-sm transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-5">
                <h3 className="font-semibold text-slate-900 mb-1 line-clamp-1">{item.title}</h3>
                {item.description && (
                  <p className="text-sm text-slate-500 mb-3 line-clamp-2">{item.description}</p>
                )}

                {/* Tags */}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-slate-50 text-slate-600 text-xs rounded-md border border-slate-100"
                      >
                        {tag}
                      </span>
                    ))}
                    {item.tags.length > 4 && (
                      <span className="px-2 py-0.5 text-slate-400 text-xs">
                        +{item.tags.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {/* Category & Links */}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  {item.category ? (
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {item.category}
                    </span>
                  ) : (
                    <span />
                  )}
                  {item.project_url && (
                    <a
                      href={item.project_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Live
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Preview */}
      {previewIndex !== null && items[previewIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewIndex(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewIndex(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            {items[previewIndex].image_url && (
              <img
                src={items[previewIndex].image_url!}
                alt={items[previewIndex].title}
                className="w-full max-h-[70vh] object-contain bg-slate-50"
              />
            )}
            <div className="p-6">
              <h3 className="text-xl font-semibold text-slate-900">{items[previewIndex].title}</h3>
              {items[previewIndex].description && (
                <p className="text-slate-500 mt-2">{items[previewIndex].description}</p>
              )}
            </div>
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              {previewIndex > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewIndex(previewIndex - 1);
                  }}
                  className="p-2 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white shadow-sm transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              {previewIndex < items.length - 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewIndex(previewIndex + 1);
                  }}
                  className="p-2 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white shadow-sm transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm ? handleDelete(deleteConfirm) : Promise.resolve()}
        title="Delete Portfolio Item"
        message="Are you sure you want to delete this portfolio item? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}