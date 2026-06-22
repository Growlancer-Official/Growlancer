import { useState, useCallback, useEffect } from 'react';
import { Check,
  CheckCircle,
  CreditCard,
  Loader2,
  User,
  XCircle } from 'lucide-react';
import { paypalService, PayPalOrderRequest } from '../lib/paypal';

interface PayPalCheckoutProps {
  orderData: PayPalOrderRequest;
  onSuccess?: (orderId: string, details: unknown) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
  buttonText?: string;
  className?: string;
}

export function PayPalCheckout({
  orderData,
  onSuccess,
  onCancel,
  onError,
  buttonText = 'Pay with PayPal',
  className = '',
}: PayPalCheckoutProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'creating' | 'redirecting' | 'capturing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [, setOrderId] = useState<string | null>(null);

  // Check for return from PayPal approval
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paypalOrderId = urlParams.get('token');
    const payerId = urlParams.get('PayerID');

    if (paypalOrderId && payerId) {
      // User returned from PayPal approval
      setStatus('capturing');
      setIsLoading(true);

      paypalService
        .captureOrder(paypalOrderId)
        .then((result) => {
          setStatus('success');
          setOrderId(result.order.id);
          onSuccess?.(result.order.id, result);

          // Clean up URL params
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((err) => {
          setStatus('error');
          setError(err.message || 'Payment capture failed');
          onError?.(err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [onSuccess, onError]);

  const handlePayPalClick = useCallback(async () => {
    setIsLoading(true);
    setStatus('creating');
    setError(null);

    try {
      const { order, approve_url } = await paypalService.createOrder(orderData);
      setOrderId(order.id);
      setStatus('redirecting');

      // Redirect to PayPal for approval
      window.location.href = approve_url;
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to create PayPal order');
      onError?.(err instanceof Error ? err : new Error('Failed to create order'));
      setIsLoading(false);
    }
  }, [orderData, onError]);

  const handleCancel = useCallback(() => {
    setStatus('idle');
    setError(null);
    onCancel?.();
  }, [onCancel]);

  // Render different states
  if (status === 'success') {
    return (
      <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-3 rounded-lg">
        <CheckCircle className="w-5 h-5" />
        <span className="font-medium">Payment successful!</span>
      </div>
    );
  }

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

  if (status === 'capturing') {
    return (
      <div className="flex items-center justify-center gap-3 py-4">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-slate-600 font-medium">Completing your payment...</span>
      </div>
    );
  }

  if (status === 'redirecting') {
    return (
      <div className="flex items-center justify-center gap-3 py-4">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-slate-600 font-medium">Redirecting to PayPal...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600">Total Amount</p>
            <p className="text-2xl font-bold text-slate-900">
              ${orderData.amount.toFixed(2)} {orderData.currency || 'USD'}
            </p>
          </div>
          <CreditCard className="w-8 h-8 text-blue-600" />
        </div>
      </div>

      <button
        onClick={handlePayPalClick}
        disabled={isLoading}
        className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-3"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.77.77 0 0 1 .757-.629h6.646c2.838 0 4.824.616 5.555 1.848.543.926.58 2.13.114 3.483-.684 1.954-1.977 3.379-3.748 4.144 1.007.553 1.679 1.32 2.007 2.3.327.98.258 2.173-.206 3.58-.63 1.79-1.714 3.203-3.251 4.24-1.538 1.036-3.357 1.554-5.46 1.554H7.076z" />
              <path d="M20.067 8.94c-.01.087-.026.174-.043.263-.614 3.093-2.69 4.787-5.344 4.787h-1.592c-.407 0-.753.295-.816.697l-.258 1.642-.385 2.447-.022.14a.495.495 0 0 0 .489.576h2.83c.338 0 .627-.246.68-.582l.005-.03.026-.168.33-2.1.022-.12a.676.676 0 0 1 .668-.576h.42c2.725 0 4.859-1.107 5.483-4.308.26-1.337.127-2.45-.545-3.258z" />
            </svg>
            {buttonText}
          </>
        )}
      </button>

      <p className="text-xs text-slate-500 text-center">
        You will be redirected to PayPal to complete your payment securely.
      </p>
    </div>
  );
}
