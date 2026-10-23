import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';

/**
 * Shown for every module deferred from the early-access release.
 *
 * Deliberately NOT a 404: a 404 says "you typed the address wrong" and invites
 * the visitor to retry. This page says the truth — the feature exists, it is
 * intentionally not part of this release, and nothing was read or changed —
 * then gives two exits that do work.
 *
 * The matching server-side answer is a 410 from the module's edge function
 * (supabase/functions/_shared/features.ts), so a direct API call cannot get
 * further than this page does.
 */
export function FeatureUnavailablePage() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-white px-6 py-24">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-900">
          <Lock className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-amber-900">
          Not available during early access
        </p>
        <h1 className="font-display mt-3 text-3xl font-bold text-slate-900">
          This feature is not part of the early-access release
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          Growlanzo is launching with the core marketplace only — hiring, contracts,
          workspaces, payments and support. This area has been deferred so it can be
          finished properly instead of shipped half-tested. Nothing was read from or
          written to your account.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"
          >
            Back to the marketplace
          </Link>
          <Link
            to="/help-center"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-50"
          >
            Contact support
          </Link>
        </div>
      </div>
    </main>
  );
}

export default FeatureUnavailablePage;
