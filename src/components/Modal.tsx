import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export function Modal({ isOpen, onClose, children, title }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      // Always reset body overflow when modal is closed
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-[500px] sm:max-w-[550px] lg:max-w-[600px] max-h-[90vh] flex flex-col bg-white rounded-[40px] shadow-2xl shadow-black/20 border border-white/20 animate-scale-in overflow-hidden">
        {/* Gradient Border Effect */}
        <div className="absolute inset-0 rounded-[40px] pointer-events-none">
          <div className="absolute inset-0 rounded-[40px] bg-gradient-to-br from-emerald-500/10 via-transparent to-orange-500/10 opacity-50"></div>
        </div>

        {/* Close Button - Fixed Position */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-20 p-2.5 rounded-full bg-white/90 hover:bg-white shadow-lg hover:shadow-xl border border-slate-200/50 transition-all duration-200 hover:scale-105"
          aria-label="Close modal"
        >
          <X className="w-5 h-5 text-slate-600 hover:text-slate-900 transition-colors" />
        </button>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="p-3 sm:p-5 lg:p-7 pt-8 pb-8 pr-8">
            {title && (
              <div className="mb-3 sm:mb-4">
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {title}
                </h1>
              </div>
            )}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
