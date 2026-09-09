import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Wallet, Shield, LogOut, Home, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AccountMenuProps {
  /** Route prefix for in-dashboard links ('/dashboard' or '/client'). */
  dashboardBase: '/dashboard' | '/client';
  /** Small label under the name (e.g. seller level / rating). */
  subtitle?: string;
  /** Verified badge / any other node rendered next to the name. */
  nameBadge?: React.ReactNode;
  /** Avatar URL — falls back to an initials circle. */
  avatar?: string | null;
  /** Fallback display name. */
  name?: string;
}

/**
 * AccountMenu — the header profile button's dropdown. Industry-standard
 * pattern: click to open, Esc closes, outside click closes, items are
 * keyboard-focusable, and the button gets aria-expanded/aria-haspopup so
 * screen readers announce it correctly.
 *
 * Links adapt to the role via `dashboardBase`:
 *   freelancer → Profile (/dashboard/profile), Wallet, Verification
 *   client     → Settings (/client/settings),      Payments, Verification
 */
export function AccountMenu({ dashboardBase, subtitle, nameBadge, avatar, name }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isClient = dashboardBase === '/client';
  const links = isClient
    ? [
        { icon: User, label: 'Settings', path: `${dashboardBase}/settings` },
        { icon: Wallet, label: 'Payments', path: `${dashboardBase}/payments` },
        { icon: Shield, label: 'Verification', path: `${dashboardBase}/verification` },
      ]
    : [
        { icon: User, label: 'Profile', path: `${dashboardBase}/profile` },
        { icon: Wallet, label: 'Wallet', path: `${dashboardBase}/wallet` },
        { icon: Shield, label: 'Verification', path: `${dashboardBase}/identity-verification` },
      ];

  const initial = (name || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        aria-label="Open account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-center gap-1 sm:gap-2 min-h-10 min-w-10 pl-1 pr-1 sm:pr-2 py-1 hover:bg-slate-50 rounded-full transition-all group"
      >
        {avatar ? (
          <img
            src={avatar}
            alt={name || 'User'}
            className="h-8 w-8 sm:h-9 sm:w-9 rounded-full object-cover object-top border-2 border-emerald-500/20 group-hover:border-emerald-500 transition-all"
          />
        ) : (
          <span className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-slate-100 flex items-center justify-center border-2 border-emerald-500/20 text-sm font-bold text-slate-500">
            {initial}
          </span>
        )}
        <span className="text-left hidden lg:block">
          <span className="flex items-center gap-1.5 text-sm font-bold leading-tight text-slate-900">
            <span className="truncate max-w-[140px]">{name || 'User'}</span>
            {nameBadge}
          </span>
          {subtitle && (
            <span className="flex items-center gap-1 text-[10px] text-slate-500 font-medium tracking-wide">
              {subtitle}
            </span>
          )}
        </span>
        <ChevronDown className={`hidden sm:block w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full mt-2 w-60 bg-white rounded-xl shadow-2xl border border-slate-100 py-1.5 z-[70] animate-in slide-in-from-top-2 fade-in duration-150"
        >
          {/* Header strip — identity context */}
          <div className="px-3.5 py-2 border-b border-slate-100 mb-1">
            <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
              {name || 'User'}
              {nameBadge}
            </p>
            {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
          </div>

          {links.map(({ icon: Icon, label, path }) => (
            <button
              key={path}
              role="menuitem"
              onClick={() => { setOpen(false); navigate(path); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-emerald-600 transition-colors text-left"
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}

          <div className="my-1 h-px bg-slate-100" />

          <button
            role="menuitem"
            onClick={() => { setOpen(false); navigate('/'); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-emerald-600 transition-colors text-left"
          >
            <Home className="w-4 h-4 shrink-0" />
            Homepage
          </button>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); logout(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors text-left"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
