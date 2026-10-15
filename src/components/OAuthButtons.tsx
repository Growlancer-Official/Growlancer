import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * OAuthButtons — the single sign-in surface for Growlancer.
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
    className: 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900/30',
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
    icon: (
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor" />
        <path d="M8 10.5V17H5.5V10.5H8Z" fill="#0A66C2" />
        <path d="M6.75 8.75C6.06 8.75 5.5 8.19 5.5 7.5C5.5 6.81 6.06 6.25 6.75 6.25C7.44 6.25 8 6.81 8 7.5C8 8.19 7.44 8.75 6.75 8.75Z" fill="#0A66C2" />
        <path d="M14.5 17H12V13.5C12 12.67 11.33 12 10.5 12C9.67 12 9 12.67 9 13.5V17H6.5V10.5H9V11.3C9.63 10.62 10.7 10.15 11.75 10.15C13.5 10.15 14.5 11.35 14.5 13V17Z" fill="#0A66C2" />
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
