import { useId } from 'react';

/**
 * Grow Coin — the platform's own currency mark.
 *
 * Deliberately NOT a lucide coin or the rupee symbol: a golden coin with the
 * Growlancer "G" embossed, so a screenshot of the coin is recognisably ours.
 * The gradient ids are unique per instance (useId) — two copies of an SVG with
 * the same hard-coded gradient id make the second one render black in Safari.
 */
interface GrowCoinIconProps {
  className?: string;
  /** Diameter in px. Defaults to 24 (UI badge size). */
  size?: number;
  /** Turn off the embossed highlight for tiny sizes. */
  flat?: boolean;
  title?: string;
}

export function GrowCoinIcon({ className = '', size = 24, flat = false, title }: GrowCoinIconProps) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const face = `gc-face-${id}`;
  const rim = `gc-rim-${id}`;
  const shine = `gc-shine-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={face} cx="34%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#FFF4C2" />
          <stop offset="42%" stopColor="#F4E285" />
          <stop offset="78%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#A67C1F" />
        </radialGradient>
        <linearGradient id={rim} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFE9A8" />
          <stop offset="50%" stopColor="#C79A2E" />
          <stop offset="100%" stopColor="#8C6512" />
        </linearGradient>
        <linearGradient id={shine} x1="8%" y1="0%" x2="64%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Outer rim */}
      <circle cx="24" cy="24" r="22.4" fill={`url(#${rim})`} />
      <circle cx="24" cy="24" r="20.4" fill={`url(#${face})`} />

      {/* Bevel + inner ring */}
      <circle cx="24" cy="24" r="17.6" fill="none" stroke="#7A5A10" strokeOpacity="0.35" strokeWidth="1.1" />
      <circle cx="24" cy="24" r="19.2" fill="none" stroke="#FFF7D6" strokeOpacity="0.55" strokeWidth="0.8" />

      {/* Embossed brand G, cut from the coin face */}
      <g>
        <path
          d="M30.7 17.6c-1.7-1.9-4-2.9-6.6-2.9-5 0-8.8 3.9-8.8 9.3 0 5.3 3.7 9.2 8.9 9.2 2.5 0 4.7-.8 6.3-2.3v-6.6h-6.6v-3.5h10.4v11.8c-2.4 2.7-5.9 4.3-10.2 4.3-7.5 0-12.8-5.5-12.8-12.9S16.6 11.1 24.1 11.1c3.9 0 7.2 1.3 9.6 3.7l-3 2.8z"
          fill="#7A5A10"
          fillOpacity="0.55"
          transform="translate(0.55 0.65)"
        />
        <path
          d="M30.7 17.6c-1.7-1.9-4-2.9-6.6-2.9-5 0-8.8 3.9-8.8 9.3 0 5.3 3.7 9.2 8.9 9.2 2.5 0 4.7-.8 6.3-2.3v-6.6h-6.6v-3.5h10.4v11.8c-2.4 2.7-5.9 4.3-10.2 4.3-7.5 0-12.8-5.5-12.8-12.9S16.6 11.1 24.1 11.1c3.9 0 7.2 1.3 9.6 3.7l-3 2.8z"
          fill="#FFF6D8"
        />
      </g>

      {/* Sparkle + top light */}
      {!flat && (
        <>
          <path d="M35.4 11.2l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6z" fill="#FFFDF2" fillOpacity="0.9" />
          <ellipse cx="19" cy="13.2" rx="10.5" ry="4.4" fill={`url(#${shine})`} transform="rotate(-18 19 13.2)" />
        </>
      )}

      {/* Edge highlight */}
      <circle cx="24" cy="24" r="21.2" fill="none" stroke="#FFF3C4" strokeOpacity="0.45" strokeWidth="0.9" />
    </svg>
  );
}

export default GrowCoinIcon;
