import { Info, CheckCircle2, Lightbulb, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Tone = 'info' | 'success' | 'tip' | 'protection' | 'warning';

interface TipNoteProps {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /** Compact one-liner (no heading, smaller padding). */
  compact?: boolean;
}

const TONE_MAP: Record<Tone, { icon: LucideIcon; wrap: string; iconWrap: string; titleClass: string; textClass: string }> = {
  info: {
    icon: Info,
    wrap: 'bg-emerald-50 border-emerald-200',
    iconWrap: 'bg-emerald-100 text-emerald-600',
    titleClass: 'text-emerald-900',
    textClass: 'text-emerald-700',
  },
  success: {
    icon: CheckCircle2,
    wrap: 'bg-emerald-50 border-emerald-200',
    iconWrap: 'bg-emerald-100 text-emerald-600',
    titleClass: 'text-emerald-900',
    textClass: 'text-emerald-700',
  },
  tip: {
    icon: Lightbulb,
    wrap: 'bg-amber-50 border-amber-200',
    iconWrap: 'bg-amber-100 text-amber-600',
    titleClass: 'text-amber-900',
    textClass: 'text-amber-800',
  },
  protection: {
    icon: ShieldCheck,
    wrap: 'bg-emerald-50 border-emerald-200',
    iconWrap: 'bg-emerald-100 text-emerald-600',
    titleClass: 'text-emerald-900',
    textClass: 'text-emerald-700',
  },
  warning: {
    icon: AlertTriangle,
    wrap: 'bg-red-50 border-red-200',
    iconWrap: 'bg-red-100 text-red-600',
    titleClass: 'text-red-900',
    textClass: 'text-red-700',
  },
};

/**
 * TipNote — a consistent, professional inline note/tip box used across the
 * app so both freelancers and clients get the same clear, friendly guidance
 * everywhere (pricing, escrow, payments, verification, policies, etc.).
 *
 * Keep the message plain-language: what it means, what the user should do,
 * and why it protects them. No jargon.
 */
export function TipNote({ tone = 'info', title, children, className = '', compact = false }: TipNoteProps) {
  const t = TONE_MAP[tone];
  const Icon = t.icon;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border ${t.wrap} ${
        compact ? 'p-3' : 'p-4'
      } ${className}`}
    >
      <div className={`p-1.5 rounded-lg shrink-0 ${t.iconWrap}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        {title && (
          <p className={`text-sm font-semibold ${t.titleClass} ${compact ? 'mb-0.5' : 'mb-1'}`}>
            {title}
          </p>
        )}
        <div className={`text-xs leading-relaxed ${t.textClass}`}>{children}</div>
      </div>
    </div>
  );
}
