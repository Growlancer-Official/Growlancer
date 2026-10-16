import { useEffect, useState } from 'react';
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
  /**
   * Extra sentence announced in the tooltip. Used where switching the theme
   * cannot visibly change the current screen — the admin console is dark in
   * both themes — so the control never looks broken.
   */
  hint?: string;
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

export function ThemeToggle({ className = '', variant = 'icon', hint }: ThemeToggleProps) {
  const { preference, resolved, cyclePreference } = useTheme();
  const hintSuffix = hint ? ` ${hint}` : '';

  // Hydration safety, and it is not optional: the server cannot know the
  // visitor's saved preference, so a marker that renders `<Moon>` for a
  // dark-mode visitor hydrated a DIFFERENT tree than the server produced and
  // React threw error #418 on every dark-mode page load (measured on the built
  // site). Until mounted, render exactly what the server rendered — the
  // system/neutral state — then swap to the real one a frame later.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const shown = mounted ? preference : 'system';

  const Icon = shown === 'system' ? MonitorSmartphone : resolved === 'dark' ? Moon : Sun;

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
      aria-label={`${LABELS[shown]} active. ${NEXT_LABEL[shown]}.${hintSuffix}`}
      title={`${LABELS[shown]} — ${NEXT_LABEL[shown]}.${hintSuffix}`}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      {variant === 'pill' && (
        <span className="text-xs font-semibold capitalize hidden sm:inline">{shown}</span>
      )}
    </button>
  );
}
