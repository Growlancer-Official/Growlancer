import { BadgeCheck } from 'lucide-react';

interface ProBadgeProps {
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

/**
 * Instagram-style verified PRO badge for Growlancer Pro members.
 * Blue circular check + "PRO" label — used across the dashboard,
 * public profile and profile editor for real-time pro visibility.
 */
export function ProBadge({ size = 'sm', showLabel = false, className = '' }: ProBadgeProps) {
  const sizes = {
    xs: { icon: 'w-3 h-3', pill: 'text-[9px] px-1.5 py-0.5 gap-0.5', label: 'text-[9px]' },
    sm: { icon: 'w-3.5 h-3.5', pill: 'text-[10px] px-2 py-0.5 gap-1', label: 'text-[10px]' },
    md: { icon: 'w-4 h-4', pill: 'text-[11px] px-2.5 py-1 gap-1', label: 'text-[11px]' },
  }[size];

  const base = `inline-flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white font-extrabold uppercase tracking-wider shadow-sm ${sizes.pill} ${className}`;

  return (
    <span
      className={base}
      title="Growlancer Pro Member"
      aria-label="Growlancer Pro Member"
    >
      <BadgeCheck className={`${sizes.icon} fill-white/20`} strokeWidth={2.5} />
      {showLabel && <span className={sizes.label}>PRO</span>}
    </span>
  );
}

export default ProBadge;
