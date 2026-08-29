import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
 * tooltip. Uses a React portal + fixed positioning so the tooltip is never
 * clipped by overflow-hidden parents or sidebar boundaries.
 */
export function InfoTip({ text, title, align = 'right', className = '', tone = 'slate' }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const calcPosition = useCallback(() => {
    if (!iconRef.current) return;
    const rect = iconRef.current.getBoundingClientRect();
    const tooltipW = 240; // w-60 = 15rem = 240px
    const gap = 6;

    let left: number;
    if (align === 'left') {
      left = rect.left;
    } else if (align === 'center') {
      left = rect.left + rect.width / 2 - tooltipW / 2;
    } else {
      // right — but clamp to viewport
      left = rect.right - tooltipW;
    }

    // Clamp horizontal to viewport
    const vw = window.innerWidth;
    if (left < 8) left = 8;
    if (left + tooltipW > vw - 8) left = vw - tooltipW - 8;

    // Position below the icon
    let top = rect.bottom + gap;

    // If tooltip would overflow viewport bottom, show above
    const tooltipH = title ? 120 : 80;
    if (top + tooltipH > window.innerHeight - 8) {
      top = rect.top - gap - tooltipH;
    }

    setPos({ top, left });
  }, [align]);

  useEffect(() => {
    if (open) {
      calcPosition();
      window.addEventListener('scroll', calcPosition, true);
      window.addEventListener('resize', calcPosition);
      return () => {
        window.removeEventListener('scroll', calcPosition, true);
        window.removeEventListener('resize', calcPosition);
      };
    }
  }, [open, calcPosition]);

  const toneClass =
    tone === 'emerald' ? 'text-emerald-500 hover:text-emerald-700' :
    tone === 'amber' ? 'text-amber-500 hover:text-amber-700' :
    'text-slate-400 hover:text-slate-600';

  return (
    <span
      ref={iconRef}
      className={`relative inline-flex items-center align-middle ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <Info
        className={`w-4 h-4 cursor-help transition-colors duration-150 ${toneClass}`}
        aria-hidden="true"
      />
      {open && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className="fixed z-[9999] w-60 rounded-xl bg-slate-900 text-white shadow-2xl border border-slate-700/50 animate-in fade-in duration-150"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {title && (
            <span className="block px-3 pt-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
              {title}
            </span>
          )}
          <span className="block px-3 py-2 text-xs leading-relaxed font-normal text-slate-100">
            {text}
          </span>
        </div>,
        document.body
      )}
    </span>
  );
}
