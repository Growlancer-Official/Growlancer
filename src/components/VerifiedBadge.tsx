import { BadgeCheck } from 'lucide-react';

interface VerifiedBadgeProps {
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
  /**
   * 'green' (default) for freelancer verification badge.
   * 'blue' for client verification badge.
   */
  tone?: 'green' | 'blue';
}

/**
 * Instagram-style verified badge — shown next to the name of
 * users who completed KYC verification. Color varies by role:
 * - Freelancer: GREEN (default)
 * - Client: BLUE
 *
 * Lifetime, synced everywhere (search, contracts, workspace, public profile).
 * Hovering shows a polished tooltip: "KYC Verified" / "Verified Client".
 */
export function VerifiedBadge({ size = 'sm', showLabel = false, className = '', tone = 'green' }: VerifiedBadgeProps) {
  const sizes = {
    xs: { icon: 'w-3.5 h-3.5', pill: 'text-[10px] px-1.5 py-0.5 gap-0.5', label: 'text-[10px]', tooltip: 'text-xs px-2 py-1' },
    sm: { icon: 'w-4 h-4', pill: 'text-xs px-2 py-0.5 gap-1', label: 'text-xs', tooltip: 'text-xs px-2.5 py-1' },
    md: { icon: 'w-4 h-4', pill: 'text-xs px-2.5 py-1 gap-1', label: 'text-xs', tooltip: 'text-xs px-3 py-1.5' },
  }[size];

  const gradient = tone === 'blue'
    ? 'from-emerald-500 to-emerald-700'
    : 'from-emerald-500 to-green-600';

  const label = tone === 'blue' ? 'Verified Client' : 'KYC Verified';

  const base = `relative group inline-flex items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-white font-extrabold uppercase tracking-wider shadow-sm ${sizes.pill} ${className}`;

  return (
    <span
      className={base}
      role="img"
      aria-label={label}
    >
      <BadgeCheck className={`${sizes.icon} fill-white/20`} strokeWidth={2.5} />
      {showLabel && <span className={sizes.label}>{tone === 'blue' ? 'CLIENT' : 'VERIFIED'}</span>}

      {/* Polished hover tooltip — precise: platform-level verification, not a government-issued ID */}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 -top-1 -translate-x-1/2 -translate-y-full z-50 whitespace-nowrap rounded-lg bg-slate-900 text-white font-semibold normal-case tracking-normal shadow-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${sizes.tooltip}`}
      >
        {tone === 'blue' ? 'Verified Client' : 'Verified on Growlancer'}
        <span className="block text-[10px] font-medium opacity-80 normal-case tracking-normal">platform verification · not a government-issued ID</span>
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
      </span>
    </span>
  );
}

export default VerifiedBadge;
