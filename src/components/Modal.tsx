import { ModalShell } from './ModalShell';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  /** Show the theme-aware brand wordmark above the title (auth modals). */
  brand?: boolean;
}

/** Backward-compatible wrapper — delegates all overlay/animation/scroll-lock to ModalShell. */
export function Modal({ isOpen, onClose, children, title, brand }: ModalProps) {
  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={title} brand={brand}>
      {children}
    </ModalShell>
  );
}
