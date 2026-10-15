import { Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/**
 * Compact theme switch: light → dark → system.
 *
 * One button instead of three keeps the public header and both dashboard
 * headers uncluttered; the current state is always visible in the icon and
 * announced to screen readers via aria-label + title.
 */
interface ThemeToggleProps {
  className?: string;
  /** 'pill' matches the dashboard headers, 'icon' the public nav. */
  variant?: 'icon' | 'pill';
}

const LABELS = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'System theme',
} as const;

const NEXT_LABEL = {
  light: 'Switch to dark theme',
  dark: 'Switch to system theme',
  system: 'Switch to light theme',
} as const;

export function ThemeToggle({ className = '', variant = 'icon' }: ThemeToggleProps) {
  const { preference, resolved, cyclePreference } = useTheme();

  const Icon = preference === 'system' ? MonitorSmartphone : resolved === 'dark' ? Moon : Sun;

  const base =
    'inline-flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40';
  const shape =
    variant === 'pill'
      ? 'h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      : 'h-10 w-10 rounded-lg ring-1 ring-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900';

  return (
    <button
      type="button"
      onClick={cyclePreference}
      className={`${base} ${shape} ${className}`}
      aria-label={`${LABELS[preference]} active. ${NEXT_LABEL[preference]}`}
      title={`${LABELS[preference]} — ${NEXT_LABEL[preference]}`}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      {variant === 'pill' && (
        <span className="text-xs font-semibold capitalize hidden sm:inline">{preference}</span>
      )}
    </button>
  );
}
