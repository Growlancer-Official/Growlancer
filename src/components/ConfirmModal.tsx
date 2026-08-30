import { useEffect, useState } from 'react';
import { AlertTriangle, Info, XCircle, Loader2 } from 'lucide-react';
import { ModalShell } from './ModalShell';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmModalProps) {
  const [internalLoading, setInternalLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) setInternalLoading(false);
  }, [isOpen]);

  const handleConfirm = async () => {
    setInternalLoading(true);
    try {
      await onConfirm();
    } finally {
      setInternalLoading(false);
    }
  };

  const isLoading = loading || internalLoading;

  const variantStyles = {
    danger: {
      iconBg: 'bg-red-100 text-red-600',
      Icon: XCircle,
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    warning: {
      iconBg: 'bg-amber-100 text-amber-600',
      Icon: AlertTriangle,
      button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
    },
    info: {
      iconBg: 'bg-blue-100 text-blue-600',
      Icon: Info,
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    },
  };

  const styles = variantStyles[variant];
  const { Icon } = styles;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={isLoading ? () => {} : onClose}
      closeOnBackdrop={!isLoading}
      closeOnEscape={!isLoading}
      maxWidth="max-w-md"
    >
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${styles.iconBg} mb-4`}>
        <Icon className="w-7 h-7" />
      </div>

      <h2 className="font-display text-lg font-bold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-600 mb-6 leading-relaxed text-sm">{message}</p>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="flex-1 px-6 py-3 text-slate-700 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className={`flex-1 px-6 py-3 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 ${styles.button}`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            confirmLabel
          )}
        </button>
      </div>
    </ModalShell>
  );
}
