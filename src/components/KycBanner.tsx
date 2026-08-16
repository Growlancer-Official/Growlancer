import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// ── KYC Nudge Banner ─────────────────────────────────────────────────────────
// Friendly, professional, DISMISSIBLE — never a hard gate. Shown in both
// dashboards while the user's identity is not verified, with the benefits and
// a clear CTA. Critical money actions (orders, escrow funding, withdrawals)
// still require verification at the point of action, but browsing the
// dashboard is always open so nobody feels locked out.
export function KycBanner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<'loading' | 'verified' | 'pending' | 'needed' | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const key = `gw_kyc_dismissed_${user.id}`;
    setDismissed(sessionStorage.getItem(key) === '1');

    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('verification_status, role')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (data?.role === 'admin') setStatus('verified');
        else if (data?.verification_status === 'verified') setStatus('verified');
        else if (data?.verification_status === 'pending') setStatus('pending');
        else setStatus('needed');
      } catch {
        if (!cancelled) setStatus(null); // fail silent — never block on a banner
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  if (dismissed || status === 'verified' || status === null || status === 'loading') return null;

  const isClient = user?.role === 'client';
  const kycPath = isClient ? '/client/verification' : '/dashboard/identity-verification';

  // Pending — softer note: review in progress, no CTA to resubmit.
  if (status === 'pending') {
    return (
      <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
        <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">Identity verification in review</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Your documents are being checked — usually takes a few minutes. Your status updates here in real time.
          </p>
        </div>
        <button
          onClick={() => { setDismissed(true); sessionStorage.setItem(`gw_kyc_dismissed_${user?.id}`, '1'); }}
          className="text-amber-400 hover:text-amber-600 transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Needed — friendly encouragement with benefits.
  return (
    <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
      <div className="flex items-start gap-3 flex-1 min-w-[220px]">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">Verify your identity to unlock full access</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
            {isClient
              ? 'Place orders, fund escrow and hire with confidence. Verification takes under a minute — escrow payments and withdrawals unlock once verified.'
              : 'Receive escrow payouts, build services and win more work with a verified badge. Verification takes under a minute — your documents are checked instantly.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          to={kycPath}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <ShieldCheck className="w-4 h-4" />
          Verify Now
        </Link>
        <button
          onClick={() => { setDismissed(true); sessionStorage.setItem(`gw_kyc_dismissed_${user?.id}`, '1'); }}
          className="h-9 w-9 rounded-xl border border-emerald-200 bg-white text-slate-500 hover:text-slate-700 transition-colors flex items-center justify-center flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
