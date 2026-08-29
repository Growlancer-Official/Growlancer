/**
 * Page-level skeleton loader — shows a content-aware skeleton that
 * matches common dashboard page patterns (title, stats, cards, lists).
 * Replaces round spinners so users see what's coming, not a spinner.
 */

interface PageSkeletonProps {
  /** Number of stat cards to show (default 4) */
  stats?: number;
  /** Number of list/card items to show (default 3) */
  items?: number;
  /** Show a grid of cards (default true) */
  cards?: boolean;
  /** Show stat cards row (default true) */
  showStats?: boolean;
  /** Custom title width (Tailwind class) */
  titleWidth?: string;
}

export function PageSkeleton({
  stats = 4,
  items = 3,
  cards = true,
  showStats = true,
  titleWidth = 'w-48',
}: PageSkeletonProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse" />
        <div className="space-y-1.5">
          <div className={`h-5 ${titleWidth} bg-slate-200 rounded-lg animate-pulse`} />
          <div className="h-3 w-64 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>

      {/* Stat cards */}
      {showStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="w-8 h-8 bg-slate-100 rounded-lg animate-pulse" />
                <div className="w-3.5 h-3.5 bg-slate-100 rounded animate-pulse" />
              </div>
              <div className="h-6 w-16 bg-slate-200 rounded animate-pulse mb-1" />
              <div className="h-2.5 w-20 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Content cards / list */}
      {cards ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[1, 2].map((col) => (
            <div key={col} className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-3.5 w-28 bg-slate-200 rounded animate-pulse" />
                <div className="h-2.5 w-16 bg-slate-100 rounded animate-pulse" />
              </div>
              <div className="space-y-2">
                {Array.from({ length: items }).map((_, i) => (
                  <div key={i} className="p-3 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-start mb-1.5">
                      <div className="h-3.5 w-3/4 bg-slate-100 rounded animate-pulse" />
                      <div className="h-5 w-14 bg-slate-100 rounded-full animate-pulse" />
                    </div>
                    <div className="h-2.5 w-1/2 bg-slate-50 rounded animate-pulse mb-1.5" />
                    <div className="flex justify-between">
                      <div className="h-2.5 w-20 bg-slate-50 rounded animate-pulse" />
                      <div className="h-2.5 w-12 bg-slate-50 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="space-y-2">
            {Array.from({ length: items }).map((_, i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-100">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="h-3.5 w-3/4 bg-slate-100 rounded animate-pulse" />
                  <div className="h-5 w-14 bg-slate-100 rounded-full animate-pulse" />
                </div>
                <div className="h-2.5 w-1/2 bg-slate-50 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Minimal skeleton for narrow/form pages (settings, profile, create).
 */
export function FormSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-5 w-40 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-3 w-56 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>

      {/* Form sections */}
      {[1, 2, 3].map((s) => (
        <div key={s} className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="h-4 w-32 bg-slate-200 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="h-2.5 w-20 bg-slate-100 rounded animate-pulse" />
              <div className="h-10 w-full bg-slate-50 rounded-xl animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <div className="h-2.5 w-24 bg-slate-100 rounded animate-pulse" />
              <div className="h-20 w-full bg-slate-50 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
