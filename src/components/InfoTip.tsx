import { useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTipProps {
  /** The explanation shown on hover — concise, plain language, no jargon. */
  text: string;
  /** Optional heading inside the tooltip. */
  title?: string;
  /** Which edge the tooltip anchors to (defaults to right so it rarely clips). */
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** Icon color tone (default slate — fits headers/labels everywhere). */
  tone?: 'slate' | 'emerald' | 'amber';
}

/**
 * InfoTip — a small ⓘ icon that reveals a polished, industry-standard hover
 * tooltip. Use it next to any label, stat or button whose meaning isn't
 * 100% obvious so freelancers and clients never have to guess.
 *
 * Implementation notes:
 * - Plain CSS hover (group-hover) — no portal needed, z-50 keeps it on top.
 * - The tooltip is absolutely positioned so it can sit beside inline text
 *   without breaking layout; it never intercepts clicks.
 */
export function InfoTip({ text, title, align = 'right', className = '', tone = 'slate' }: InfoTipProps) {
  const [open, setOpen] = useState(false);

  const alignClass =
    align === 'left' ? 'left-0' :
    align === 'center' ? 'left-1/2 -translate-x-1/2' :
    'right-0';

  const toneClass =
    tone === 'emerald' ? 'text-emerald-500 hover:text-emerald-700' :
    tone === 'amber' ? 'text-amber-500 hover:text-amber-700' :
    'text-slate-400 hover:text-slate-600';

  return (
    <span
      className={`relative inline-flex items-center group align-middle ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <Info
        className={`w-4 h-4 cursor-help transition-colors duration-150 ${toneClass}`}
        aria-hidden="true"
      />
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full mt-1.5 z-50 w-60 rounded-xl bg-slate-900 text-white shadow-xl transition-all duration-150 ${
          open ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-0.5'
        } ${alignClass}`}
      >
        {title && (
          <span className="block px-3 pt-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
            {title}
          </span>
        )}
        <span className="block px-3 py-2 text-xs leading-relaxed font-normal text-slate-100">
          {text}
        </span>
      </span>
    </span>
  );
}
