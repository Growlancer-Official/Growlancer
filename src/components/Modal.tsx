import { ModalShell } from './ModalShell';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

/** Backward-compatible wrapper — delegates all overlay/animation/scroll-lock to ModalShell. */
export function Modal({ isOpen, onClose, children, title }: ModalProps) {
  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={title}>
      {children}
    </ModalShell>
  );
}
