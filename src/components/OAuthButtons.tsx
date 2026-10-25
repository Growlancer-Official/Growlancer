import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * OAuthButtons — the single sign-in surface for Growlanzo.
 *
 * GitHub and LinkedIn are the only auth methods: no email/password form
 * anywhere in the product. Both providers are configured in Supabase
 * (`github`, `linkedin_oidc`), and the session + profile are created by the
 * existing OAuth callback flow (AuthCallbackPage + AuthContext).
 *
 * The component owns the spinner/disabled state and delegates the actual
 * `signInWithOAuth` call to the parent, which knows the context (signup also
 * has to persist the chosen role before leaving the page).
 */
export type OAuthProvider = 'github' | 'linkedin_oidc';

interface OAuthButtonsProps {
  onSelect: (provider: OAuthProvider) => Promise<{ success: boolean; error?: string }>;
  onError?: (message: string) => void;
  disabled?: boolean;
}

const PROVIDERS: {
  id: OAuthProvider;
  label: string;
  pendingLabel: string;
  className: string;
  icon: ReactNode;
}[] = [
  {
    id: 'github',
    label: 'Continue with GitHub',
    pendingLabel: 'Connecting to GitHub…',
    // GitHub's own dark-mode treatment: the navy button is the modal surface in
    // dark mode (both remap to the same slate), so it flips to white-on-dark.
    className:
      'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900/30 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 dark:focus-visible:ring-white/40',
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 2C6.48 2 2 6.58 2 12.22c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05.8-.23 1.65-.34 2.5-.34.85 0 1.7.11 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.48A10.25 10.25 0 0022 12.22C22 6.58 17.52 2 12 2z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    id: 'linkedin_oidc',
    label: 'Continue with LinkedIn',
    pendingLabel: 'Connecting to LinkedIn…',
    className: 'bg-[#0A66C2] text-white hover:bg-[#004182] focus-visible:ring-[#0A66C2]/30',
    // Standard white "in" glyph on the brand-blue button. The previous mark
    // drew the letters in #0A66C2 on a #0A66C2 button, so the icon rendered as
    // a blank square — invisible at a glance, and definitely not a LinkedIn
    // logo. currentColor is white here, so the glyph reads at 20px.
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13Zm1.78 13.02H3.55V9h3.57v11.45Z" />
      </svg>
    ),
  },
];

export function OAuthButtons({ onSelect, onError, disabled = false }: OAuthButtonsProps) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  const handleClick = async (provider: OAuthProvider) => {
    if (pending || disabled) return;
    setPending(provider);
    let result: { success: boolean; error?: string };
    try {
      result = await onSelect(provider);
    } catch (err) {
      result = {
        success: false,
        error: err instanceof Error ? err.message : 'Sign-in could not start. Please try again.',
      };
    }
    if (!result.success) {
      // A success means the browser is navigating to the provider — keep the
      // spinner until we leave. Only failures reset the buttons.
      setPending(null);
      onError?.(result.error || 'Sign-in could not start. Please try again.');
    }
  };

  return (
    <div className="space-y-3">
      {PROVIDERS.map(({ id, label, pendingLabel, className, icon }) => {
        const isPending = pending === id;
        return (
          <button
            key={id}
            type="button"
            disabled={pending !== null || disabled}
            onClick={() => handleClick(id)}
            aria-busy={isPending}
            className={`w-full h-12 flex items-center justify-center gap-3 rounded-xl text-sm font-semibold shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
          >
            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
            {isPending ? pendingLabel : label}
          </button>
        );
      })}
    </div>
  );
}
