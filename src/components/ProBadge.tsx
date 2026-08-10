import { Crown } from 'lucide-react';

interface ProBadgeProps {
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/**
 * Professional PRO badge for Growlancer Pro members.
 * Always shows a premium "PRO" text pill (not a blue check icon) so it reads
 * clearly next to the green KYC verified badge — no more two identical check
 * circles. Hovering reveals a polished tooltip ("Pro Freelancer").
 */
export function ProBadge({ size = 'sm', className = '' }: ProBadgeProps) {
  const sizes = {
    xs: { pill: 'text-[8px] px-1.5 py-px gap-0.5', icon: 'w-2.5 h-2.5', tooltip: 'text-[10px] px-2 py-1' },
    sm: { pill: 'text-[9px] px-2 py-0.5 gap-1', icon: 'w-3 h-3', tooltip: 'text-[10px] px-2.5 py-1' },
    md: { pill: 'text-[10px] px-2.5 py-1 gap-1', icon: 'w-3.5 h-3.5', tooltip: 'text-[11px] px-3 py-1.5' },
  }[size];

  const base = `relative group inline-flex items-center rounded-md bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white font-extrabold uppercase tracking-wider shadow-sm ring-1 ring-blue-900/30 ${sizes.pill} ${className}`;

  return (
    <span
      className={base}
      role="img"
      aria-label="Growlancer Pro Member"
      title="Pro Freelancer"
    >
      <Crown className={`${sizes.icon} fill-amber-300/90 text-amber-300`} strokeWidth={2} />
      <span className="leading-none">PRO</span>

      {/* Polished hover tooltip */}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 -top-1 -translate-x-1/2 -translate-y-full z-50 whitespace-nowrap rounded-lg bg-slate-900 text-white font-semibold normal-case tracking-normal shadow-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${sizes.tooltip}`}
      >
        Pro Freelancer
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
      </span>
    </span>
  );
}

export default ProBadge;
