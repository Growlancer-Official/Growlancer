/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ModalShell — single source of truth for all modal overlays.
 *
 * Every modal in the codebase (Modal, ConfirmModal, ReviewModal, AIGenerateModal,
 * LoginModal, SignupModal) MUST use this shell. It centralises:
 *   • z-index (Z_MODAL = 100 — single constant, no magic numbers)
 *   • backdrop (consistent bg-black/60 + backdrop-blur-md)
 *   • close-on-backdrop-click (opt-out via `closeOnBackdrop`)
 *   • close-on-escape (opt-out via `closeOnEscape`)
 *   • scroll lock on body
 *   • entry/exit animation (animate-fade-in + animate-scale-in)
 *
 * Props follow a flat, explicit interface — no inheritance chains.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

/** Single z-index constant for ALL modals. Change here → propagates everywhere. */
export const Z_MODAL = 100;

interface ModalShellProps {
  /** Controls mount/unmount. */
  isOpen: boolean;
  /** Called when the user requests close (backdrop, Escape, or X button). */
  onClose: () => void;
  /** Modal body. */
  children: React.ReactNode;
  /** Optional title rendered at the top of the scrollable area. */
  title?: string;
  /** Show the × close button (default true). Set false for irreversible actions. */
  showClose?: boolean;
  /** Close when clicking the backdrop overlay (default true). */
  closeOnBackdrop?: boolean;
  /** Close on Escape key press (default true). */
  closeOnEscape?: boolean;
  /** Max-width constraint (default max-w-[500px]). */
  maxWidth?: string;
  /** Additional class names for the content wrapper. */
  className?: string;
}

export function ModalShell({
  isOpen,
  onClose,
  children,
  title,
  showClose = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  maxWidth = 'max-w-[500px] sm:max-w-[550px] lg:max-w-[600px]',
  className = '',
}: ModalShellProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        onCloseRef.current();
      }
    },
    [closeOnEscape],
  );

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-3 lg:p-4"
      style={{ zIndex: Z_MODAL }}
    >
      {/* ── Backdrop ── */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in"
        onClick={closeOnBackdrop ? onCloseRef.current : undefined}
        aria-hidden="true"
      />

      {/* ── Content wrapper ── */}
      <div
        className={`relative w-full ${maxWidth} max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl shadow-black/20 border border-slate-200/60 animate-scale-in overflow-hidden ${className}`}
      >
        {/* Close button */}
        {showClose && (
          <button
            onClick={onCloseRef.current}
            className="absolute top-3 right-3 z-20 p-2 rounded-full bg-white/90 hover:bg-white shadow-md hover:shadow-lg border border-slate-200/50 transition-all duration-200 hover:scale-105"
            aria-label="Close modal"
          >
            <X className="w-4 h-4 text-slate-600 hover:text-slate-900 transition-colors" />
          </button>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="p-5 sm:p-6 pt-7 pb-7">
            {title && (
              <div className="mb-4">
                <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                  {title}
                </h2>
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
