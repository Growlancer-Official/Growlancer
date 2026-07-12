import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Layers, Loader2 } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { CategoriesSection } from '../components/CategoriesSection';

export function CategoriesPage() {
  const { categories, loading, error, refresh } = useCategories();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img
              src="/UpdatedLogo.webp"
              alt="Growlancer"
              className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105"
            />
            <span className="font-display font-black text-xl tracking-tight text-slate-900">Growlancer</span>
          </Link>
          <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
            Back to Home
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold uppercase tracking-wider rounded-full mb-6">
            <Layers className="w-3.5 h-3.5" />
            {loading ? '...' : categories.length} Categories
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-bold text-slate-900 mb-6">
            Browse All Categories
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Explore all {loading ? '...' : categories.length} categories — from Development & IT to Sustainability. 
            Browse all categories and find the right freelancer for your project.
          </p>
        </div>
      </section>

      {/* Categories Section */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Error banner */}
          {error && !loading && (
            <div className="mb-8 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Could not load live category data. Categories are still browseable below.</span>
              <button
                onClick={refresh}
                className="ml-auto text-xs font-medium text-amber-700 underline hover:text-amber-800 whitespace-nowrap"
              >
                Retry
              </button>
            </div>
          )}

          {loading && categories.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : (
            <CategoriesSection mode="browse" maxInitial={0} />
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="pb-16 sm:pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-[2.5rem] p-8 sm:p-12 text-center border border-slate-200 shadow-sm">
            <h2 className="font-display text-3xl font-bold text-slate-900 mb-4">Can't find what you're looking for?</h2>
            <p className="text-slate-600 mb-8 max-w-lg mx-auto">
              Post a custom project and let our AI match you with the perfect freelancer for your specific needs.
            </p>
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors"
            >
              Post a Custom Project
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
