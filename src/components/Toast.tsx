import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Container,
  Info,
  Loader2,
  X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  success: (title: string, message?: string, duration?: number) => string;
  error: (title: string, message?: string, duration?: number) => string;
  warning: (title: string, message?: string, duration?: number) => string;
  info: (title: string, message?: string, duration?: number) => string;
  loading: (title: string, message?: string) => string;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastCounter = 0;

export function ToastProvider({ children, maxToasts = 5 }: { children: ReactNode; maxToasts?: number }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>): string => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const duration = toast.type === 'loading' ? Infinity : (toast.duration ?? 4000);

    setToasts((prev) => {
      const next = [...prev, { ...toast, id }];
      return next.slice(-maxToasts);
    });

    if (duration < Infinity) {
      const timer = setTimeout(() => {
        removeToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [maxToasts, removeToast]);

  const success = useCallback((title: string, message?: string, duration = 4000) =>
    addToast({ type: 'success', title, message, duration }), [addToast]);
  const error = useCallback((title: string, message?: string, duration = 6000) =>
    addToast({ type: 'error', title, message, duration }), [addToast]);
  const warning = useCallback((title: string, message?: string, duration = 5000) =>
    addToast({ type: 'warning', title, message, duration }), [addToast]);
  const info = useCallback((title: string, message?: string, duration = 4000) =>
    addToast({ type: 'info', title, message, duration }), [addToast]);
  const loading = useCallback((title: string, message?: string) =>
    addToast({ type: 'loading', title, message, duration: Infinity }), [addToast]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info, loading }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  const iconMap: Record<ToastType, ReactNode> = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
    loading: <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />,
  };

  const borderMap: Record<ToastType, string> = {
    success: 'border-l-emerald-500',
    error: 'border-l-red-500',
    warning: 'border-l-amber-500',
    info: 'border-l-blue-500',
    loading: 'border-l-slate-400',
  };

  return (
    <div
      className={`pointer-events-auto max-w-sm w-full bg-white rounded-xl shadow-2xl border border-slate-200 border-l-4 ${borderMap[toast.type]} overflow-hidden transition-all duration-200 ${
        isVisible && !isExiting
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-4 scale-95'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {iconMap[toast.type]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
            {toast.message && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{toast.message}</p>
            )}
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="mt-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Progress bar for auto-dismiss toasts */}
      {toast.duration && toast.duration < Infinity && (
        <div className="h-0.5 bg-slate-100">
          <div
            className="h-full bg-emerald-500 rounded-r-full animate-shrink"
            style={{ animationDuration: `${toast.duration}ms`, animationTimingFunction: 'linear' }}
          />
        </div>
      )}
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
