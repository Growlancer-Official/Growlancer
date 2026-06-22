import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Home, Loader2, XCircle } from 'lucide-react';
import { paypalService } from '../lib/paypal';
import { ROUTES } from '../routes';

type PaymentOutcome = 'success' | 'cancel';

type PaymentStatus = 'idle' | 'processing' | 'success' | 'error' | 'canceled';

export function PaymentCallbackPage() {
  const { outcome } = useParams<{ outcome: PaymentOutcome }>();
  const location = useLocation();
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [message, setMessage] = useState<string>('Preparing payment result...');

  useEffect(() => {
    const normalizedOutcome = outcome === 'cancel' ? 'cancel' : outcome === 'success' ? 'success' : 'invalid';

    if (normalizedOutcome === 'cancel') {
      setStatus('canceled');
      setMessage('You canceled the PayPal payment. You can return to your payment flow and try again.');
      return;
    }

    if (normalizedOutcome !== 'success') {
      setStatus('error');
      setMessage('Invalid payment callback path.');
      return;
    }

    const query = new URLSearchParams(location.search);
    const paypalOrderId = query.get('token');
    const payerId = query.get('PayerID');

    if (!paypalOrderId || !payerId) {
      setStatus('error');
      setMessage('Missing PayPal return parameters. Please complete the payment from your browser or try again.');
      return;
    }

    setStatus('processing');
    setMessage('Completing your PayPal payment. This may take a moment...');

    paypalService
      .captureOrder(paypalOrderId)
      .then(() => {
        setStatus('success');
        setMessage('Your payment has been captured successfully. Thank you for using Growlancer.');
        window.history.replaceState({}, document.title, location.pathname);
      })
      .catch(error => {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Unable to complete the PayPal payment.');
        window.history.replaceState({}, document.title, location.pathname);
      });
  }, [location.pathname, location.search, outcome]);

  const content = {
    idle: {
      icon: <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />,
      title: 'Processing Payment',
      description: message,
      action: null,
    },
    processing: {
      icon: <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />,
      title: 'Processing Payment',
      description: message,
      action: null,
    },
    success: {
      icon: <CheckCircle className="w-6 h-6 text-emerald-600" />,
      title: 'Payment Completed',
      description: message,
      action: (
        <Link
          to={ROUTES.HOME}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      ),
    },
    canceled: {
      icon: <XCircle className="w-6 h-6 text-yellow-600" />,
      title: 'Payment Canceled',
      description: message,
      action: (
        <Link
          to={ROUTES.HOME}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      ),
    },
    error: {
      icon: <XCircle className="w-6 h-6 text-red-600" />,
      title: 'Payment Error',
      description: message,
      action: (
        <Link
          to={ROUTES.HOME}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Return Home
        </Link>
      ),
    },
  };

  const page = content[status] ?? content.error;

  return (
    <main className="min-h-screen bg-cream px-4 py-20">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-10 shadow-lg">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100">
            {page.icon}
          </div>
          <div>
            <h1 className="text-3xl font-display font-black text-slate-900 mb-3">{page.title}</h1>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">{page.description}</p>
          </div>
          {page.action}
        </div>
      </div>
    </main>
  );
}
