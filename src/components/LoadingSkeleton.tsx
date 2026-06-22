import { Inbox,
  List,
  Loader2 } from 'lucide-react';

type SkeletonVariant =
  | 'full-page'
  | 'stats-grid'
  | 'table'
  | 'list'
  | 'card-grid'
  | 'chat'
  | 'profile'
  | 'chart';

interface LoadingSkeletonProps {
  variant?: SkeletonVariant;
  /** Number of skeleton items to show */
  count?: number;
  /** Optional className override */
  className?: string;
}

/** A single skeleton bar with pulse animation */
function Bar({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-200 ${className || ''}`}
    />
  );
}

/** Row skeleton (icon + 2 lines) */
function Row() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-slate-200 animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <Bar className="h-3 w-3/4" />
        <Bar className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

/** Stat card skeleton */
function StatCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <Bar className="h-3 w-24 mb-2" />
      <Bar className="h-7 w-20 mb-1" />
      <Bar className="h-2.5 w-32" />
    </div>
  );
}

/** Table row skeleton */
function TableRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-50">
      <div className="flex items-center gap-3 flex-1">
        <div className="h-8 w-8 rounded-lg bg-slate-200 animate-pulse shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Bar className="h-3 w-32" />
          <Bar className="h-2.5 w-20" />
        </div>
      </div>
      {Array.from({ length: columns - 1 }).map((_, i) => (
        <div key={i} className="flex-1 hidden sm:block">
          <Bar className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Card skeleton for grid layouts */
function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="aspect-video bg-slate-100 animate-pulse" />
      <div className="p-5 space-y-3">
        <Bar className="h-3 w-24" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-3/4" />
        <div className="flex gap-2">
          <Bar className="h-6 w-16 rounded-full" />
          <Bar className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** Full-page skeleton with sidebar-like layout */
function FullPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Bar className="h-7 w-64" />
        <Bar className="h-4 w-96" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCard key={i} />
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-50 rounded-2xl p-6 space-y-4">
            <Bar className="h-5 w-48" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Row key={i} />
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
            <Bar className="h-5 w-40" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Row key={i} />
            ))}
          </div>
        </div>
        {/* Right */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-3">
            <Bar className="h-5 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Bar key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-3">
            <Bar className="h-5 w-28" />
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Stats-grid skeleton */
function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCard key={i} />
      ))}
    </div>
  );
}

/** Table skeleton */
function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <Bar className="h-5 w-40" />
          <Bar className="h-4 w-24" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i} columns={columns} />
      ))}
    </div>
  );
}

/** List skeleton */
function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Row key={i} />
      ))}
    </div>
  );
}

/** Card grid skeleton */
function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Chat/Inbox skeleton */
function ChatSkeleton() {
  return (
    <div className="flex h-[calc(100vh-12rem)] bg-white rounded-2xl border border-slate-100 overflow-hidden">
      {/* Left panel */}
      <div className="w-80 lg:w-96 border-r border-slate-100 p-3 space-y-2">
        <Bar className="h-9 w-full rounded-lg" />
        <div className="space-y-1 mt-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Bar className="h-3 w-24" />
                <Bar className="h-2.5 w-40" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Right panel */}
      <div className="flex-1 hidden lg:flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <Bar className="h-5 w-32" />
        </div>
        <div className="flex-1 p-5 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
              <div className={`space-y-2 ${i % 2 === 0 ? '' : ''}`}>
                <Bar className={`h-12 w-48 ${i % 2 === 0 ? '' : ''}`} />
                <Bar className={`h-3 w-16 ${i % 2 === 0 ? 'ml-auto' : ''}`} />
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100">
          <Bar className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** Chart skeleton */
function ChartSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-4">
      <Bar className="h-5 w-40" />
      <div className="h-48 flex items-end gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-slate-100 animate-pulse rounded-t-lg"
            style={{ height: `${30 + Math.random() * 70}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Profile settings skeleton */
function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-slate-200 animate-pulse" />
        <div className="space-y-2">
          <Bar className="h-5 w-40" />
          <Bar className="h-3 w-60" />
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Bar className="h-3 w-24" />
            <Bar className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Centered spinner fallback (for Suspense/route-level) */
export function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
      </div>
    </div>
  );
}

/** Dashboard Suspense fallback (lightweight page-level) */
export function DashboardFallback() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <FullPageSkeleton />
    </div>
  );
}

/** Client dashboard Suspense fallback */
export function ClientDashboardFallback() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <FullPageSkeleton />
    </div>
  );
}

/** Admin dashboard Suspense fallback */
export function AdminDashboardFallback() {
  return (
    <div className="flex items-start gap-6 animate-pulse">
      {/* Main content area with dark theme */}
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="h-4 w-32 bg-slate-700 rounded" />
          <div className="h-8 w-64 bg-slate-700 rounded" />
        </div>
        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-6 rounded-3xl" style={{ background: '#1E293B' }}>
              <div className="h-3 w-24 bg-slate-700 rounded mb-4" />
              <div className="h-8 w-20 bg-slate-700 rounded" />
            </div>
          ))}
        </div>
        {/* Table + sidebar */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2">
            <div className="rounded-[2rem] overflow-hidden" style={{ background: '#1E293B', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div className="p-6 border-b border-white/5">
                <div className="h-5 w-40 bg-slate-700 rounded" />
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border-b border-white/5">
                  <div className="h-8 w-8 rounded-lg bg-slate-700" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-slate-700 rounded mb-1" />
                    <div className="h-3 w-20 bg-slate-700 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-8">
            <div className="rounded-[2rem] p-6" style={{ background: '#1E293B', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 p-4">
                  <div className="h-8 w-8 rounded-lg bg-slate-700 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-36 bg-slate-700 rounded" />
                    <div className="h-2.5 w-full bg-slate-700 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Main LoadingSkeleton — choose variant by prop */
export function LoadingSkeleton({ variant = 'full-page', count }: LoadingSkeletonProps) {
  switch (variant) {
    case 'full-page':
      return <FullPageSkeleton />;
    case 'stats-grid':
      return <StatsGridSkeleton count={count} />;
    case 'table':
      return <TableSkeleton rows={count || 5} />;
    case 'list':
      return <ListSkeleton count={count} />;
    case 'card-grid':
      return <CardGridSkeleton count={count} />;
    case 'chat':
      return <ChatSkeleton />;
    case 'profile':
      return <ProfileSkeleton />;
    case 'chart':
      return <ChartSkeleton />;
    default:
      return <FullPageSkeleton />;
  }
}

export default LoadingSkeleton;
