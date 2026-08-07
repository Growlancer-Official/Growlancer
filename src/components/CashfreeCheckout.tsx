import { useState, useCallback, useEffect } from 'react';
import {
  CheckCircle,
  CreditCard,
  IndianRupee,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { cashfreeService, type CashfreeOrderRequest } from '../lib/cashfree';

/** Currency-aware formatting (Cashfree supports INR, USD, etc.). */
function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

interface CashfreeCheckoutProps {
  orderData: CashfreeOrderRequest;
  onSuccess?: (orderId: string, paymentData: any) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
  buttonText?: string;
  className?: string;
}

export function CashfreeCheckout({
  orderData,
  onSuccess,
  onCancel,
  onError,
  buttonText = 'Pay with Cashfree',
  className = '',
}: CashfreeCheckoutProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'creating' | 'redirecting' | 'verifying' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // ─── Redirect-return recovery ─────────────────────────────────────────────
  // The Cashfree drop-in redirects the browser away (redirectTarget '_self').
  // When the user returns to this page, verify the pending order left in
  // sessionStorage by the previous attempt.
  useEffect(() => {
    const pending = cashfreeService.getPendingOrder();
    if (!pending) return;

    let cancelled = false;
    setStatus('verifying');
    setIsLoading(true);
    cashfreeService
      .verifyPendingOrder()
      .then((res) => {
        if (cancelled) return;
        if (res.verified && res.data) {
          setStatus('success');
          onSuccess?.(res.data.order.id, res.data);
        } else {
          setStatus('error');
          const msg = res.error || 'Payment could not be verified. Please check your payments page.';
          setError(msg);
          onError?.(new Error(msg));
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus('error');
        const msg = e instanceof Error ? e.message : 'Payment verification failed';
        setError(msg);
        onError?.(e instanceof Error ? e : new Error(msg));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback(async () => {
    setIsLoading(true);
    setStatus('creating');
    setError(null);

    try {
      // 1. Create order via edge function (amount recomputed server-side).
      //    Inject the current page as the return_url so the Cashfree hosted
      //    checkout bounces back to the exact SPA route.
      const orderDataWithReturn: CashfreeOrderRequest = {
        ...orderData,
        metadata: {
          ...(orderData.metadata || {}),
          return_url: typeof window !== 'undefined' ? window.location.href : undefined,
        },
      };

      const { order, payment_session_id } = await cashfreeService.createOrder(orderDataWithReturn);
      setStatus('redirecting');

      // 2. Remember the order so the return trip can verify it.
      cashfreeService.setPendingOrder(order.cashfree_order_id);

      // 3. Open the Cashfree hosted drop-in checkout (redirects the browser).
      await cashfreeService.openCheckout(payment_session_id);
      // If checkout() resolves without redirecting (e.g. in an iframe context),
      // verify right away.
      const verifyResult = await cashfreeService.verifyPendingOrder();
      if (verifyResult.verified && verifyResult.data) {
        setStatus('success');
        onSuccess?.(verifyResult.data.order.id, verifyResult.data);
      }
    } catch (err) {
      cashfreeService.clearPendingOrder();
      setStatus('error');
      const msg = err instanceof Error ? err.message : 'Failed to initialize Cashfree payment';
      setError(msg);
      onError?.(err instanceof Error ? err : new Error(msg));
      setIsLoading(false);
    }
  }, [orderData, onSuccess, onError]);

  const handleCancel = useCallback(() => {
    cashfreeService.clearPendingOrder();
    setStatus('idle');
    setError(null);
    onCancel?.();
  }, [onCancel]);

  // Success state
  if (status === 'success') {
    return (
      <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-3 rounded-lg">
        <CheckCircle className="w-5 h-5" />
        <span className="font-medium">Payment successful!</span>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          <XCircle className="w-5 h-5" />
          <span className="font-medium">{error || 'Payment failed'}</span>
        </div>
        <button
          onClick={handleCancel}
          className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Processing states
  if (status === 'creating' || status === 'redirecting' || status === 'verifying') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-6">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-slate-600 font-medium">
          {status === 'creating'
            ? 'Preparing payment...'
            : status === 'redirecting'
            ? 'Taking you to secure checkout...'
            : 'Verifying payment...'}
        </span>
        {status === 'redirecting' && (
          <p className="text-xs text-slate-400">You will be redirected to the Cashfree secure payment page.</p>
        )}
      </div>
    );
  }

  // Idle state - show payment button
  return (
    <div className={`space-y-4 ${className}`}>
      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600">Total Amount</p>
            <p className="text-2xl font-bold text-slate-900">
              {formatMoney(orderData.amount, orderData.currency || 'INR')}
            </p>
          </div>
          <CreditCard className="w-8 h-8 text-emerald-600" />
        </div>
      </div>

      <button
        onClick={handleClick}
        disabled={isLoading}
        className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-3"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <IndianRupee className="w-5 h-5" />
            {buttonText}
          </>
        )}
      </button>

      <p className="text-xs text-slate-500 text-center flex items-center justify-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        Secure payment via Cashfree. Pay with UPI, Credit/Debit Card, Net Banking, or Wallet.
      </p>
    </div>
  );
}
