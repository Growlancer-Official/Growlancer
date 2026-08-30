/**
 * Layout-aware loading skeleton — matches the real dashboard layout
 * (sidebar + header + content) so the user sees ONE consistent
 * loading state from ProtectedRoute through to page data fetch.
 */

export function LayoutSkeleton({ variant: _variant = 'freelancer' }: { variant?: 'freelancer' | 'client' }) {
  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Sidebar skeleton — matches w-64 desktop sidebar */}
      <aside className="w-64 sticky top-0 h-screen hidden lg:flex flex-col p-4 bg-white border-r border-slate-200">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-5 px-2">
          <div className="h-9 w-9 rounded-xl bg-slate-200 animate-pulse" />
          <div className="space-y-1">
            <div className="h-3.5 w-20 bg-slate-200 rounded animate-pulse" />
            <div className="h-2.5 w-14 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>

        {/* Nav groups */}
        <div className="flex-1 space-y-4">
          {[1, 2, 3, 4].map((g) => (
            <div key={g}>
              <div className="h-2 w-16 bg-slate-100 rounded mb-2 ml-3" />
              <div className="space-y-1">
                {[1, 2, 3].map((l) => (
                  <div key={l} className="flex items-center gap-2.5 px-3 py-2">
                    <div className="h-4 w-4 bg-slate-200 rounded animate-pulse" />
                    <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom card */}
        <div className="mt-4 bg-slate-50 rounded-xl p-3.5 border border-slate-100">
          <div className="h-3 w-24 bg-slate-200 rounded animate-pulse mb-2" />
          <div className="h-2 w-40 bg-slate-100 rounded animate-pulse mb-2.5" />
          <div className="h-7 w-full bg-slate-200 rounded-lg animate-pulse" />
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header skeleton */}
        <header className="h-16 sm:h-20 bg-white sticky top-0 z-40 border-b border-slate-100 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className="lg:hidden h-9 w-9 bg-slate-100 rounded-xl animate-pulse" />
            <div className="hidden sm:block h-10 w-64 bg-slate-100 rounded-xl animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:block h-7 w-20 bg-slate-100 rounded-full animate-pulse" />
            <div className="h-9 w-9 bg-slate-100 rounded-full animate-pulse" />
            <div className="h-9 w-9 bg-slate-100 rounded-full animate-pulse" />
          </div>
        </header>

        {/* Page content skeleton */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[100rem] mx-auto w-full">
          <div className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <div className="h-6 w-64 bg-slate-200 rounded-lg animate-pulse" />
              <div className="h-3 w-96 bg-slate-100 rounded animate-pulse" />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="h-8 w-8 bg-slate-100 rounded-lg animate-pulse" />
                    <div className="h-3.5 w-3.5 bg-slate-100 rounded animate-pulse" />
                  </div>
                  <div className="h-6 w-16 bg-slate-200 rounded animate-pulse mb-1" />
                  <div className="h-2.5 w-20 bg-slate-100 rounded animate-pulse" />
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="h-3 w-24 bg-slate-200 rounded animate-pulse mb-3" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex flex-col items-center p-3 rounded-xl border border-slate-100">
                    <div className="h-9 w-9 bg-slate-100 rounded-lg animate-pulse mb-2" />
                    <div className="h-2.5 w-16 bg-slate-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>

            {/* Content cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[1, 2].map((c) => (
                <div key={c} className="bg-white rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-3.5 w-28 bg-slate-200 rounded animate-pulse" />
                    <div className="h-2.5 w-16 bg-slate-100 rounded animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    {[1, 2, 3].map((r) => (
                      <div key={r} className="p-3 rounded-xl border border-slate-100">
                        <div className="h-3.5 w-3/4 bg-slate-100 rounded animate-pulse mb-1.5" />
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
          </div>
        </div>
      </main>
    </div>
  );
}
