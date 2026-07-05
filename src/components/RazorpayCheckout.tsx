import { useState, useCallback } from 'react';
import {
  CheckCircle,
  CreditCard,
  IndianRupee,
  Loader2,
  Save,
  XCircle,
} from 'lucide-react';
import { razorpayService, type RazorpayOrderRequest, type RazorpayPaymentData } from '../lib/razorpay';

interface RazorpayCheckoutProps {
  orderData: RazorpayOrderRequest;
  onSuccess?: (orderId: string, paymentData: RazorpayPaymentData) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
  buttonText?: string;
  className?: string;
  /** User details for prefill */
  userInfo?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  /** Theme color for Razorpay modal */
  themeColor?: string;
}

export function RazorpayCheckout({
  orderData,
  onSuccess,
  onCancel,
  onError,
  buttonText = 'Pay with Razorpay',
  className = '',
  userInfo,
  themeColor = '#059669',
}: RazorpayCheckoutProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'creating' | 'checkout' | 'verifying' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [saveCard, setSaveCard] = useState(false);

  const handleRazorpayClick = useCallback(async () => {
    setIsLoading(true);
    setStatus('creating');
    setError(null);

    try {
      // 1. Create order via edge function
      const { order, razorpay_key_id, amount, currency } = await razorpayService.createOrder(orderData);
      setStatus('checkout');

      // 2. Open Razorpay checkout modal
      await razorpayService.openCheckout({
        key: razorpay_key_id,
        amount: Math.round(amount * 100), // Razorpay expects paise/cents
        currency: currency,
        name: 'Growlancer',
        description: orderData.description || 'Growlancer Payment',
        order_id: order.razorpay_order_id,
        prefill: {
          name: userInfo?.name || '',
          email: userInfo?.email || '',
          contact: userInfo?.contact || '',
        },
        theme: { color: themeColor },
        card: saveCard ? { save: true } : undefined,
        handler: async (response: RazorpayPaymentData) => {
          // 3. Verify payment on backend
          setStatus('verifying');
          try {
            await razorpayService.verifyPayment(response);

            // 4. If user opted to save card, capture the card token from the Razorpay response
            // The Razorpay checkout handler response includes card info when card[save] was enabled
            if (saveCard) {
              const card = (response as any).card;
              if (card?.id && card?.last4) {
                try {
                  await razorpayService.saveCard({
                    razorpay_payment_id: response.razorpay_payment_id,
                    card_id: card.id,
                    card_last_four: card.last4,
                    card_type: card.type || null,
                    card_network: card.network || null,
                    card_expiry_month: card.expiry_month?.toString() || null,
                    card_expiry_year: card.expiry_year?.toString() || null,
                    card_holder_name: card.name || null,
                  });
                } catch { /* card saving is best-effort */ }
              }
            }

            setStatus('success');
            onSuccess?.(order.id, response);
          } catch (verifyErr) {
            setStatus('error');
            const msg = verifyErr instanceof Error ? verifyErr.message : 'Payment verification failed';
            setError(msg);
            onError?.(verifyErr instanceof Error ? verifyErr : new Error(msg));
          } finally {
            setIsLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setStatus('idle');
            setIsLoading(false);
            onCancel?.();
          },
          confirm_close: true,
        },
      });
    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : 'Failed to initialize Razorpay payment';
      setError(msg);
      onError?.(err instanceof Error ? err : new Error(msg));
      setIsLoading(false);
    }
  }, [orderData, onSuccess, onError, onCancel, userInfo, themeColor]);

  const handleCancel = useCallback(() => {
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
  if (status === 'creating' || status === 'verifying') {
    return (
      <div className="flex items-center justify-center gap-3 py-4">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-slate-600 font-medium">
          {status === 'creating' ? 'Preparing payment...' : 'Verifying payment...'}
        </span>
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
              ₹{orderData.amount.toFixed(2)} {orderData.currency || 'INR'}
            </p>
          </div>
          <CreditCard className="w-8 h-8 text-emerald-600" />
        </div>
      </div>

      {orderData.currency !== 'USD' && (
        <label className="flex items-center gap-2 p-3 rounded-lg bg-white border border-slate-200 hover:border-emerald-300 transition-colors cursor-pointer">
          <input
            type="checkbox"
            checked={saveCard}
            onChange={(e) => setSaveCard(e.target.checked)}
            className="w-4 h-4 text-emerald-600 rounded border-slate-300"
          />
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Save className="w-4 h-4 text-emerald-500" />
            <span>
              <strong>Save card</strong> for future one-click payments
            </span>
          </div>
        </label>
      )}

      <button
        onClick={handleRazorpayClick}
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

      <p className="text-xs text-slate-500 text-center">
        Secure payment via Razorpay. You can pay using UPI, Credit/Debit Card, Net Banking, or Wallet.
      </p>
    </div>
  );
}
