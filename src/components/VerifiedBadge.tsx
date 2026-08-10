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
 */
export function VerifiedBadge({ size = 'sm', showLabel = false, className = '', tone = 'green' }: VerifiedBadgeProps) {
  const sizes = {
    xs: { icon: 'w-3 h-3', pill: 'text-[9px] px-1.5 py-0.5 gap-0.5', label: 'text-[9px]' },
    sm: { icon: 'w-3.5 h-3.5', pill: 'text-[10px] px-2 py-0.5 gap-1', label: 'text-[10px]' },
    md: { icon: 'w-4 h-4', pill: 'text-[11px] px-2.5 py-1 gap-1', label: 'text-[11px]' },
  }[size];

  const gradient = tone === 'blue'
    ? 'from-blue-500 to-blue-700'
    : 'from-emerald-500 to-green-600';

  const base = `inline-flex items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-white font-extrabold uppercase tracking-wider shadow-sm ${sizes.pill} ${className}`;

  return (
    <span
      className={base}
      title={tone === 'blue' ? 'Verified Client' : 'KYC Verified'}
      aria-label={tone === 'blue' ? 'Verified Client' : 'KYC Verified'}
    >
      <BadgeCheck className={`${sizes.icon} fill-white/20`} strokeWidth={2.5} />
      {showLabel && <span className={sizes.label}>{tone === 'blue' ? 'CLIENT' : 'VERIFIED'}</span>}
    </span>
  );
}

export default VerifiedBadge;
