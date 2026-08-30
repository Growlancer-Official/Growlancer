/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Button — single source of truth for all buttons in Growlancer.
 *
 * Variants:
 *   • primary   — emerald gradient (main CTAs: Submit, Pay, Approve)
 *   • secondary — slate outline (Cancel, Back, secondary actions)
 *   • danger    — red solid (destructive: Delete, Remove, Reject)
 *   • ghost     — transparent (icon buttons, link-like actions)
 *
 * Sizes:
 *   • sm  — compact (inline badges, table actions)
 *   • md  — default (form buttons, card actions)
 *   • lg  — prominent (hero CTAs, checkout buttons)
 *
 * Usage:
 *   <Button variant="primary" size="lg" onClick={submit}>Submit</Button>
 *   <Button variant="danger" loading={deleting}>Delete</Button>
 *   <Button variant="ghost" size="sm" icon={<X className="w-4 h-4" />} />
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  /** Full-width button */
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md focus:ring-emerald-500/30',
  secondary:
    'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 focus:ring-slate-500/20',
  danger:
    'bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-md focus:ring-red-500/30',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-500/20',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-sm rounded-xl gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      fullWidth = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center font-semibold
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-1
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
          </>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
